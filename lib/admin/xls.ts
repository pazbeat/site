/**
 * Чтение старого Excel (.xls, BIFF8 внутри OLE2) — без внешних зависимостей.
 *
 * Зачем это вообще. ForteBank отдаёт «Выписку по коммерсанту» именно в этом
 * формате: файл начинается с сигнатуры `D0 CF 11 E0` — это не ZIP, а составной
 * документ OLE2, и ExcelJS такой файл не открывает вовсе (он умеет только
 * .xlsx). То есть без этого модуля сверка по Forte не работала бы ни на одном
 * настоящем файле, а сообщение об ошибке звучало бы как «не нашлось ни одной
 * строки» — самый неинформативный из возможных ответов.
 *
 * Почему свой разбор, а не библиотека: единственная живая реализация (SheetJS)
 * распространяется не через npm, а тарболом со своего CDN, и попадала бы в
 * `npm ci` при каждой сборке на сервере. Формат же нужен нам в узкой части —
 * значения ячеек одного листа, — и она стабильна с 1998 года.
 *
 * Разбираем ровно столько, сколько нужно для выписки: строки, числа, даты.
 * Формулы берём по закэшированному значению — банк их и не пишет.
 */

/** Разумные потолки: файл приходит извне, зацикливаться на нём нельзя. */
const MAX_SECTORS = 1_000_000;
const MAX_CELLS = 500_000;

// ─── OLE2 (составной документ) ───────────────────────────────────────────────

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const END_OF_CHAIN = 0xfffffffe;

export function isXlsBuffer(buffer: Buffer): boolean {
  return (
    buffer.length > 8 && OLE_SIGNATURE.every((b, i) => buffer[i] === b)
  );
}

type Ole = { stream(name: string): Buffer | null };

/**
 * Имя потока в каталоге OLE у служебных записей начинается с управляющего
 * символа (например `\x05SummaryInformation`). Отбрасываем непечатное, иначе
 * «Workbook» никогда не совпадёт с искомым именем.
 */
function printableName(raw: string): string {
  let out = "";
  for (const ch of raw) if (ch.charCodeAt(0) >= 32) out += ch;
  return out;
}

function readOle(buffer: Buffer): Ole {
  if (!isXlsBuffer(buffer)) throw new Error("Это не файл .xls");

  const sectorSize = 1 << buffer.readUInt16LE(0x1e);
  const miniSectorSize = 1 << buffer.readUInt16LE(0x20);
  const fatCount = buffer.readUInt32LE(0x2c);
  const dirStart = buffer.readUInt32LE(0x30);
  const miniCutoff = buffer.readUInt32LE(0x38);
  const miniFatStart = buffer.readUInt32LE(0x3c);
  const difatStart = buffer.readUInt32LE(0x44);

  if (sectorSize < 128 || sectorSize > 1 << 20) {
    throw new Error("Неизвестный размер сектора в файле .xls");
  }
  const offsetOf = (sector: number) => 512 + sector * sectorSize;
  const perSector = sectorSize / 4;

  // DIFAT: 109 ссылок в заголовке, остальные — цепочкой по секторам.
  const difat: number[] = [];
  for (let i = 0; i < 109; i += 1) difat.push(buffer.readUInt32LE(0x4c + i * 4));
  let next = difatStart;
  let guard = 0;
  while (next < END_OF_CHAIN && guard < MAX_SECTORS) {
    const base = offsetOf(next);
    if (base + sectorSize > buffer.length) break;
    for (let i = 0; i < perSector - 1; i += 1) {
      difat.push(buffer.readUInt32LE(base + i * 4));
    }
    next = buffer.readUInt32LE(base + (perSector - 1) * 4);
    guard += 1;
  }

  const fat: number[] = [];
  for (const sector of difat.slice(0, Math.max(fatCount, 0))) {
    if (sector >= END_OF_CHAIN) continue;
    const base = offsetOf(sector);
    if (base + sectorSize > buffer.length) continue;
    for (let i = 0; i < perSector; i += 1) {
      fat.push(buffer.readUInt32LE(base + i * 4));
    }
  }

  const chainOf = (start: number, table: number[]): number[] => {
    const out: number[] = [];
    let cur = start;
    while (cur < END_OF_CHAIN && out.length < MAX_SECTORS) {
      out.push(cur);
      const step = table[cur];
      if (step === undefined) break;
      cur = step;
    }
    return out;
  };

  const readChain = (start: number, size: number): Buffer => {
    const parts: Buffer[] = [];
    for (const sector of chainOf(start, fat)) {
      const base = offsetOf(sector);
      if (base >= buffer.length) break;
      parts.push(buffer.subarray(base, Math.min(base + sectorSize, buffer.length)));
    }
    const joined = Buffer.concat(parts);
    return size > 0 && size < joined.length ? joined.subarray(0, size) : joined;
  };

  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  const dirBytes = readChain(dirStart, 0);
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const nameLength = dirBytes.readUInt16LE(off + 0x40);
    const type = dirBytes[off + 0x42];
    if (type !== 1 && type !== 2 && type !== 5) continue;
    const name = dirBytes
      .subarray(off, off + Math.max(0, nameLength - 2))
      .toString("utf16le");
    entries.push({
      name,
      type,
      start: dirBytes.readUInt32LE(off + 0x74),
      // 8 байт, но потоки такого размера нам не встретятся — берём младшие 4.
      size: dirBytes.readUInt32LE(off + 0x78),
    });
  }

  const root = entries.find((e) => e.type === 5);
  const miniStream = root && root.size > 0 ? readChain(root.start, root.size) : Buffer.alloc(0);
  const miniFat: number[] = [];
  if (miniFatStart < END_OF_CHAIN) {
    const bytes = readChain(miniFatStart, 0);
    for (let i = 0; i + 4 <= bytes.length; i += 4) miniFat.push(bytes.readUInt32LE(i));
  }
  const readMini = (start: number, size: number): Buffer => {
    const parts: Buffer[] = [];
    for (const sector of chainOf(start, miniFat)) {
      const base = sector * miniSectorSize;
      if (base >= miniStream.length) break;
      parts.push(miniStream.subarray(base, base + miniSectorSize));
    }
    return Buffer.concat(parts).subarray(0, size);
  };

  return {
    stream(name: string) {
      const entry = entries.find(
        (e) => e.type === 2 && printableName(e.name) === name,
      );
      if (!entry) return null;
      return entry.size < miniCutoff
        ? readMini(entry.start, entry.size)
        : readChain(entry.start, entry.size);
    },
  };
}

