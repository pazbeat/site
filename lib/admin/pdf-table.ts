import { inflateSync } from "node:zlib";

/**
 * Чтение таблицы из PDF — для выписки Kaspi.
 *
 * Kaspi отдаёт «Детальную информацию по операциям» только печатным документом:
 * это HTML, прогнанный через wkhtmltopdf. Таблицы в PDF нет — есть буквы с
 * координатами, поэтому колонки восстанавливаем по положению: строки
 * собираются по вертикали, ячейки — по горизонтали, а имена колонок берём из
 * шапки и по ней же раскладываем данные.
 *
 * Две вещи, на которых этот разбор чуть не сломался и которые здесь решены
 * явно:
 *
 * 1. `ToUnicode` в этих файлах записан РЕДКОЙ формой `bfrange` со списком
 *    назначений — `<0001> <0040> [<0032> <0030> …]`. Наивный разбор читает
 *    третий токен как начало диапазона и выдаёт связный мусор: вместо цифр
 *    идут `5 6 7 8`, а вместо кириллицы — латиница. Мусор именно связный,
 *    поэтому он не выглядит как ошибка — суммы «читаются», просто неверно.
 *    Встроенный шрифт здесь подрезан и таблицы `cmap` не содержит, так что
 *    другого источника соответствия нет: разбирать обе формы обязательно.
 *
 * 2. Одна логическая строка занимает несколько печатных: адрес филиала стоит
 *    ВЫШЕ даты, а двадцатизначный номер заказа разорван переносом на 13+7
 *    цифр. Поэтому строки группируются в записи по вертикальным промежуткам,
 *    а ячейки внутри записи склеиваются по колонке.
 */

const MAX_ITEMS = 200_000;

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

// ─── Объекты и потоки ────────────────────────────────────────────────────────

type Dict = string;

function inflate(raw: Buffer): Buffer | null {
  try {
    return inflateSync(raw);
  } catch {
    // Некоторые генераторы оставляют мусор после потока — пробуем поштучно
    // отрезать хвост, это дешевле, чем терять весь документ.
    for (const cut of [1, 2, 3]) {
      try {
        return inflateSync(raw.subarray(0, raw.length - cut));
      } catch {
        /* пробуем дальше */
      }
    }
    return null;
  }
}

type PdfObject = { dict: Dict; stream: Buffer | null };

function scanObjects(buffer: Buffer): Map<number, PdfObject> {
  const text = buffer.toString("latin1");
  const objects = new Map<number, PdfObject>();
  const re = /(?:^|[\r\n>\]\s])(\d+)\s+\d+\s+obj/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const number = Number(match[1]);
    const start = match.index + match[0].length;
    const end = text.indexOf("endobj", start);
    if (end < 0) continue;
    const body = text.slice(start, end);
    const streamAt = body.indexOf("stream");
    let stream: Buffer | null = null;
    let dict = body;
    if (streamAt >= 0) {
      dict = body.slice(0, streamAt);
      let from = start + streamAt + "stream".length;
      if (text[from] === "\r") from += 1;
      if (text[from] === "\n") from += 1;
      const streamEnd = text.indexOf("endstream", from);
      if (streamEnd > 0) {
        const raw = buffer.subarray(from, streamEnd);
        stream = /\/FlateDecode/.test(dict) ? inflate(raw) : raw;
      }
    }
    objects.set(number, { dict, stream });
  }

  // Объекты, спрятанные в сжатых контейнерах (/ObjStm) — так пишут более
  // новые генераторы; без этого у них не находится ни одной страницы.
  for (const [, object] of [...objects]) {
    if (!/\/Type\s*\/ObjStm/.test(object.dict) || !object.stream) continue;
    const count = Number(/\/N\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
    const header = object.stream.subarray(0, first).toString("latin1");
    const numbers = header.trim().split(/\s+/).map(Number);
    const body = object.stream.subarray(first).toString("latin1");
    for (let i = 0; i < count; i += 1) {
      const number = numbers[i * 2];
      const offset = numbers[i * 2 + 1];
      if (!Number.isFinite(number) || !Number.isFinite(offset)) continue;
      const next = i + 1 < count ? numbers[i * 2 + 3] : body.length;
      if (objects.has(number)) continue;
      objects.set(number, { dict: body.slice(offset, next), stream: null });
    }
  }
  return objects;
}

function resolve(objects: Map<number, PdfObject>, value: string): PdfObject | null {
  const ref = /^\s*(\d+)\s+\d+\s+R/.exec(value);
  return ref ? (objects.get(Number(ref[1])) ?? null) : null;
}

