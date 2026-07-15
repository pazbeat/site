"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";

type ActionFn = (fd: FormData) => Promise<{ ok?: boolean; error?: string }>;

/** Действия над отложенной доставкой: отправить сейчас / перенести дату. */
export function ScheduledActions({
  certificateId,
  scheduledLocal,
  sendNow,
  reschedule,
}: Readonly<{
  certificateId: string;
  /** Текущая дата в формате datetime-local (Asia/Almaty) */
  scheduledLocal: string;
  sendNow: ActionFn;
  reschedule: ActionFn;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [when, setWhen] = useState(scheduledLocal);

  const run = (action: ActionFn, fd: FormData, done: string) => {
    startTransition(async () => {
      if (toastResult(await action(fd), done)) router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("certificateId", certificateId);
          run(sendNow, fd, "Отправка поставлена в очередь.");
        }}
        className="rounded-lg bg-brand-purple px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50"
      >
        Отправить сейчас
      </button>
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="rounded-lg border-[1.5px] border-brand-purple-100 px-2 py-1 text-xs outline-none focus:border-brand-gold"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("certificateId", certificateId);
            fd.set("scheduledAt", when);
            run(reschedule, fd, "Дата отправки перенесена.");
          }}
          className="rounded-lg border-[1.5px] border-brand-purple px-3 py-1.5 text-xs font-bold text-brand-purple hover:bg-brand-purple-50 disabled:opacity-50"
        >
          Перенести
        </button>
      </div>
    </div>
  );
}
