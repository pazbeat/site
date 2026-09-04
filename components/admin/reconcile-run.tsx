"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { runReconcileAction } from "@/app/admin/reconcile/actions";

/** Прогнать сверку сейчас — когда покупатель на линии и ждать 10 минут нельзя. */
export function ReconcileRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (toastResult(await runReconcileAction())) router.refresh();
        })
      }
      className="rounded-full bg-brand-purple px-5 py-2.5 text-sm font-bold whitespace-nowrap text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
    >
      {pending ? "Проверяем…" : "Проверить сейчас"}
    </button>
  );
}