// ─── ToUnicode ───────────────────────────────────────────────────────────────

type Font = {
  map: Map<number, string>;
  twoByte: boolean;
  /** Ширины глифов в тысячных em — из них считается, где кончается буква. */
  widths: Map<number, number>;
  defaultWidth: number;
};

/**
 * Ширины глифов из `/W` составного шрифта.
 *
 * Без них положение конца слова приходится угадывать по среднему шагу букв, а
 * это ровно та угадайка, из-за которой «Дата» превращалась в «Д ата», а
 * «Возврат наличными» — в «Возвратналичными». В документе ширины есть; берём
 * их и считаем пробелы точно.
 *
 * Две формы записи: `c [w1 w2 …]` — подряд от кода c, и `cПервый cПоследний w`
 * — одна ширина на диапазон.
 */
function parseWidths(source: string): Map<number, number> {
  const widths = new Map<number, number>();
  const block = /\/W\s*\[([\s\S]*?)\]\s*(?:\/|>>)/.exec(source)?.[1];
  if (!block) return widths;

  const tokens = block.matchAll(/(\d+(?:\.\d+)?)|\[([^\]]*)\]/g);
  const pending: number[] = [];
  for (const [, number, list] of tokens) {
    if (list !== undefined) {
      const start = pending.pop();
      if (start === undefined) continue;
      let cid = start;
      for (const [, value] of list.matchAll(/(-?\d+(?:\.\d+)?)/g)) {
        widths.set(cid, Number(value));
        cid += 1;
      }
      pending.length = 0;
      continue;
    }
    pending.push(Number(number));
    if (pending.length === 3) {
      const [first, last, width] = pending;
      // Диапазон бывает и во всю кодировку — ставим потолок, чтобы чужой файл
      // не заставил нас заполнять миллионы ключей.
      for (let cid = first; cid <= Math.min(last, first + 65_535); cid += 1) {
        widths.set(cid, width);
      }
      pending.length = 0;
    }
  }
  return widths;
}

export function parseCMap(source: string): Omit<Font, "widths" | "defaultWidth"> {
  const map = new Map<number, string>();
  const hexToText = (hex: string) => {
    let out = "";
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    }
    if (hex.length === 2) out = String.fromCharCode(parseInt(hex, 16));
    return out;
  };

  for (const block of source.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    const pairs = block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
    for (const [, from, to] of pairs) map.set(parseInt(from, 16), hexToText(to));
  }

  for (const block of source.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    const entries = block.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:\[([\s\S]*?)\]|<([0-9A-Fa-f]+)>)/g,
    );
    for (const [, lowHex, highHex, list, singleHex] of entries) {
      const low = parseInt(lowHex, 16);
      const high = parseInt(highHex, 16);
      if (list !== undefined) {
        // Форма со списком: каждому коду — своё значение по порядку.
        let index = 0;
        for (const [, hex] of list.matchAll(/<([0-9A-Fa-f]+)>/g)) {
          map.set(low + index, hexToText(hex));
          index += 1;
        }
      } else if (singleHex !== undefined) {
        const start = parseInt(singleHex, 16);
        const span = Math.min(high - low, 65_535);
        for (let i = 0; i <= span; i += 1) {
          map.set(low + i, String.fromCharCode(start + i));
        }
      }
    }
  }

  const codespace = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(source);
  const width = codespace
    ? /<([0-9A-Fa-f]+)>/.exec(codespace[1])?.[1].length ?? 4
    : 4;
  return { map, twoByte: width >= 4 };
}

// ─── Разбор содержимого страницы ─────────────────────────────────────────────

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

export type TextItem = {
  x: number;
  y: number;
  size: number;
  /** Ширина фрагмента в тех же единицах, что и x — из ширин глифов шрифта. */
  width: number;
  text: string;
};

/** Разбирает литеральную строку PDF `( … )` с её экранированием. */
function decodeLiteral(source: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch !== "\\") {
      out.push(source.charCodeAt(i));
      continue;
    }
    const next = source[i + 1];
    i += 1;
    const simple: Record<string, number> = {
      n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92,
    };
    if (next in simple) {
      out.push(simple[next]);
    } else if (next >= "0" && next <= "7") {
      let digits = next;
      while (digits.length < 3 && source[i + 1] >= "0" && source[i + 1] <= "7") {
        digits += source[i + 1];
        i += 1;
      }
      out.push(parseInt(digits, 8));
    } else if (next === "\n") {
      /* перенос внутри строки — ничего не добавляет */
    } else {
      out.push(source.charCodeAt(i));
    }
  }
  return out;
}

