"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSalonAction,
  updateSalonAction,
  toggleSalonActiveAction,
  deleteSalonAction,
  moveSalonAction,
  renameCityAction,
} from "@/app/admin/salons/actions";

export type AdminSalon = {
  id: number;
  city: string;
  cityKk: string;
  cityEn: string;
  name: string;
  address: string;
  addressKk: string;
  addressEn: string;
  phone: string;
  codePrefix: string | null;
  altegioLocationId: number | null;
  active: boolean;
  ordersCount: number;
  certsCount: number;
};

type Result = { error?: string; ok?: boolean } | undefined;

const inputCls =
  "w-full rounded-lg border-[1.5px] border-brand-purple-100 px-3 py-2 text-sm outline-none focus:border-brand-gold";
const labelCls = "mb-1 block text-xs font-semibold text-brand-purple-950/70";
const btnPrimary =
  "rounded-full bg-brand-purple px-5 py-2 text-sm font-bold text-white hover:bg-brand-purple-600 disabled:opacity-50";
const btnGhost =
  "rounded-full border border-brand-purple-100 px-3 py-1 text-xs font-semibold text-brand-purple hover:bg-brand-purple-50 disabled:opacity-30";

const CITIES_LIST_ID = "admin-city-suggestions";

export function SalonsAdmin({ salons }: Readonly<{ salons: AdminSalon[] }>) {
  const [adding, setAdding] = useState(false);

  // Группируем по русскому ключу города, порядок городов — по первому салону
  const groups: Array<{ city: string; items: AdminSalon[] }> = [];
  for (const s of salons) {
    const g = groups.find((x) => x.city === s.city);
    if (g) g.items.push(s);
    else groups.push({ city: s.city, items: [s] });
  }
  const cityNames = [...new Set(salons.map((s) => s.city))];

  return (
    <div className="space-y-6">
      <datalist id={CITIES_LIST_ID}>
        {cityNames.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {adding ? (
        <div className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <div className="mb-3 text-sm font-bold text-brand-purple">Новый салон</div>
          <SalonForm
            submitLabel="Добавить салон"
            onSubmit={createSalonAction}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={btnPrimary}>
          + Добавить салон
        </button>
      )}

      {groups.map((g) => (
        <CityGroup key={g.city} city={g.city} items={g.items} salons={salons} />
      ))}
    </div>
  );
}

function CityGroup({
  city,
  items,
  salons,
}: Readonly<{ city: string; items: AdminSalon[]; salons: AdminSalon[] }>) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    city,
    cityKk: items[0].cityKk,
    cityEn: items[0].cityEn,
  });

  function save() {
    setError("");
    start(async () => {
      const fd = new FormData();
      fd.set("oldCity", city);
      fd.set("city", form.city);
      fd.set("cityKk", form.cityKk);
      fd.set("cityEn", form.cityEn);
      const res = await renameCityAction(fd);
      if (res?.error) setError(res.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-2xl border border-brand-purple-100 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-purple-100 px-5 py-3.5">
        {editing ? (
          <div className="w-full space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Город RU (ключ)</label>
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>KK</label>
                <input
                  value={form.cityKk}
                  onChange={(e) => setForm({ ...form, cityKk: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>EN</label>
                <input
                  value={form.cityEn}
                  onChange={(e) => setForm({ ...form, cityEn: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <p className="text-xs text-brand-purple-950/50">
              Переводы применятся ко всем салонам города. Смена русского названия
              заодно обновит списки городов в программах.
            </p>
            {error && (
              <p className="text-xs font-semibold text-brand-red">{error}</p>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={save} className={btnPrimary}>
                Сохранить город
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError("");
                  setForm({ city, cityKk: items[0].cityKk, cityEn: items[0].cityEn });
                }}
                className="rounded-full border border-brand-purple-100 px-5 py-2 text-sm text-brand-purple-950/60"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h2 className="font-display text-lg font-semibold text-brand-purple">
                {city}
              </h2>
              <p className="text-xs text-brand-purple-950/50">
                KK: {items[0].cityKk} · EN: {items[0].cityEn} · салонов:{" "}
                {items.length}
              </p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className={btnGhost}>
              Изменить город
            </button>
          </>
        )}
      </header>

      <ul className="divide-y divide-brand-purple-100">
        {items.map((s) => (
          <SalonRow
            key={s.id}
            salon={s}
            isFirst={salons[0]?.id === s.id}
            isLast={salons[salons.length - 1]?.id === s.id}
          />
        ))}
      </ul>
    </section>
  );
}

function SalonRow({
  salon,
  isFirst,
  isLast,
}: Readonly<{ salon: AdminSalon; isFirst: boolean; isLast: boolean }>) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function run(fn: () => Promise<Result>) {
    setError("");
    start(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const fd = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("id", String(salon.id));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };

  const canDelete = salon.ordersCount === 0 && salon.certsCount === 0;

  if (editing) {
    return (
      <li className="bg-brand-purple-50/30 px-5 py-4">
        <SalonForm
          salon={salon}
          submitLabel="Сохранить"
          onSubmit={updateSalonAction}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className={`px-5 py-4 ${salon.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-brand-purple">{salon.name}</span>
            {salon.codePrefix && (
              <span className="rounded-full bg-brand-purple-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-brand-purple">
                {salon.codePrefix}
              </span>
            )}
            {!salon.active && (
              <span className="rounded-full bg-brand-purple-950/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                Скрыт
              </span>
            )}
            {!salon.altegioLocationId && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                Altegio не привязан
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-brand-purple-950/75">{salon.address}</div>
          <div className="mt-0.5 text-xs text-brand-purple-950/45">
            KK: {salon.addressKk} · EN: {salon.addressEn}
          </div>
          <div className="mt-0.5 text-xs text-brand-purple-950/45">
            {salon.phone}
            {salon.altegioLocationId ? ` · Altegio ${salon.altegioLocationId}` : ""}
            {` · заказов ${salon.ordersCount}, сертификатов ${salon.certsCount}`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setEditing(true)} className={btnGhost}>
            Изменить
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => toggleSalonActiveAction(fd()))}
            className={btnGhost}
          >
            {salon.active ? "Скрыть" : "Показать"}
          </button>
          <button
            type="button"
            disabled={pending || isFirst}
            onClick={() => run(() => moveSalonAction(fd({ dir: "up" })))}
            className={btnGhost}
            title="Выше"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={pending || isLast}
            onClick={() => run(() => moveSalonAction(fd({ dir: "down" })))}
            className={btnGhost}
            title="Ниже"
          >
            ↓
          </button>
          {canDelete && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`Удалить салон «${salon.name}»?`)) {
                  run(() => deleteSalonAction(fd()));
                }
              }}
              className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-brand-red hover:bg-red-50"
            >
              Удалить
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-brand-red">{error}</p>}
    </li>
  );
}

function SalonForm({
  salon,
  submitLabel,
  onSubmit,
  onDone,
  onCancel,
}: Readonly<{
  salon?: AdminSalon;
  submitLabel: string;
  onSubmit: (fd: FormData) => Promise<Result>;
  onDone: () => void;
  onCancel: () => void;
}>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  return (
    <form
      action={(fd) => {
        setError("");
        if (salon) fd.set("id", String(salon.id));
        start(async () => {
          const res = await onSubmit(fd);
          if (res?.error) setError(res.error);
          else {
            onDone();
            router.refresh();
          }
        });
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Город RU (ключ) *</label>
          <input
            name="city"
            list={CITIES_LIST_ID}
            defaultValue={salon?.city}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Город KK *</label>
          <input name="cityKk" defaultValue={salon?.cityKk} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Город EN *</label>
          <input name="cityEn" defaultValue={salon?.cityEn} required className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Название салона (внутреннее) *</label>
        <input
          name="name"
          defaultValue={salon?.name}
          required
          placeholder="Имбирь в ЖК «Глория»"
          className={inputCls}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Адрес RU *</label>
          <input name="address" defaultValue={salon?.address} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Адрес KK *</label>
          <input name="addressKk" defaultValue={salon?.addressKk} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Адрес EN *</label>
          <input name="addressEn" defaultValue={salon?.addressEn} required className={inputCls} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Телефон *</label>
          <input
            name="phone"
            defaultValue={salon?.phone ?? "+7 708 111 8098"}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Префикс серийника</label>
          <input
            name="codePrefix"
            defaultValue={salon?.codePrefix ?? ""}
            placeholder="WS"
            maxLength={4}
            className={`${inputCls} font-mono uppercase`}
          />
          <p className="mt-1 text-[11px] text-brand-purple-950/45">
            Внутренняя нумерация: WS001, WS002…
          </p>
        </div>
        <div>
          <label className={labelCls}>Altegio company_id</label>
          <input
            name="altegioLocationId"
            defaultValue={salon?.altegioLocationId ?? ""}
            inputMode="numeric"
            placeholder="225022"
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-brand-purple-950/45">
            Пусто — выпуск в Altegio не пойдёт.
          </p>
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-brand-red">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Сохранение…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-brand-purple-100 px-5 py-2 text-sm text-brand-purple-950/60"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
