import { describe, expect, it } from "vitest";
import { normalizeManualSerial } from "@/lib/admin/manual-issue";

/**
 * Номер сертификата менеджер переписывает с чужого экрана, с бумаги или из
 * переписки: с лишними пробелами, в нижнем регистре, без ведущих нулей.
 * Прощать это нужно, а вот выдумывать номер — нет: не понятый номер должен
 * отвергаться, иначе сертификат заведётся под тем, чего у клиента нет.
 */
describe("normalizeManualSerial", () => {
  it("принимает салонный номер и приводит к каноническому виду", () => {
    expect(normalizeManualSerial("wm9001")).toEqual({
      ok: true,
      serial: "WM9001",
    });
    expect(normalizeManualSerial("  WM 9001 ")).toEqual({
      ok: true,
      serial: "WM9001",
    });
  });

  it("добивает нулями до четырёх цифр", () => {
    // На бланке напечатано WM0123, менеджер набирает «WM 123». Без этого мы
    // завели бы WM123: другой хэш, другой номер в CRM и «не найден» на /check
    // по тому самому номеру, который у клиента на руках.
    expect(normalizeManualSerial("WM123")).toEqual({
      ok: true,
      serial: "WM0123",
    });
  });

  it("не даёт завести номер чужого филиала", () => {
    // Иначе запись ляжет на один филиал с префиксом другого — и заодно
    // испортит нумерацию тому, чей префикс взяли.
    const res = normalizeManualSerial("WT9001", "WM");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("WM");
  });

  it("принимает старый случайный код", () => {
    expect(normalizeManualSerial("imb-f3gw-f3u8")).toEqual({
      ok: true,
      serial: "IMB-F3GW-F3U8",
    });
  });

  it("отвергает то, что не похоже на наш номер", () => {
    expect(normalizeManualSerial("").ok).toBe(false);
    expect(normalizeManualSerial("просто текст").ok).toBe(false);
  });
});