/** Текст и его ширина в тысячных em — вторая нужна, чтобы найти конец слова. */
function decodeText(
  codes: number[],
  font: Font | undefined,
): { text: string; width: number } {
  if (!font) {
    const text = codes.map((c) => String.fromCharCode(c)).join("");
    return { text, width: text.length * 500 };
  }
  let text = "";
  let width = 0;
  const add = (cid: number, glyph: string) => {
    text += glyph;
    width += font.widths.get(cid) ?? font.defaultWidth;
  };
  if (font.twoByte) {
    for (let i = 0; i + 1 < codes.length; i += 2) {
      const cid = (codes[i] << 8) | codes[i + 1];
      add(cid, font.map.get(cid) ?? "");
    }
  } else {
    for (const code of codes) {
      add(code, font.map.get(code) ?? String.fromCharCode(code));
    }
  }
  return { text, width };
}

function readPageItems(content: string, fonts: Map<string, Font>): TextItem[] {
  const items: TextItem[] = [];
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let leading = 0;
  let fontSize = 0;
  let font: Font | undefined;

  // Лексер: числа, имена, строки, массивы, операторы. Группы нумерованные —
  // именованные не поддерживает цель компиляции проекта.
  const tokens = content.matchAll(
    /(-?\d*\.?\d+)|\/([^\s/<>[\]()]+)|\(((?:\\.|[^\\()])*)\)|<([0-9A-Fa-f\s]*)>|(\[)|(\])|([A-Za-z'"*]+)/g,
  );

  // Операнды помечаем видом, а не угадываем по содержимому: имя `/F8` и
  // расшифрованный текст «/» внешне неразличимы, и попытка отличить их по
  // ведущему слэшу молча съедала косую черту в адресах вроде «40/5».
  type Operand =
    | { kind: "num"; value: number }
    | { kind: "str"; value: string; width: number }
    | { kind: "name"; value: string }
    | { kind: "array"; value: Operand[] };

  let operands: Operand[] = [];
  let array: Operand[] | null = null;

  const show = (parts: Operand[]) => {
    let text = "";
    let millis = 0;
    for (const part of parts) {
      if (part.kind === "num") {
        // Число внутри TJ сдвигает следующий глиф влево на тысячные em.
        millis -= part.value;
        if (part.value <= -180) text += " ";
        continue;
      }
      if (part.kind === "str") {
        text += part.value;
        millis += part.width;
      }
    }
    if (!text.trim()) return;
    const trm = multiply(tm, ctm);
    const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
    if (items.length < MAX_ITEMS) {
      items.push({
        x: trm[4],
        y: trm[5],
        size: fontSize * scale,
        width: Math.abs((millis / 1000) * fontSize * trm[0]),
        text,
      });
    }
  };

  for (const token of tokens) {
    const [, num, name, literalText, hexText, open, close, operator] = token;
    const push = (operand: Operand) => {
      if (array) array.push(operand);
      else operands.push(operand);
    };

    if (num !== undefined) {
      push({ kind: "num", value: Number(num) });
      continue;
    }
    if (name !== undefined) {
      push({ kind: "name", value: name });
      continue;
    }
    if (literalText !== undefined) {
      const literal = decodeText(decodeLiteral(literalText), font);
      push({ kind: "str", value: literal.text, width: literal.width });
      continue;
    }
    if (hexText !== undefined) {
      const hex = hexText.replace(/\s+/g, "");
      const codes: number[] = [];
      for (let i = 0; i + 1 < hex.length; i += 2) {
        codes.push(parseInt(hex.slice(i, i + 2), 16));
      }
      const decoded = decodeText(codes, font);
      push({ kind: "str", value: decoded.text, width: decoded.width });
      continue;
    }
    if (open !== undefined) {
      array = [];
      continue;
    }
    if (close !== undefined) {
      const value = array ?? [];
      array = null;
      operands.push({ kind: "array", value });
      continue;
    }

    const op = operator!;
    const nums = operands
      .filter((v) => v.kind === "num")
      .map((v) => (v as { value: number }).value);
    switch (op) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? IDENTITY;
        break;
      case "cm":
        if (nums.length >= 6) ctm = multiply(nums.slice(-6) as Matrix, ctm);
        break;
      case "BT":
        tm = IDENTITY;
        tlm = IDENTITY;
        break;
      case "Tf": {
        const name = operands.find((v) => v.kind === "name");
        if (name) font = fonts.get((name as { value: string }).value);
        fontSize = nums[nums.length - 1] ?? fontSize;
        break;
      }
      case "TL":
        leading = nums[nums.length - 1] ?? leading;
        break;
      case "Tm":
        if (nums.length >= 6) {
          tm = nums.slice(-6) as Matrix;
          tlm = tm;
        }
        break;
      case "TD":
        if (nums.length >= 2) leading = -nums[nums.length - 1];
      // намеренно проваливаемся в Td
      case "Td":
        if (nums.length >= 2) {
          tlm = multiply(
            [1, 0, 0, 1, nums[nums.length - 2], nums[nums.length - 1]],
            tlm,
          );
          tm = tlm;
        }
        break;
      case "T*":
        tlm = multiply([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm;
        break;
      case "Tj":
      case "'":
      case '"': {
        if (op !== "Tj") {
          tlm = multiply([1, 0, 0, 1, 0, -leading], tlm);
          tm = tlm;
        }
        show(operands.filter((v) => v.kind === "str"));
        break;
      }
      case "TJ": {
        const parts = operands.find((v) => v.kind === "array");
        if (parts) show((parts as { value: Operand[] }).value);
        break;
      }
      default:
        break;
    }
    operands = [];
  }
  return items;
}

/** Текстовые фрагменты всех страниц документа, в порядке страниц. */
export function extractPdfItems(buffer: Buffer): TextItem[][] {
  const objects = scanObjects(buffer);
  const pages: TextItem[][] = [];

  for (const [, object] of objects) {
    if (!/\/Type\s*\/Page[^s]/.test(object.dict)) continue;

    const fonts = new Map<string, Font>();
    const resourcesRaw = /\/Resources\s*([\s\S]*?)(?:\/Annots|\/MediaBox|>>\s*$)/.exec(
      object.dict,
    );
    const resources = resourcesRaw
      ? resolve(objects, resourcesRaw[1])?.dict ?? resourcesRaw[1]
      : "";
    const fontBlock = /\/Font\s*<<([\s\S]*?)>>/.exec(resources);
    if (fontBlock) {
      for (const [, name, ref] of fontBlock[1].matchAll(
        /\/([^\s/]+)\s+(\d+\s+\d+\s+R)/g,
      )) {
        const fontObject = resolve(objects, ref);
        const toUnicode = fontObject
          ? /\/ToUnicode\s+(\d+\s+\d+\s+R)/.exec(fontObject.dict)
          : null;
        const cmapObject = toUnicode ? resolve(objects, toUnicode[1]) : null;
        if (!cmapObject?.stream || !fontObject) continue;

        // Ширины лежат не в самом шрифте, а в его потомке (CIDFont).
        const descendantRef = /\/DescendantFonts\s*\[?\s*(\d+\s+\d+\s+R)/.exec(
          fontObject.dict,
        );
        const descendant = descendantRef
          ? resolve(objects, descendantRef[1])
          : null;
        const source = descendant?.dict ?? fontObject.dict;
        fonts.set(name, {
          ...parseCMap(cmapObject.stream.toString("latin1")),
          widths: parseWidths(source),
          defaultWidth: Number(/\/DW\s+(\d+)/.exec(source)?.[1] ?? 1000),
        });
      }
    }

    const contents = /\/Contents\s+(\d+\s+\d+\s+R)/.exec(object.dict);
    const streams: Buffer[] = [];
    if (contents) {
      const target = resolve(objects, contents[1]);
      if (target?.stream) streams.push(target.stream);
    } else {
      // Массив ссылок на несколько потоков.
      const array = /\/Contents\s*\[([\s\S]*?)\]/.exec(object.dict);
      for (const [, ref] of array?.[1].matchAll(/(\d+\s+\d+\s+R)/g) ?? []) {
        const target = resolve(objects, ref);
        if (target?.stream) streams.push(target.stream);
      }
    }
    if (streams.length === 0) continue;
    pages.push(
      readPageItems(Buffer.concat(streams).toString("latin1"), fonts),
    );
  }
  return pages;
}

// ─── Из букв — в таблицу ─────────────────────────────────────────────────────

export type Cell = { x: number; center: number; text: string };
export type Line = { y: number; cells: Cell[] };

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Буквы → строки → ячейки: соседние фрагменты склеиваются, далёкие — нет. */
export function buildLines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  let current: TextItem[] = [];
  let currentY = Number.NaN;

  const flush = () => {
    if (current.length === 0) return;
    const parts = [...current].sort((a, b) => a.x - b.x);

    // Ширина фрагмента известна точно, поэтому «где кончилась буква» — не
    // оценка, а факт: пустота считается от конца предыдущего глифа.
    // Пробел в этих шрифтах — около трети кегля, промежуток между колонками —
    // в разы больше; между ними и проходит граница.
    const cells: Cell[] = [];
    let text = "";
    let startX = parts[0].x;
    let endX = parts[0].x;
    for (const part of parts) {
      const size = part.size || 8;
      const gap = part.x - endX;
      if (text && gap > size * 1.2) {
        cells.push({ x: startX, center: (startX + endX) / 2, text: text.trim() });
        text = "";
        startX = part.x;
      } else if (text && gap > size * 0.12) {
        text += " ";
      }
      text += part.text;
      endX = Math.max(endX, part.x + part.width);
    }
    if (text.trim()) {
      cells.push({ x: startX, center: (startX + endX) / 2, text: text.trim() });
    }
    lines.push({ y: currentY, cells });
    current = [];
  };

  for (const item of sorted) {
    const height = item.size || 8;
    if (current.length > 0 && Math.abs(currentY - item.y) > height * 0.5) flush();
    if (current.length === 0) currentY = item.y;
    current.push(item);
  }
  flush();
  return lines;
}

/**
 * Строки → записи. Одна запись занимает несколько печатных строк, и её границу
 * задаёт увеличенный вертикальный промежуток.
 */
export function groupBlocks(lines: Line[]): Line[][] {
  if (lines.length === 0) return [];
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i += 1) gaps.push(lines[i - 1].y - lines[i].y);
  const step = median(gaps.filter((g) => g > 0)) || 1;
  const threshold = step * 1.7;

  const blocks: Line[][] = [[lines[0]]];
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i - 1].y - lines[i].y > threshold) blocks.push([]);
    blocks[blocks.length - 1].push(lines[i]);
  }
  return blocks;
}