// ─── BIFF8 (содержимое книги) ────────────────────────────────────────────────

const REC = {
  FORMULA: 0x0006,
  EOF: 0x000a,
  DATEMODE: 0x0022,
  CONTINUE: 0x003c,
  BOF: 0x0809,
  MULRK: 0x00bd,
  SST: 0x00fc,
  LABELSST: 0x00fd,
  XF: 0x00e0,
  FORMAT: 0x041e,
  NUMBER: 0x0203,
  LABEL: 0x0204,
  BOOLERR: 0x0205,
  STRING: 0x0207,
  RK: 0x027e,
} as const;

type Record_ = { id: number; body: Buffer; continues: Buffer[] };

function readRecords(stream: Buffer): Record_[] {
  const out: Record_[] = [];
  let pos = 0;
  while (pos + 4 <= stream.length) {
    const id = stream.readUInt16LE(pos);
    const length = stream.readUInt16LE(pos + 2);
    const body = stream.subarray(pos + 4, pos + 4 + length);
    pos += 4 + length;
    if (id === REC.CONTINUE && out.length > 0) {
      out[out.length - 1].continues.push(body);
      continue;
    }
    out.push({ id, body, continues: [] });
  }
  return out;
}

/**
 * Строка BIFF8: длина, флаги, потом символы — узкие (Latin-1) или широкие
 * (UTF-16LE). Через границу CONTINUE флаг ширины объявляется заново, поэтому
 * читаем по сегментам, а не по склеенному буферу: склейка молча ломает
 * кириллицу на длинных выписках.
 */
class StringReader {
  private segment = 0;
  private offset = 0;

  constructor(
    private readonly segments: Buffer[],
    startOffset: number,
  ) {
    this.offset = startOffset;
  }

  private get buffer(): Buffer {
    return this.segments[this.segment] ?? Buffer.alloc(0);
  }

  private ensure(bytes: number): boolean {
    while (this.segment < this.segments.length) {
      if (this.offset + bytes <= this.buffer.length) return true;
      if (this.offset >= this.buffer.length) {
        this.segment += 1;
        this.offset = 0;
        continue;
      }
      return false;
    }
    return false;
  }

  done(): boolean {
    return !this.ensure(1);
  }

