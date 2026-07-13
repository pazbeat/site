import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hmacSign,
  hmacVerify,
} from "@/lib/crypto";

beforeAll(() => {
  process.env.CODE_ENCRYPTION_KEY = "a".repeat(64);
});

describe("encryptSecret / decryptSecret", () => {
  it("шифрует и расшифровывает код", () => {
    const encrypted = encryptSecret("IMB-A9F3-K2M4");
    expect(encrypted).not.toContain("IMB");
    expect(decryptSecret(encrypted)).toBe("IMB-A9F3-K2M4");
  });

  it("каждый вызов даёт разный шифртекст (случайный IV)", () => {
    expect(encryptSecret("IMB-A9F3-K2M4")).not.toBe(
      encryptSecret("IMB-A9F3-K2M4"),
    );
  });

  it("повреждённый шифртекст не расшифровывается (GCM auth)", () => {
    const encrypted = encryptSecret("IMB-A9F3-K2M4");
    const tampered =
      encrypted.slice(0, encrypted.length - 4) +
      (encrypted.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret("мусор")).toBeNull();
  });
});

describe("hmacSign / hmacVerify", () => {
  it("проверяет валидную подпись и отклоняет подделку", () => {
    const sig = hmacSign("order1:65000", "secret");
    expect(hmacVerify("order1:65000", sig, "secret")).toBe(true);
    expect(hmacVerify("order1:99000", sig, "secret")).toBe(false);
    expect(hmacVerify("order1:65000", sig, "other")).toBe(false);
    expect(hmacVerify("order1:65000", "не-hex", "secret")).toBe(false);
  });
});