/**
 * Блоки → таблица: имена колонок из шапки, значения — по ближайшей колонке.
 *
 * Колонку определяем по горизонтальному центру ячейки, а не по левому краю:
 * в этих отчётах и шапка, и значения выключены по центру, и левый край
 * «29750.00» стоит совсем не там, где левый край слова «Сумма».
 *
 * Что считать шапкой, решает вызывающий: здесь мы про банки ничего не знаем,
 * а подсказки про «дату» и «сумму» живут в разборе выписки.
 */
export function pdfToTable(
  buffer: Buffer,
  isHeader: (texts: string[]) => boolean,
): { columns: string[]; rows: Record<string, string>[] } {
  for (const items of extractPdfItems(buffer)) {
    const blocks = groupBlocks(buildLines(items));
    const headerIndex = blocks.findIndex((block) =>
      isHeader(block.flatMap((line) => line.cells.map((cell) => cell.text))),
    );
    if (headerIndex < 0) continue;

    // Колонки шапки: ячейки с близкими центрами — одна колонка, её имя
    // складывается сверху вниз («Стоимость» + «услуг Kaspi»).
    const headerCells = blocks[headerIndex].flatMap((line) => line.cells);
    const sorted = [...headerCells].sort((a, b) => a.center - b.center);
    const groups: Cell[][] = [];
    for (const cell of sorted) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(cell.center - last[0].center) < 20) last.push(cell);
      else groups.push([cell]);
    }
    const columns = groups.map((group) => {
      const order = new Map(headerCells.map((cell, index) => [cell, index]));
      return [...group]
        .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
        .map((cell) => cell.text)
        .join(" ")
        .trim();
    });
    const centers = groups.map(
      (group) => group.reduce((sum, cell) => sum + cell.center, 0) / group.length,
    );

    const rows: Record<string, string>[] = [];
    for (const block of blocks.slice(headerIndex + 1)) {
      const row: Record<string, string> = {};
      for (const line of block) {
        for (const cell of line.cells) {
          let best = 0;
          for (let i = 1; i < centers.length; i += 1) {
            if (
              Math.abs(cell.center - centers[i]) <
              Math.abs(cell.center - centers[best])
            ) {
              best = i;
            }
          }
          const name = columns[best];
          row[name] = row[name] ? `${row[name]} ${cell.text}` : cell.text;
        }
      }
      if (Object.keys(row).length > 0) rows.push(row);
    }
    if (columns.length > 0) return { columns, rows };
  }
  return { columns: [], rows: [] };
}
