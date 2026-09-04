"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";
import { uploadStatementAction } from "@/app/admin/certificates/statement/actions";

/**
 * Загрузка выписки: файл, чья она и за какой период.
 *
 * Период передаётся скрытыми полями из выбранного на странице — сверять
 * августовскую выписку с сентябрьскими продажами бессмысленно, и выбирать
 * период дважды человек не должен.
 */
export function StatementUpload({
  month,
  from,
  to,
}: Readonly<{ month?: string; from?: string; to?: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          if (toastResult(await uploadStatementAction(formData))) {
            router.refresh();
          }
        })
      }
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-purple-100 bg-white p-5"
    >
      {month && <input type="hidden" name="month" value={month} />}
      {from && <input type="hidden" name="from" value={from} />}
      {to && <input type="hidden" name="to" value={to} />}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-brand-purple-950/70">
          Чья выписка
        </span>
        <select
          name="source"
          className="rounded-xl border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold"
        >
          <option value="kaspi">Kaspi</option>
          <option value="forte">ForteBank (карты)</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-brand-purple-950/70">
          Файл выписки
        </span>
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,.xls,text/csv"
          required
          className="rounded-xl border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-purple-50 file:px-3 file:py-1 file:text-xs file:font-bold"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-purple px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-purple-600 disabled:opacity-50"
      >
        {pending ? "Сверяем…" : "Загрузить и сверить"}
      </button>

      <p className="w-full text-xs text-brand-purple-950/55">
        Подойдёт CSV или Excel как выгружает банк. Колонки с датой, суммой и
        номером операции находим сами; повторная загрузка за тот же период
        заменяет прежнюю, а не добавляет строки заново.
      </p>
    </form>
  );
}
