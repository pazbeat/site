"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Field = {
  name: string;
  type: "text" | "number";
  placeholder: string;
  required?: boolean;
};

/** Компактная форма создания записи одной строкой (номиналы и т.п.). */
export function InlineCreateForm({
  action,
  fields,
  submitLabel,
}: Readonly<{
  action: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>;
  fields: Field[];
  submitLabel: string;
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <form
      ref={formRef}
      action={(fd) => {
        setError("");
        startTransition(async () => {
          const result = await action(fd);
          if (result?.error) setError(result.error);
          else {
            formRef.current?.reset();
            router.refresh();
          }
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      {fields.map((f) => (
        <input
          key={f.name}
          name={f.name}
          type={f.type}
          required={f.required}
          placeholder={f.placeholder}
          className="rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold"
        />
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50"
      >
        {submitLabel}
      </button>
      {error && <span className="text-sm font-semibold text-brand-red">{error}</span>}
    </form>
  );
}
