"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatKzt } from "@/lib/format";

type CheckResult =
  | { kind: "ok"; status: string; balanceKzt: number; validUntil: string }
  | { kind: "notFound" }
  | { kind: "rateLimited" };

export function CheckForm({
  initialCode = "",
}: Readonly<{ initialCode?: string }>) {
  const t = useTranslations("Check");
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const autoChecked = useRef(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (response.status === 429) {
        setResult({ kind: "rateLimited" });
      } else if (!response.ok) {
        setResult({ kind: "notFound" });
      } else {
        const data = await response.json();
        setResult(
          data.found
            ? {
                kind: "ok",
                status: data.status,
                balanceKzt: data.balanceKzt,
                validUntil: data.validUntil,
              }
            : { kind: "notFound" },
        );
      }
    } catch {
      setResult({ kind: "notFound" });
    } finally {
      setLoading(false);
    }
  };

  // Переход по QR (?code=…): проверяем автоматически один раз
  useEffect(() => {
    if (initialCode && !autoChecked.current) {
      autoChecked.current = true;
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-lg rounded-2xl border border-brand-purple-100 bg-white p-7 shadow-md sm:p-9"
    >
      <label
        className="mb-1.5 block text-[13px] font-bold"
        htmlFor="check-code"
      >
        {t("label")}
      </label>
      <input
        id="check-code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="IMB-XXXX-XXXX"
        maxLength={20}
        className="mb-4 w-full rounded-xl border-[1.5px] border-brand-purple-100 px-3.5 py-3 text-sm tracking-[0.15em] uppercase outline-none transition-colors focus:border-brand-gold"
      />
      <button
        type="submit"
        disabled={loading || code.trim().length < 8}
        className="w-full rounded-full bg-brand-purple px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-40"
      >
        {t("button")}
      </button>

      {result?.kind === "ok" && (
        <dl className="mt-5 rounded-xl border border-brand-gold/50 bg-brand-gold-100/40 p-4 text-sm">
          <p className="mb-2 font-bold text-brand-purple">{t("ok")}</p>
          <div className="flex justify-between py-1">
            <dt>{t("statusLabel")}</dt>
            <dd className="font-semibold">
              {t(`status.${result.status}` as "status.active")}
            </dd>
          </div>
          <div className="flex justify-between py-1">
            <dt>{t("balance")}</dt>
            <dd className="font-semibold">{formatKzt(result.balanceKzt)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt>{t("validUntil")}</dt>
            <dd className="font-semibold">{result.validUntil}</dd>
          </div>
        </dl>
      )}
      {result?.kind === "notFound" && (
        <p className="mt-5 rounded-xl border border-brand-red/30 bg-brand-red/5 p-4 text-sm font-semibold text-brand-red">
          {t("notFound")}
        </p>
      )}
      {result?.kind === "rateLimited" && (
        <p className="mt-5 rounded-xl border border-brand-red/30 bg-brand-red/5 p-4 text-sm font-semibold text-brand-red">
          {t("rateLimited")}
        </p>
      )}
    </form>
  );
}
