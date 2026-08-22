import { crc32 } from "node:zlib";

/**
 * Минимальный ZIP-архив без сжатия (метод «store»).
 *
 * `.pkpass` — это обычный ZIP, и складывать его нечем: в проекте нет ни одной
 * библиотеки архивации, а тянуть новую ради четырёх заголовков незачем.
 * Сжатие не нужно — внутри картинки и полкилобайта JSON.
 *
 * Время файлов зафиксировано, а не взято из часов: одни и те же данные должны
 * давать один и тот же архив, иначе тесты пришлось бы писать «примерно».
 */

export type ZipEntry = { name: string; data: Buffer };

/** 1980-01-01 — самая ранняя дата, представимая в формате ZIP. */
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;

function localHeader(entry: ZipEntry, crc: number): Buffer {
  const name = Buffer.from(entry.name, "utf8");
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); // сигнатура локального заголовка
  head.writeUInt16LE(20, 4); // нужна версия 2.0
  head.writeUInt16LE(0, 6); // флаги
  head.writeUInt16LE(0, 8); // метод: без сжатия
  head.writeUInt16LE(DOS_TIME, 10);
  head.writeUInt16LE(DOS_DATE, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(entry.data.length, 18); // сжатый размер
  head.writeUInt32LE(entry.data.length, 22); // исходный размер
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28); // extra
  return Buffer.concat([head, name]);
}

function centralHeader(entry: ZipEntry, crc: number, offset: number): Buffer {
  const name = Buffer.from(entry.name, "utf8");
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0); // сигнатура записи каталога
  head.writeUInt16LE(20, 4); // кем создан
  head.writeUInt16LE(20, 6); // нужна версия
  head.writeUInt16LE(0, 8);
  head.writeUInt16LE(0, 10);
  head.writeUInt16LE(DOS_TIME, 12);
  head.writeUInt16LE(DOS_DATE, 14);
  head.writeUInt32LE(crc, 16);
  head.writeUInt32LE(entry.data.length, 20);
  head.writeUInt32LE(entry.data.length, 24);
  head.writeUInt16LE(name.length, 28);
  head.writeUInt16LE(0, 30); // extra
  head.writeUInt16LE(0, 32); // комментарий
  head.writeUInt16LE(0, 34); // номер диска
  head.writeUInt16LE(0, 36); // внутренние атрибуты
  head.writeUInt32LE(0, 38); // внешние атрибуты
  head.writeUInt32LE(offset, 42); // смещение локального заголовка
  return Buffer.concat([head, name]);
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const crc = crc32(entry.data);
    const local = localHeader(entry, crc);
    parts.push(local, entry.data);
    central.push(centralHeader(entry, crc, offset));
    offset += local.length + entry.data.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // конец центрального каталога
  end.writeUInt16LE(0, 4); // номер диска
  end.writeUInt16LE(0, 6); // диск с каталогом
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // комментарий архива

  return Buffer.concat([...parts, directory, end]);
}
