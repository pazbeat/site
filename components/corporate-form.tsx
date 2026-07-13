"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const inputCls =
  "w-full rounded-xl border-[1.5px] border-brand-purple-100 bg-white px-3.5 py-3 text-sm outline-none transition-colors focus:border-brand-gold";
const labelCls = "mb-1.5 block text-[13px] font-bold";

export function CorporateForm() {
  const t = useTranslations("Corporate");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [qty, setQty] = useState("10");
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error" | "rateLimited">(
    "idle",
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const response = await fetch("/api/corporate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          contact: contact.trim(),
          qty: Number(qty),
          comment: comment.trim(),
        }),
      });
      if (response.status === 429) setState("rateLimited");
      else setState(response.ok ? "ok" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "ok") {
    return (
      <p className="mx-auto max-w-lg rounded-2xl border border-brand-gold/50 bg-brand-gold-100/40 p-6 text-center font-semibold text-brand-purple">
        {t("success")}
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-lg rounded-2xl border border-brand-purple-100 bg-white p-7 shadow-md sm:p-9"
    >
      <div className="mb-4">
        <label className={labelCls} htmlFor="c-company">
          {t("company")}
        </label>
        <input
          id="c-company"
          required
          maxLength={120}
          className={inputCls}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <label className={labelCls} htmlFor="c-contact">
          {t("contact")}
        </label>
        <input
          id="c-contact"
          required
          maxLength={160}
          className={inputCls}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <label className={labelCls} htmlFor="c-qty">
          {t("qty")}
        </label>
        <input
          id="c-qty"
          type="number"
          min={1}
          max={10000}
          required
          className={inputCls}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </div>
      <div className="mb-6">
        <label className={labelCls} htmlFor="c-comment">
          {t("comment")}
        </label>
        <textarea
          id="c-comment"
          maxLength={1000}
          className={`${inputCls} min-h-[90px] resize-y`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {state === "error" && (
        <p className="mb-4 text-sm font-semibold text-brand-red">{t("error")}</p>
      )}
      {state === "rateLimited" && (
        <p className="mb-4 text-sm font-semibold text-brand-red">
          {t("errRateLimited")}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-full bg-brand-purple px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
      >
        {t("submit")}
      </button>
    </form>
  );
}
