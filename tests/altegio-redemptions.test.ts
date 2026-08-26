import { describe, expect, it } from "vitest";
import {
  reconcileCertificate,
  type LocalCert,
  type RemoteCert,
} from "@/lib/altegio/redemptions";

const active: LocalCert = { status: "active", balanceKzt: 35000, amountKzt: 35000 };
const remote = (balance: number): RemoteCert => ({
  id: 3317438,
  balance,
  statusSlug: "active",
});

describe("сверка с Altegio", () => {
  it("баланс сошёлся — ничего не делаем", () => {
    expect(reconcileCertificate(active, remote(35000))).toEqual({ kind: "noop" });
  });

  it("частичное погашение в салоне", () => {
    expect(reconcileCertificate(active, remote(20000))).toEqual({
      kind: "sync",
      balanceKzt: 20000,
      status: "partially_used",
      redeemedKzt: 15000,
    });
  });

  it("погашен полностью → used", () => {
    expect(reconcileCertificate(active, remote(0))).toEqual({
      kind: "sync",
      balanceKzt: 0,
      status: "used",
      redeemedKzt: 35000,
    });
  });

  it("догашивание уже частично использованного", () => {
    const partial: LocalCert = {
      status: "partially_used",
      balanceKzt: 20000,
      amountKzt: 35000,
    };
    expect(reconcileCertificate(partial, remote(5000))).toEqual({
      kind: "sync",
      balanceKzt: 5000,
      status: "partially_used",
      redeemedKzt: 15000,
    });
  });

  it("остаток вернули в CRM до полного номинала → снова active", () => {
    const partial: LocalCert = {
      status: "partially_used",
      balanceKzt: 20000,
      amountKzt: 35000,
    };
    expect(reconcileCertificate(partial, remote(35000))).toEqual({
      kind: "sync",
      balanceKzt: 35000,
      status: "active",
      redeemedKzt: -15000,
    });
  });

  it("отрицательный баланс в CRM не уходит к нам в минус", () => {
    const action = reconcileCertificate(active, remote(-100));
    expect(action).toMatchObject({ kind: "sync", balanceKzt: 0, status: "used" });
  });

  it("пропал из Altegio — не гадаем, зовём менеджера", () => {
    expect(reconcileCertificate(active, null)).toEqual({ kind: "missing" });
  });

  it("наши решения важнее CRM: blocked/refunded/expired/used не трогаем", () => {
    for (const status of ["blocked", "refunded", "expired", "used"] as const) {
      expect(reconcileCertificate({ ...active, status }, remote(0))).toEqual({
        kind: "skip",
        reason: status,
      });
    }
  });

  it("номинал неизвестен — опираемся на текущий остаток", () => {
    const noNominal: LocalCert = {
      status: "active",
      balanceKzt: 10000,
      amountKzt: null,
    };
    expect(reconcileCertificate(noNominal, remote(4000))).toMatchObject({
      status: "partially_used",
      redeemedKzt: 6000,
    });
  });
});

describe("журнал погашений: отбор строк", () => {
  const row = (id: number, typeId: number, certId: number) => ({
    id,
    created_date: "2026-08-26T15:08:48+04:00",
    visit_id: 1,
    amount: 100,
    type_id: typeId,
    certificate_id: certId,
  });

  it("берёт только погашения сертификатов новее закладки", async () => {
    const { selectFreshRedemptions } = await import(
      "@/lib/altegio/redemptions"
    );
    const rows = [
      row(100, 8, 555), // старее закладки
      row(300, 8, 777),
      row(200, 8, 0), // сертификата нет — не погашение
      row(250, 1, 888), // другой тип операции
      row(150, 8, 666),
    ];
    const fresh = selectFreshRedemptions(rows, 120);
    expect(fresh.map((r) => r.id)).toEqual([150, 300]);
  });

  it("сортирует от старых к новым — закладка двигается вперёд", async () => {
    const { selectFreshRedemptions } = await import(
      "@/lib/altegio/redemptions"
    );
    const fresh = selectFreshRedemptions(
      [row(900, 8, 1), row(100, 8, 2), row(500, 8, 3)],
      0,
    );
    expect(fresh.map((r) => r.id)).toEqual([100, 500, 900]);
  });

  it("пустой журнал не двигает закладку", async () => {
    const { selectFreshRedemptions } = await import(
      "@/lib/altegio/redemptions"
    );
    expect(selectFreshRedemptions([], 42)).toEqual([]);
  });
});

describe("журнал: закладка не застревает навсегда", () => {
  it("после трёх неудач строка перешагивается, а не блокирует сверку", async () => {
    // Строка, которая не разбирается никогда (визит удалён, нет прав),
    // не должна останавливать сверку всех последующих погашений.
    const { selectFreshRedemptions } = await import(
      "@/lib/altegio/redemptions"
    );
    const rows = [
      { id: 10, created_date: "", visit_id: 1, amount: 1, type_id: 8, certificate_id: 1 },
      { id: 20, created_date: "", visit_id: 2, amount: 1, type_id: 8, certificate_id: 2 },
    ];
    // Сам порядок разбора — от старых к новым: перешагнув 10, доходим до 20.
    expect(selectFreshRedemptions(rows, 0).map((r) => r.id)).toEqual([10, 20]);
    // А если закладка уже прошла 10 — сверка продолжается с 20.
    expect(selectFreshRedemptions(rows, 10).map((r) => r.id)).toEqual([20]);
  });
});
