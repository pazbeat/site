"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { ConfirmButton } from "./confirm-button";
import { manualFulfillAction } from "@/app/admin/orders/actions";

/**
 * Ручной выпуск сертификата — для случая «клиент оплатил и закрыл страницу,
 * автоматика не добрала, чек предоставлен», а также для починки заказа,
 * который оплачен, но остался без сертификата.
 *
 * Номер операции обязателен. Это не бюрократия: ручное подтверждение — самый
 * реалистичный путь к «сертификат есть, денег нет» (менеджер поверил
 * скриншоту). Номер остаётся в заказе и в журнале действий, и по нему платёж
 * ищется в выписке — иначе доказать, что деньги были, нечем.
 */
export function ManualFulfill({
  orderId,
  repair = false,
}: Readonly<{ orderId: string; repair?: boolean }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reference, setReference] = useState("");
  const ready = reference.trim().length >= 3;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-brand-purple-950/70">
        Номер операции или чека
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          maxLength={64}
          placeholder="например, чек Kaspi 123456789"
          className="mt-1 w-full rounded-xl border-[1.5px] border-brand-purple-100 px-3 py-2 text-base font-normal outline-none focus:border-brand-gold sm:text-sm"
        />
      </label>
      <ConfirmButton
        label={
          repair ? "Довыпустить сертификат" : "Выпустить сертификат вручную"
        }
        title={repair ? "Довыпустить сертификат?" : "Выпустить сертификат вручную?"}
        body={
          repair
            ? "Заказ оплачен, но сертификата у него нет. Сертификат будет выпущен и отправлен получателю; повторно деньги не списываются."
            : "Только если оплата реально подтверждена (чек, выписка Kaspi/банка). Заказ станет оплаченным, попадёт в выручку, сертификат сгенерируется и уйдёт получателю на указанный контакт."
        }
        confirmLabel={repair ? "Довыпустить" : "Оплата подтверждена — выпустить"}
        disabled={pending || !ready}
        className="rounded-full bg-brand-purple px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
        onConfirm={() => {
          const fd = new FormData();
          fd.set("orderId", orderId);
          fd.set("reference", reference.trim());
          startTransition(async () => {
            if (toastResult(await manualFulfillAction(fd))) router.refresh();
          });
        }}
      />
      <p className="text-xs text-brand-purple-950/55">
        {ready
          ? "Номер сохранится в заказе и в журнале действий."
          : "Укажите номер операции — без него выпуск недоступен."}
      </p>
    </div>
  );
}
