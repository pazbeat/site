"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type PromoFormValues = {
  id?: number;
  code?: string;
  kind?: "percent" | "fixed";
  value?: number;
  maxUses?: number;
  validFrom?: string; // YYYY-MM-DD
  validUntil?: string; // YYYY-MM-DD
  minAmountKzt?: number;
};

const inputCls =
  "rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold";
const labelCls = "mb-1 block text-xs font-semibold text-brand-purple-950/60";

/** Форма создания/редактирования промокода (Фаза 2). */
export function PromoForm({
  action,
  initial,
  submitLabel,
}: Readonly<{
  action: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>;
  initial?: PromoFormValues;
  submitLabel: string;
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <form
      ref={formRef}
      action={(fd) => {
        setError("");
        startTransition(async () => {
          const result = await action(fd);
          if (result?.error) setError(result.error);
          else {
            if (!initial?.id) formRef.current?.reset();
            router.refresh();
          }
        });
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div>
        <label className={labelCls}>Код</label>
        <input
          name="code"
          required
          maxLength={40}
          defaultValue={initial?.code ?? ""}
          placeholder="LETO2026"
          className={`${inputCls} w-full uppercase`}
        />
      </div>
      <div>
        <label className={labelCls}>Тип</label>
        <select
          name="kind"
          defaultValue={initial?.kind ?? "percent"}
          className={`${inputCls} w-full`}
        >
          <option value="percent">Процент, %</option>
          <option value="fixed">Фиксированная, ₸</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Значение</label>
        <input
          name="value"
          type="number"
          min={1}
          required
          defaultValue={initial?.value ?? ""}
          placeholder="10"
          className={`${inputCls} w-full`}
        />
      </div>
      <div>
        <label className={labelCls}>Лимит применений</label>
        <input
          name="maxUses"
          type="number"
          min={0}
          defaultValue={initial?.maxUses ?? ""}
          placeholder="без лимита"
          className={`${inputCls} w-full`}
        />
      </div>
      <div>
        <label className={labelCls}>Мин. сумма заказа, ₸</label>
        <input
          name="minAmountKzt"
          type="number"
          min={0}
          defaultValue={initial?.minAmountKzt ?? ""}
          placeholder="без ограничения"
          className={`${inputCls} w-full`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Действует с</label>
          <input
            name="validFrom"
            type="date"
            defaultValue={initial?.validFrom ?? ""}
            className={`${inputCls} w-full`}
          />
        </div>
        <div>
          <label className={labelCls}>по</label>
          <input
            name="validUntil"
            type="date"
            defaultValue={initial?.validUntil ?? ""}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {error && (
          <span className="text-sm font-semibold text-brand-red">{error}</span>
        )}
      </div>
    </form>
  );
}