  read(): string | null {
    if (!this.ensure(3)) return null;
    const charCount = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    const flags = this.buffer[this.offset];
    this.offset += 1;

    let runs = 0;
    let extra = 0;
    if (flags & 0x08) {
      if (!this.ensure(2)) return null;
      runs = this.buffer.readUInt16LE(this.offset);
      this.offset += 2;
    }
    if (flags & 0x04) {
      if (!this.ensure(4)) return null;
      extra = this.buffer.readUInt32LE(this.offset);
      this.offset += 4;
    }

    let wide = (flags & 0x01) === 1;
    let remaining = charCount;
    let text = "";
    while (remaining > 0) {
      if (this.offset >= this.buffer.length) {
        this.segment += 1;
        if (this.segment >= this.segments.length) break;
        this.offset = 0;
        // Первый байт продолжения — заново объявленная ширина символов.
        wide = (this.buffer[this.offset] & 0x01) === 1;
        this.offset += 1;
      }
      const available = this.buffer.length - this.offset;
      if (available <= 0) continue;
      const take = wide
        ? Math.min(remaining, Math.floor(available / 2))
        : Math.min(remaining, available);
      if (take <= 0) {
        this.offset = this.buffer.length;
        continue;
      }
      const slice = this.buffer.subarray(
        this.offset,
        this.offset + (wide ? take * 2 : take),
      );
      text += wide ? slice.toString("utf16le") : slice.toString("latin1");
      this.offset += wide ? take * 2 : take;
      remaining -= take;
    }

    // Хвосты форматирования пропускаем, они могут уходить в следующий сегмент.
    let skip = runs * 4 + extra;
    while (skip > 0 && this.segment < this.segments.length) {
      const available = this.buffer.length - this.offset;
      if (available <= 0) {
        this.segment += 1;
        this.offset = 0;
        continue;
      }
      const step = Math.min(skip, available);
      this.offset += step;
      skip -= step;
    }
    return text;
  }
}

/** RK — упакованное число: целое или double со срезанной младшей половиной. */
export function decodeRk(rk: number): number {
  const isInteger = (rk & 2) !== 0;
  let value: number;
  if (isInteger) {
    value = rk >> 2; // арифметический сдвиг: число знаковое
  } else {
    const bytes = Buffer.alloc(8);
    bytes.writeUInt32LE(rk & 0xfffffffc, 4);
    value = bytes.readDoubleLE(0);
  }
  return (rk & 1) !== 0 ? value / 100 : value;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Похож ли формат ячейки на дату: буквы d/m/y/h/s вне кавычек. */
function looksLikeDateFormat(format: string): boolean {
  const withoutLiterals = format
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "");
  return /[dmyhs]/i.test(withoutLiterals);
}

/**
 * Серийный номер Excel → дата. 1900-я система с её несуществующим 29 февраля:
 * до 61-го дня отсчёт сдвинут на сутки. Для выписок это математика ради
 * порядка — реальные даты давно за 40000, — но ошибаться на сутки нельзя.
 */
export function excelSerialToDate(serial: number, date1904 = false): Date {
  if (date1904) {
    return new Date(Date.UTC(1904, 0, 1) + serial * 86_400_000);
  }
  const epoch = serial >= 61 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31);
  return new Date(epoch + serial * 86_400_000);
}

function formatDate(date: Date, withTime: boolean): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
  if (!withTime) return day;
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/**
 * Значения первого листа как таблица строк.
 *
 * Числа возвращаем без округления и без разделителей — их разберёт
 * `parseAmount`; даты приводим к «дд.мм.гггг чч:мм:сс», к тому же виду, в
 * котором их пишет сам банк, чтобы дальше был один путь разбора.
 */
