import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApnsJwt } from "@/lib/wallet/apns";

// Настоящий ключ APNs — эллиптическая кривая P-256, ровно такую и делаем
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const keyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const CONFIG = { keyPem, keyId: "ABC1234567", teamId: "8P2AARWSYR" };
const NOW = 1_787_000_000_000;

function parts(jwt: string) {
  const [header, claims, signature] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString()),
    claims: JSON.parse(Buffer.from(claims, "base64url").toString()),
    signature: Buffer.from(signature, "base64url"),
    signed: `${header}.${claims}`,
  };
}

describe("buildApnsJwt", () => {
  const jwt = buildApnsJwt(CONFIG, NOW);

  it("состоит из трёх частей", () => {
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("в заголовке ES256 и идентификатор ключа", () => {
    expect(parts(jwt).header).toEqual({ alg: "ES256", kid: "ABC1234567" });
  });

  it("в теле команда и время выпуска в секундах", () => {
    expect(parts(jwt).claims).toEqual({
      iss: "8P2AARWSYR",
      iat: Math.floor(NOW / 1000),
    });
  });

  it("подпись сырая, 64 байта — DER Apple не принимает", () => {
    expect(parts(jwt).signature.length).toBe(64);
  });

  it("подпись сходится с открытым ключом", () => {
    const { signed, signature } = parts(jwt);
    const ok = verify("sha256", Buffer.from(signed), {
      key: publicKey,
      dsaEncoding: "ieee-p1363",
    }, signature);
    expect(ok).toBe(true);
  });

  it("подделанное тело подпись не проходит", () => {
    const { signature } = parts(jwt);
    const forged = `${Buffer.from(JSON.stringify({ alg: "ES256", kid: "ABC1234567" })).toString("base64url")}.${Buffer.from(JSON.stringify({ iss: "чужая-команда", iat: 1 })).toString("base64url")}`;
    const ok = verify("sha256", Buffer.from(forged), {
      key: publicKey,
      dsaEncoding: "ieee-p1363",
    }, signature);
    expect(ok).toBe(false);
  });

  it("в разное время токены разные", () => {
    expect(buildApnsJwt(CONFIG, NOW + 60_000)).not.toBe(jwt);
  });

  it("не содержит символов, ломающих заголовок HTTP", () => {
    // Токен уезжает в `authorization: bearer …` — только base64url и точки
    expect(jwt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});
