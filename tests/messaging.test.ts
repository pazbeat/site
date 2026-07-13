import { describe, expect, it } from "vitest";
import { normalizeWhatsAppChatId } from "@/lib/messaging/types";

describe("normalizeWhatsAppChatId", () => {
  it("международный +7 → цифры + @c.us", () => {
    expect(normalizeWhatsAppChatId("+7 700 123 45 67")).toBe("77001234567@c.us");
  });

  it("ведущая 8 → 7 (казахстанский внутренний)", () => {
    expect(normalizeWhatsAppChatId("87001234567")).toBe("77001234567@c.us");
  });

  it("скобки, дефисы и пробелы игнорируются", () => {
    expect(normalizeWhatsAppChatId("+7 (700) 123-45-67")).toBe(
      "77001234567@c.us",
    );
  });

  it("уже 7XXXXXXXXXX не трогаем", () => {
    expect(normalizeWhatsAppChatId("77771234567")).toBe("77771234567@c.us");
  });
});
