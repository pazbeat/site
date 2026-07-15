import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security";

describe("buildCsp (PRD §9.2)", () => {
  it("production: script-src без unsafe-inline, с nonce и strict-dynamic", () => {
    const csp = buildCsp("abc123", false);
    const scriptSrc = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("production: базовые директивы и запреты", () => {
    const csp = buildCsp("n", false);
    expect(csp).toContain("default-src 'self'");
    // 'self', не 'none': PDF-вьюер Chrome (просмотр прайса на /prices) —
    // plugin-document и подпадает под object-src; чужие плагины закрыты
    expect(csp).toContain("object-src 'self'");
    expect(csp).toContain("frame-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    // фото программ, data:-QR и blob:-предпросмотр разрешены
    expect(csp).toContain("img-src 'self' data: blob: https://www.imbir.kz");
  });

  it("dev: послабления для Turbopack HMR (eval/inline/ws), без upgrade", () => {
    const csp = buildCsp("n", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
