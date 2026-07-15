"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  blockAction,
  extendAction,
  redeemAction,
  refundAction,
  resendAction,
  syncAltegioAction,
} from "@/app/admin/orders/actions";

type ActionResult = { ok?: boolean; error?: string; message?: string } | undefined;

const box = "rounded-xl border border-brand-purple-100 bg-white p-4";
const inputCls =
  "w-full rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold";
const btn =
  "rounded-full px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50";

export function CertActions({
  certificateId,
  balanceKzt,
  status,
  isBlocked,
  salons,
}: Readonly<{
  certificateId: string;
  balanceKzt: number;
  status: string;
  isBlocked: boolean;
  salons: Array<{ id: number; label: string }>;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>("");

  const run = (action: (fd: FormData) => Promise<ActionResult>, fd: FormData) => {
    setMessage("");
    startTransition(async () => {
      const result = await action(fd);
      if (result?.error) setMessage(result.error);
      else {
        setMessage(result?.message ?? "Готово.");
        router.refresh();
      }
    });
  };

  const canRedeem = status === "active" || status === "partially_used";
  const canRefund = status !== "refunded" && status !== "used";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Погашение */}
      <form
        className={box}
        action={(fd) => run(redeemAction, fd)}
      >
        <input type="hidden" name="certificateId" value={certificateId} />
        <div className="mb-2 text-sm font-bold">Погашение</div>
        <div className="mb-2 grid gap-2">
          <input
            name="amountKzt"
            type="number"
            min={1}
            max={balanceKzt}
            defaultValue={balanceKzt}
            required
            className={inputCls}
            placeholder="Сумма, ₸"
          />
          <select name="salonId" className={inputCls} defaultValue="">
            <option value="">Салон (необязательно)</option>
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            name="comment"
            maxLength={500}
            className={inputCls}
            placeholder="Комментарий"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !canRedeem}
          className={`${btn} bg-brand-purple text-white hover:bg-brand-purple-600`}
        >
          Погасить
        </button>
      </form>

      {/* Продление + блокировка + повторная отправка */}
      <div className="flex flex-col gap-4">
        <form className={box} action={(fd) => run(extendAction, fd)}>
          <input type="hidden" name="certificateId" value={certificateId} />
          <div className="mb-2 text-sm font-bold">Продлить срок</div>
          <div className="flex gap-2">
            <input
              name="months"
              type="number"
              min={1}
              max={60}
              defaultValue={12}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={pending}
              className={`${btn} shrink-0 border-[1.5px] border-brand-purple text-brand-purple hover:bg-brand-purple-50`}
            >
              Месяцев
            </button>
          </div>
        </form>

        <div className={`${box} flex flex-wrap gap-2`}>
          <form action={(fd) => run(blockAction, fd)}>
            <input type="hidden" name="certificateId" value={certificateId} />
            <button
              type="submit"
              disabled={pending}
              className={`${btn} border-[1.5px] ${
                isBlocked
                  ? "border-brand-purple text-brand-purple hover:bg-brand-purple-50"
                  : "border-brand-red text-brand-red hover:bg-brand-red/5"
              }`}
            >
              {isBlocked ? "Разблокировать" : "Заблокировать"}
            </button>
          </form>
          <form action={(fd) => run(resendAction, fd)}>
            <input type="hidden" name="certificateId" value={certificateId} />
            <button
              type="submit"
              disabled={pending}
              className={`${btn} border-[1.5px] border-brand-purple-100 hover:border-brand-gold`}
            >
              Отправить повторно
            </button>
          </form>
          <form action={(fd) => run(syncAltegioAction, fd)}>
            <input type="hidden" name="certificateId" value={certificateId} />
            <button
              type="submit"
              disabled={pending}
              className={`${btn} border-[1.5px] border-brand-purple-100 hover:border-brand-gold`}
              title="Подтянуть погашения из CRM, не дожидаясь автосверки"
            >
              Сверить с Altegio
            </button>
          </form>
          <form
            action={(fd) => {
              if (
                confirm(
                  "Оформить возврат? Сертификат перестанет действовать, а заказ уйдёт из выручки. Деньги покупателю нужно вернуть отдельно, на стороне банка.",
                )
              ) {
                run(refundAction, fd);
              }
            }}
          >
            <input type="hidden" name="certificateId" value={certificateId} />
            <button
              type="submit"
              disabled={pending || !canRefund}
              className={`${btn} border-[1.5px] border-brand-red text-brand-red hover:bg-brand-red/5`}
              title={
                canRefund ? undefined : "Погашенный или уже возвращённый сертификат"
              }
            >
              Оформить возврат
            </button>
          </form>
        </div>
      </div>

      {message && (
        <p className="sm:col-span-2 text-sm font-semibold text-brand-purple">
          {message}
        </p>
      )}
    </div>
  );
}
