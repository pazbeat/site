"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";

/** Кнопка активации/деактивации записи (деактивация вместо удаления). */
export function ToggleActiveButton({
  id,
  active,
  action,
}: Readonly<{
  id: number;
  active: boolean;
  action: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.set("id", String(id));
        startTransition(async () => {
          const done = active ? "Скрыто." : "Показано.";
          if (toastResult(await action(fd), done)) router.refresh();
        });
      }}
      className="rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-1.5 text-xs font-bold hover:border-brand-gold disabled:opacity-50"
    >
      {active ? "Скрыть" : "Показать"}
    </button>
  );
}
