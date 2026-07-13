"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type ClaimState =
  | { kind: "loading" }
  | { kind: "code"; code: string }
  | { kind: "claimed" }
  | { kind: "error" };

/**
 * Забирает код сертификата ОДИН раз (POST — не префетчится) и показывает
 * его с кнопкой копирования и шарингом в WhatsApp.
 */
export function ClaimCode({ token }: Readonly<{ token: string }>) {
  const t = useTranslations("Success");
  const [state, setState] = useState<ClaimState>({ kind: "loading" });
  const [copied, setCopied] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return; // защита от двойного вызова в dev StrictMode
    requested.current = true;
    fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (!response.ok) {
          setState({ kind: "error" });
          return;
        }
        const data = (await response.json()) as {
          code: string | null;
          claimed: boolean;
        };
        setState(data.code ? { kind: "code", code: data.code } : { kind: "claimed" });
      })
      .catch(() => setState({ kind: "error" }));
  }, [token]);

  if (state.kind === "loading") {
    return (
      <p className="text-center text-sm text-brand-purple-950/60">…</p>
    );
  }
  if (state.kind === "claimed") {
    return (
      <p className="mx-auto max-w-md rounded-xl border border-brand-gold/50 bg-brand-gold-100/40 px-4 py-3 text-center text-sm">
        {t("alreadyClaimed")}
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p className="mx-auto max-w-md rounded-xl border border-brand-red/30 bg-brand-red/5 px-4 py-3 text-center text-sm font-semibold text-brand-red">
        {t("claimError")}
      </p>
    );
  }

  const waText = encodeURIComponent(`${t("waMessage")} ${state.code}`);

  return (
    <div className="text-center">
      <p className="mb-2 text-xs font-bold tracking-wider text-brand-purple-950/60 uppercase">
        {t("codeLabel")}
      </p>
      <div className="mx-auto mb-2 inline-flex items-center gap-3 rounded-xl border-[1.5px] border-dashed border-brand-gold bg-white px-6 py-3.5">
        <span className="text-lg font-extrabold tracking-[0.15em] text-brand-purple">
          {state.code}
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(state.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="rounded-lg bg-brand-purple-50 px-3 py-1.5 text-xs font-bold text-brand-purple hover:bg-brand-purple-100"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <p className="mb-5 text-xs text-brand-purple-950/55">{t("onceNote")}</p>
      <a
        href={`https://wa.me/?text=${waText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-gold-gradient inline-block rounded-full px-7 py-3 text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5"
      >
        {t("waShare")}
      </a>
    </div>
  );
}
