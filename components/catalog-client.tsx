"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ProgramCard } from "./program-card";
import type { ProgramDto } from "@/lib/types";

type Filter = "all" | "pop" | "massage" | "spa" | "set";
type Sort = "def" | "asc" | "desc";
type Duration = "all" | "60" | "90" | "120";

const FILTERS: Array<{ id: Filter; key: string }> = [
  { id: "all", key: "filterAll" },
  { id: "pop", key: "filterPopular" },
  { id: "massage", key: "filterMassage" },
  { id: "spa", key: "filterSpa" },
  { id: "set", key: "filterSet" },
];

const minPrice = (p: ProgramDto) =>
  Math.min(...p.options.map((o) => o.priceKzt));

export function CatalogClient({
  programs,
}: Readonly<{ programs: ProgramDto[] }>) {
  const t = useTranslations("Catalog");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("def");
  const [duration, setDuration] = useState<Duration>("all");

  const visible = useMemo(() => {
    let list = programs.filter((p) =>
      filter === "all" ? true : filter === "pop" ? p.popular : p.category === filter,
    );
    if (duration !== "all") {
      list = list.filter((p) =>
        p.options.some((o) => {
          const minutes = o.durationMin ?? 180; // SPA на гостей ≈ 3 часа
          if (duration === "60") return minutes <= 60;
          if (duration === "90") return minutes === 90;
          return minutes >= 120;
        }),
      );
    }
    if (sort === "asc") list = [...list].sort((a, b) => minPrice(a) - minPrice(b));
    if (sort === "desc") list = [...list].sort((a, b) => minPrice(b) - minPrice(a));
    return list;
  }, [programs, filter, sort, duration]);

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-center gap-2.5">
        {FILTERS.map(({ id, key }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-full border-[1.5px] px-4.5 py-2 text-sm font-semibold transition-colors ${
              filter === id
                ? "border-brand-purple bg-brand-purple text-white"
                : "border-brand-purple-100 bg-white hover:border-brand-gold"
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div className="mb-9 flex flex-wrap justify-center gap-3">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label={t("sortDefault")}
          className="rounded-full border-[1.5px] border-brand-purple-100 bg-white px-4 py-2 text-sm font-semibold outline-none focus:border-brand-gold"
        >
          <option value="def">{t("sortDefault")}</option>
          <option value="asc">{t("sortAsc")}</option>
          <option value="desc">{t("sortDesc")}</option>
        </select>
        <select
          value={duration}
          onChange={(e) => setDuration(e.target.value as Duration)}
          aria-label={t("durAll")}
          className="rounded-full border-[1.5px] border-brand-purple-100 bg-white px-4 py-2 text-sm font-semibold outline-none focus:border-brand-gold"
        >
          <option value="all">{t("durAll")}</option>
          <option value="60">{t("dur60")}</option>
          <option value="90">{t("dur90")}</option>
          <option value="120">{t("dur120")}</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <p className="text-center text-brand-purple-950/60">{t("empty")}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}
    </>
  );
}
