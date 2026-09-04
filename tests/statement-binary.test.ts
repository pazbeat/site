import { describe, expect, it } from "vitest";
import { parseCMap } from "@/lib/admin/pdf-table";
import { decodeRk, excelSerialToDate } from "@/lib/admin/xls";

/**
 * Разбор самих форматов — тех мест, где ошибка не выглядит ошибкой.
 *
 * Оба банка отдают файлы, которые нельзя прочитать «в лоб»: Kaspi — PDF,
 * ForteBank — Excel образца девяносто восьмого года. Ошибка в любом из этих
 * мест даёт не отказ, а правдоподобные, но неверные числа, и заметить её на
 * глаз в отчёте невозможно.
 */
describe("соответствие кодов и букв в PDF (ToUnicode)", () => {
  it("понимает форму bfrange со СПИСКОМ назначений", () => {
    // Именно так пишет wkhtmltopdf, которым сделан отчёт Kaspi. Наивный
    // разбор принимает третий токен за начало диапазона и выдаёт связный
    // мусор: цифры превращаются в «5 6 7 8», кириллица — в латиницу. Мусор
    // выглядит как текст, поэтому подмену видно только по смыслу.
    const font = parseCMap(`
      1 begincodespacerange
      <0000> <FFFF>
      endcodespacerange
      2 beginbfrange
      <0000> <0000> <0000>
      <0001> <0004> [<0032> <0030> <0036> <002D>]
      endbfrange
    `);
    expect(font.map.get(1)).toBe("2");
    expect(font.map.get(2)).toBe("0");
    expect(font.map.get(3)).toBe("6");
    expect(font.map.get(4)).toBe("-");
    expect(font.twoByte).toBe(true);
  });

  it("понимает и обычную форму bfrange — диапазон подряд", () => {
    const font = parseCMap(`
      beginbfrange
      <0010> <0019> <0030>
      endbfrange
    `);
    expect(font.map.get(0x10)).toBe("0");
    expect(font.map.get(0x19)).toBe("9");
  });

  it("понимает bfchar", () => {
    const font = parseCMap(`
      beginbfchar
      <0041> <0410>
      endbfchar
    `);
    expect(font.map.get(0x41)).toBe("А");
  });
});

describe("числа старого Excel", () => {
  it("RK: целое со сдвигом", () => {
    // Признак 2 — целое, признак 1 — делить на сто.
    expect(decodeRk((35000 << 2) | 2)).toBe(35000);
    expect(decodeRk((148750 << 2) | 3)).toBe(1487.5);
  });

  it("RK: число с плавающей точкой в укороченной записи", () => {
    expect(decodeRk(0x40590000)).toBeCloseTo(100, 6);
  });

  it("дата из серийного номера — с поправкой на несуществующее 29 февраля", () => {
    // 60-й день в Excel — выдуманный, поэтому до него отсчёт сдвинут.
    expect(excelSerialToDate(1).toISOString().slice(0, 10)).toBe("1900-01-01");
    expect(excelSerialToDate(61).toISOString().slice(0, 10)).toBe("1900-03-01");
    expect(excelSerialToDate(46268).toISOString().slice(0, 10)).toBe("2026-09-03");
  });
});