export function readXls(buffer: Buffer): string[][] {
  const ole = readOle(buffer);
  const stream = ole.stream("Workbook") ?? ole.stream("Book");
  if (!stream) throw new Error("В файле .xls не нашлось листа");

  const records = readRecords(stream);

  // Общая таблица строк книги.
  const sst: string[] = [];
  const sstRecord = records.find((r) => r.id === REC.SST);
  if (sstRecord) {
    const total = sstRecord.body.length >= 8 ? sstRecord.body.readUInt32LE(4) : 0;
    const reader = new StringReader([sstRecord.body, ...sstRecord.continues], 8);
    while (sst.length < total && !reader.done()) {
      const value = reader.read();
      if (value === null) break;
      sst.push(value);
    }
  }

  // Форматы ячеек — только чтобы отличить дату от числа.
  const formats = new Map<number, string>();
  for (const record of records) {
    if (record.id !== REC.FORMAT || record.body.length < 3) continue;
    const index = record.body.readUInt16LE(0);
    const reader = new StringReader([record.body, ...record.continues], 2);
    const text = reader.read();
    if (text !== null) formats.set(index, text);
  }
  const xfFormats: number[] = [];
  for (const record of records) {
    if (record.id !== REC.XF || record.body.length < 4) continue;
    xfFormats.push(record.body.readUInt16LE(2));
  }
  const date1904 =
    records.find((r) => r.id === REC.DATEMODE)?.body.readUInt16LE(0) === 1;

  const isDateXf = (xf: number): { date: boolean; time: boolean } => {
    const ifmt = xfFormats[xf];
    if (ifmt === undefined) return { date: false, time: false };
    const custom = formats.get(ifmt);
    if (custom) {
      return {
        date: looksLikeDateFormat(custom),
        time: /[hs]/i.test(custom.replace(/"[^"]*"/g, "")),
      };
    }
    return {
      date: BUILTIN_DATE_FORMATS.has(ifmt),
      time: ifmt >= 18 && ifmt <= 22,
    };
  };

  // Только первый лист: у выписок он единственный, а последующие BOF/EOF
  // ведут в другие листы, где та же строка означала бы уже другое.
  const table: string[][] = [];
  let cells = 0;
  let sheet = -1;
  const put = (row: number, col: number, value: string) => {
    if (cells > MAX_CELLS) return;
    cells += 1;
    if (!table[row]) table[row] = [];
    table[row][col] = value;
  };

  for (const record of records) {
    if (record.id === REC.BOF) {
      sheet += 1;
      continue;
    }
    if (sheet !== 1) {
      // 0 — сама книга (глобальные записи), 1 — первый лист.
      if (sheet > 1) break;
      continue;
    }
    const body = record.body;
    switch (record.id) {
      case REC.LABELSST: {
        if (body.length < 10) break;
        const index = body.readUInt32LE(6);
        put(body.readUInt16LE(0), body.readUInt16LE(2), sst[index] ?? "");
        break;
      }
      case REC.LABEL: {
        if (body.length < 9) break;
        const reader = new StringReader([body, ...record.continues], 6);
        put(body.readUInt16LE(0), body.readUInt16LE(2), reader.read() ?? "");
        break;
      }
      case REC.NUMBER: {
        if (body.length < 14) break;
        const xf = body.readUInt16LE(4);
        const value = body.readDoubleLE(6);
        const kind = isDateXf(xf);
        put(
          body.readUInt16LE(0),
          body.readUInt16LE(2),
          kind.date
            ? formatDate(excelSerialToDate(value, date1904), kind.time)
            : String(value),
        );
        break;
      }
      case REC.RK: {
        if (body.length < 10) break;
        const xf = body.readUInt16LE(4);
        const value = decodeRk(body.readInt32LE(6));
        const kind = isDateXf(xf);
        put(
          body.readUInt16LE(0),
          body.readUInt16LE(2),
          kind.date
            ? formatDate(excelSerialToDate(value, date1904), kind.time)
            : String(value),
        );
        break;
      }
      case REC.MULRK: {
        if (body.length < 6) break;
        const row = body.readUInt16LE(0);
        const first = body.readUInt16LE(2);
        const count = Math.floor((body.length - 6) / 6);
        for (let i = 0; i < count; i += 1) {
          const xf = body.readUInt16LE(4 + i * 6);
          const value = decodeRk(body.readInt32LE(4 + i * 6 + 2));
          const kind = isDateXf(xf);
          put(
            row,
            first + i,
            kind.date
              ? formatDate(excelSerialToDate(value, date1904), kind.time)
              : String(value),
          );
        }
        break;
      }
      case REC.FORMULA: {
        // Закэшированный результат: число — в теле, строка — в следующем
        // STRING. Банк формул не пишет, но чужой файл открыть всё же лучше.
        if (body.length < 14) break;
        const marker = body.readUInt16LE(12);
        if (marker !== 0xffff) {
          put(
            body.readUInt16LE(0),
            body.readUInt16LE(2),
            String(body.readDoubleLE(6)),
          );
        }
        break;
      }
      default:
        break;
    }
  }

  const width = table.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
  return table.map((row) => {
    const filled: string[] = [];
    for (let i = 0; i < width; i += 1) filled.push((row?.[i] ?? "").trim());
    return filled;
  });
}
