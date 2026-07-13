"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProgramAction } from "@/app/admin/programs/actions";

type Option = {
  id?: number;
  durationMin: string;
  persons: string;
  priceKzt: string;
};

export type ProgramEditorData = {
  id?: number;
  category: "massage" | "spa" | "set";
  nameRu: string;
  nameKk: string;
  nameEn: string;
  descRu: string;
  descKk: string;
  descEn: string;
  popular: boolean;
  active: boolean;
  cities: string;
  options: Option[];
};

const inputCls =
  "w-full rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold";
const labelCls = "mb-1 block text-xs font-bold text-brand-purple-950/70";

export function ProgramEditor({
  initial,
}: Readonly<{ initial: ProgramEditorData }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [options, setOptions] = useState<Option[]>(initial.options);

  const setOpt = (i: number, patch: Partial<Option>) =>
    setOptions((prev) =>
      prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    );

  const submit = (formData: FormData) => {
    setError("");
    const cleaned = options
      .filter((o) => o.priceKzt)
      .map((o) => ({
        id: o.id,
        durationMin: o.durationMin ? Number(o.durationMin) : undefined,
        persons: o.persons ? Number(o.persons) : undefined,
        priceKzt: Number(o.priceKzt),
      }));
    if (cleaned.length === 0) {
      setError("Добавьте хотя бы один вариант с ценой.");
      return;
    }
    formData.set("options", JSON.stringify(cleaned));
    startTransition(async () => {
      const result = await saveProgramAction(formData);
      if (result?.error) setError(result.error);
      else router.push("/admin/programs");
    });
  };

  return (
    <form action={submit} className="max-w-2xl space-y-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div>
        <label className={labelCls}>Категория</label>
        <select name="category" defaultValue={initial.category} className={inputCls}>
          <option value="massage">Массаж</option>
          <option value="spa">SPA</option>
          <option value="set">Сет</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Название RU</label>
          <input name="nameRu" defaultValue={initial.nameRu} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Название KK</label>
          <input name="nameKk" defaultValue={initial.nameKk} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Название EN</label>
          <input name="nameEn" defaultValue={initial.nameEn} required className={inputCls} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Описание RU</label>
          <textarea name="descRu" defaultValue={initial.descRu} className={inputCls} rows={2} />
        </div>
        <div>
          <label className={labelCls}>Описание KK</label>
          <textarea name="descKk" defaultValue={initial.descKk} className={inputCls} rows={2} />
        </div>
        <div>
          <label className={labelCls}>Описание EN</label>
          <textarea name="descEn" defaultValue={initial.descEn} className={inputCls} rows={2} />
        </div>
      </div>

      <div>
        <label className={labelCls}>
          Города доступности (через запятую; пусто = вся сеть)
        </label>
        <input
          name="cities"
          defaultValue={initial.cities}
          placeholder="Астана, Алматы"
          className={inputCls}
        />
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="popular"
            defaultChecked={initial.popular}
            className="h-4 w-4 accent-brand-purple"
          />
          Популярное
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initial.active}
            className="h-4 w-4 accent-brand-purple"
          />
          Активно
        </label>
      </div>

      <div>
        <div className="mb-2 text-sm font-bold">Варианты</div>
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div>
                <label className={labelCls}>Мин</label>
                <input
                  type="number"
                  value={opt.durationMin}
                  onChange={(e) => setOpt(i, { durationMin: e.target.value })}
                  className={`${inputCls} w-24`}
                />
              </div>
              <div>
                <label className={labelCls}>Гостей</label>
                <input
                  type="number"
                  value={opt.persons}
                  onChange={(e) => setOpt(i, { persons: e.target.value })}
                  className={`${inputCls} w-24`}
                />
              </div>
              <div>
                <label className={labelCls}>Цена ₸</label>
                <input
                  type="number"
                  value={opt.priceKzt}
                  onChange={(e) => setOpt(i, { priceKzt: e.target.value })}
                  className={`${inputCls} w-32`}
                />
              </div>
              <button
                type="button"
                onClick={() => setOptions((p) => p.filter((_, idx) => idx !== i))}
                className="rounded-lg border border-brand-red/40 px-3 py-2 text-xs font-bold text-brand-red"
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setOptions((p) => [...p, { durationMin: "", persons: "", priceKzt: "" }])
          }
          className="mt-2 rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-1.5 text-sm font-bold hover:border-brand-gold"
        >
          + Вариант
        </button>
      </div>

      {error && <p className="text-sm font-semibold text-brand-red">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-purple px-7 py-3 text-sm font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50"
      >
        Сохранить
      </button>
    </form>
  );
}
