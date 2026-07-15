"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { ConfirmButton } from "./confirm-button";
import { manualFulfillAction } from "@/app/admin/orders/actions";

/**
 * Ручной выпуск сертификата по неоплаченному заказу — для случая «клиент
 * оплатил и закрыл страницу, автоматика не добрала, чек предоставлен».
 */
export function ManualFulfill({ orderId }: Readonly<{ orderId: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <ConfirmButton
      label="Выпустить сертификат вручную"
      title="Выпустить сертификат вручную?"
      body="Только если оплата реально подтверждена (чек, выписка Kaspi/банка). Заказ станет оплаченным, попадёт в выручку, сертификат сгенерируется и уйдёт получателю на указанный контакт."
      confirmLabel="Оплата подтверждена — выпустить"
      disabled={pending}
      className="rounded-full bg-brand-purple px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
      onConfirm={() => {
        const fd = new FormData();
        fd.set("orderId", orderId);
        startTransition(async () => {
          if (toastResult(await manualFulfillAction(fd))) router.refresh();
        });
      }}
    />
  );
}
