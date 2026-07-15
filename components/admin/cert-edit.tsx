"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { editCertAction } from "@/app/admin/orders/actions";

const inputCls =
  "w-full rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold";
const labelCls = "mb-1 block text-xs font-bold text-brand-purple-950/70";

/** Правка персонализации сертификата: имена, поздравление, контакт доставки. */
export function CertEdit({
  certificateId,
  toName,
  fromName,
  message,
  deliveryMethod,
  deliveryContact,
}: Readonly<{
  certificateId: string;
  toName: string;
  fromName: string;
  message: string | null;
  deliveryMethod: string;
  deliveryContact: string;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="rounded-xl border border-brand-purple-100 bg-white p-4"
      action={(fd) =>
        startTransition(async () => {
          if (toastResult(await editCertAction(fd))) router.refresh();
        })
      }
    >
      <input type="hidden" name="certificateId" value={certificateId} />
      <div className="mb-2 text-sm font-bold">Персонализация</div>
      <div className="mb-3 grid gap-2.5 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="ce-to">
            Кому
          </label>
          <input
            id="ce-to"
            name="toName"
            defaultValue={toName}
            required
            maxLength={80}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="ce-from">
            От кого
          </label>
          <input
            id="ce-from"
            name="fromName"
            defaultValue={fromName}
            required
            maxLength={80}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="ce-msg">
            Поздравление (до 120 символов)
          </label>
          <textarea
            id="ce-msg"
            name="message"
            defaultValue={message ?? ""}
            maxLength={120}
            rows={2}
            className={`${inputCls} resize-y`}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="ce-contact">
            Контакт доставки ({deliveryMethod === "whatsapp" ? "WhatsApp" : "email"})
          </label>
          <input
            id="ce-contact"
            name="deliveryContact"
            defaultValue={deliveryContact}
            required
            maxLength={120}
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-purple px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
        >
          Сохранить
        </button>
        <span className="text-xs text-brand-purple-950/55">
          PDF собирается заново при каждой отправке — после правки нажмите
          «Отправить повторно».
        </span>
      </div>
    </form>
  );
}
