"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResult } from "./toast";

/** Селект, отправляющий server action при изменении. */
export function StatusSelect({
  id,
  value,
  options,
  action,
  name = "status",
  done = "Статус изменён.",
}: Readonly<{
  id: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  action: (fd: FormData) => Promise<{ ok?: boolean; error?: string; message?: string }>;
  /** Имя поля в FormData — action может ждать не «status» */
  name?: string;
  done?: string;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      disabled={pending}
      defaultValue={value}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set(name, e.target.value);
        startTransition(async () => {
          if (toastResult(await action(fd), done)) router.refresh();
        });
      }}
      className="rounded-lg border-[1.5px] border-brand-purple-100 px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-brand-gold disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
