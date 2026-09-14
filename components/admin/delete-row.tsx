"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { ConfirmButton } from "./confirm-button";

/**
 * Удаление записи справочника — рядом с «Скрыть». Спрашивает подтверждение и
 * называет запись по имени: строки в таблицах похожи друг на друга, и «точно
 * удалить?» без названия — это ставка на внимательность.
 *
 * Сервер всё равно проверяет связи (проданные сертификаты, заказы с
 * промокодом) и отказывает с объяснением: удалять то, на что ссылается
 * история продаж, нельзя — для этого есть «Скрыть».
 */
export function DeleteRowButton({
  id,
  name,
  what,
  body,
  action,
}: Readonly<{
  id: number;
  /** Как называется запись в вопросе: «50 000 ₸», «Грация», «LETO10». */
  name: string;
  /** Родительный падеж: «номинал», «программу», «промокод». */
  what: string;
  body: string;
  action: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <ConfirmButton
      label="Удалить"
      title={`Удалить ${what} «${name}»?`}
      body={body}
      confirmLabel="Удалить"
      danger
      disabled={pending}
      className="rounded-lg border-[1.5px] border-red-200 px-3 py-1.5 text-xs font-bold text-brand-red hover:bg-red-50 disabled:opacity-50"
      onConfirm={() => {
        const fd = new FormData();
        fd.set("id", String(id));
        startTransition(async () => {
          if (toastResult(await action(fd), "Удалено.")) router.refresh();
        });
      }}
    />
  );
}
