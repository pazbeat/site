"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDesignAction } from "@/app/admin/designs/actions";

const PALETTE = ["#4D295D", "#B69244", "#3D2049", "#64367A", "#FFFFFF"];
const inputCls =
  "rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold";

export function DesignEditor() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"solid" | "gradient">("gradient");

  return (
    <form
      ref={formRef}
      action={(fd) => {
        setError("");
        startTransition(async () => {
          const result = await saveDesignAction(fd);
          if (result?.error) setError(result.error);
          else {
            formRef.current?.reset();
            setKind("gradient");
            router.refresh();
          }
        });
      }}
      className="rounded-2xl border border-brand-purple-100 bg-white p-5"
    >
      <div className="mb-3 text-sm font-bold">Новый дизайн</div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <input name="nameRu" required placeholder="Название RU" className={inputCls} />
        <input name="nameKk" required placeholder="Название KK" className={inputCls} />
        <input name="nameEn" required placeholder="Название EN" className={inputCls} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "solid" | "gradient")}
          className={inputCls}
        >
          <option value="gradient">Градиент</option>
          <option value="solid">Заливка</option>
        </select>
        {kind === "solid" ? (
          <label className="flex items-center gap-2 text-sm">
            Цвет
            <input name="color" list="palette" defaultValue="#4D295D" className={`${inputCls} w-32`} />
          </label>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              От
              <input name="from" list="palette" defaultValue="#4D295D" className={`${inputCls} w-32`} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              До
              <input name="to" list="palette" defaultValue="#B69244" className={`${inputCls} w-32`} />
            </label>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          Текст
          <input name="textColor" list="palette" defaultValue="#FFFFFF" className={`${inputCls} w-32`} />
        </label>
        <datalist id="palette">
          {PALETTE.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      {error && <p className="mb-2 text-sm font-semibold text-brand-red">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50"
      >
        Сохранить дизайн
      </button>
    </form>
  );
}
