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
