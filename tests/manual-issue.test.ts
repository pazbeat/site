import { describe, expect, it } from "vitest";
import { normalizeManualSerial } from "@/lib/admin/manual-issue";

/**
 * Номер сертификата менеджер переписывает с чужого экрана, с бумаги или из
 * переписки: с лишними пробелами, в нижнем регистре, иногда с дефисами не там.
 * Прощать это нужно, а вот выдумывать номер — нет: не понятый номер должен
 * отвергаться, иначе сертификат заведётся под тем, чего у клиента нет.
 */
describe("normalizeManualSerial", () => {
  it("принимает салонный номер и приводит к каноническому виду", () => {
    expect(normalizeManualSerial("wm9001")).toBe("WM9001");
    expect(normalizeManualSerial("  WM 9001 ")).toBe("WM9001");
  });

  it("принимает старый случайный код", () => {
    expect(normalizeManualSerial("imb-f3gw-f3u8")).toBe("IMB-F3GW-F3U8");
  });

  it("отвергает то, что не похоже на наш номер", () => {
    expect(normalizeManualSerial("")).toBeNull();
    expect(normalizeManualSerial("12")).toBeNull();
    expect(normalizeManualSerial("просто текст")).toBeNull();
  });
});
