"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import {
  saveNotifySettingsAction,
  testNotifyAction,
} from "@/app/admin/settings/actions";

const inputCls =
  "w-full rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold";
const labelCls = "mb-1 block text-xs font-bold text-brand-purple-950/70";

export function NotifySettings({
  enabled,
  whatsapp,
  telegramChatId,
  telegramTokenSet,
}: Readonly<{
  enabled: boolean;
  whatsapp: string;
  telegramChatId: string;
  telegramTokenSet: boolean;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-xl rounded-2xl border border-brand-purple-100 bg-white p-5"
      action={(fd) =>
        startTransition(async () => {
          if (toastResult(await saveNotifySettingsAction(fd))) router.refresh();
        })
      }
    >
      <h2 className="mb-1 font-display text-lg text-brand-purple">
        Уведомления о продажах
      </h2>
      <p className="mb-4 text-sm text-brand-purple-950/60">
        После каждой оплаты сообщение с суммой, программой, филиалом и
        получателем уходит на указанные каналы.
      </p>

      <label className="mb-4 flex items-center gap-2.5 text-sm font-semibold">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="h-4 w-4 accent-brand-purple"
        />
        Присылать уведомление о каждой продаже
      </label>

      <div className="mb-4">
        <label className={labelCls} htmlFor="ns-wa">
          Номер WhatsApp (через ChatApp)
        </label>
        <input
          id="ns-wa"
          name="whatsapp"
          defaultValue={whatsapp}
          placeholder="+7 7XX XXX XX XX"
          className={inputCls}
        />
      </div>

      <div className="mb-2">
        <label className={labelCls} htmlFor="ns-tg">
          Telegram: ID чата
        </label>
        <input
          id="ns-tg"
          name="telegramChatId"
          defaultValue={telegramChatId}
          placeholder="например 123456789"
          className={inputCls}
        />
      </div>
      <p className="mb-4 text-xs text-brand-purple-950/55">
        Свой ID покажет бот @userinfobot. Перед этим напишите нашему боту
        «/start», иначе Telegram не даст ему писать вам первым.{" "}
        {telegramTokenSet
          ? "Токен бота настроен."
          : "⚠ Токен бота (TELEGRAM_BOT_TOKEN) не задан в env — Telegram работать не будет."}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-purple px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
        >
          Сохранить
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              toastResult(await testNotifyAction());
            })
          }
          className="rounded-full border-[1.5px] border-brand-purple-100 px-5 py-2.5 text-sm font-bold transition-colors hover:border-brand-gold disabled:opacity-50"
        >
          Отправить тестовое
        </button>
      </div>
    </form>
  );
}
