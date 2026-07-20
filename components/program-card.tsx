"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDuration, formatKzt } from "@/lib/format";
import type { ProgramDto, ProgramOptionDto } from "@/lib/types";

const CATEGORY_KEY = {
  massage: "filterMassage",
  spa: "filterSpa",
  set: "filterSet",
} as const;

export const HIGHLIGHT_KEY = {
  hit: "badgeHit",
  trend: "badgeTrend",
  season: "badgeSeason",
} as const;

export function optionLabel(
  option: ProgramOptionDto,
  guests: (count: number) => string,
  hourUnit: string,
): string {
  if (option.persons) return guests(option.persons);
  if (option.durationMin) return formatDuration(option.durationMin, hourUnit);
  return "";
}

export function ProgramCard({ program }: Readonly<{ program: ProgramDto }>) {
  const t = useTranslations("Catalog");
  const tCommon = useTranslations("Common");
  const [selected, setSelected] = useState(0);

  const minPrice = Math.min(...program.options.map((o) => o.priceKzt));
  const guests = (count: number) => tCommon("guests", { count });
  const hourUnit = tCommon("hour");

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-brand-purple-100 bg-white transition-shadow hover:shadow-xl">
      <div className="relative flex h-44 items-end overflow-hidden bg-brand-gradient p-4">
        {program.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- внешние фото imbir.kz до переноса в своё хранилище
          <img
            src={program.photoUrl}
            alt={program.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-brand-purple-950/10 via-transparent to-brand-purple-950/60"
        />
        <span className="relative rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold tracking-wide text-brand-purple uppercase">
          {t(CATEGORY_KEY[program.category])}
        </span>
        {program.highlight && (
          <span className="bg-gold-gradient absolute top-3.5 right-3.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide text-white uppercase shadow-md">
            {t(HIGHLIGHT_KEY[program.highlight])}
          </span>
        )}
        <span className="bg-gold-gradient absolute right-3.5 bottom-3.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-white shadow-md">
          {tCommon("from", { price: formatKzt(minPrice) })}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-semibold text-brand-purple">
          {program.name}
        </h3>
        <p className="mt-1 mb-3 flex-1 text-sm text-brand-purple-950/70">
          {program.description}
        </p>
        {program.cities.length > 0 && (
          <p className="mb-3 text-xs font-semibold text-brand-gold-700">
            {t("onlyCities", { cities: program.cities.join(", ") })}
          </p>
        )}
        <div className="mb-4 flex flex-col gap-2">
          {program.options.map((option, index) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelected(index)}
              className={`flex items-center justify-between rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                index === selected
                  ? "border-brand-purple bg-brand-purple-50"
                  : "border-brand-purple-100 hover:border-brand-gold"
              }`}
            >
              <span>{optionLabel(option, guests, hourUnit)}</span>
              <b className="text-brand-purple">{formatKzt(option.priceKzt)}</b>
            </button>
          ))}
        </div>
        <Link
          href={`/create?option=${program.options[selected].id}`}
          className="rounded-full bg-brand-purple px-5 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-brand-purple-600"
        >
          {t("buy")}
        </Link>
      </div>
    </article>
  );
}
