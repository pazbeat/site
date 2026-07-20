"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatKzt } from "@/lib/format";
import { optionLabel } from "./program-card";
import type { ProgramDto, ProgramOptionDto } from "@/lib/types";

/**
 * Квиз «Подобрать массаж»: 3 вопроса (кому / что хочется / бюджет) →
 * 2–3 рекомендации с кнопкой «Подарить». Работает целиком на клиенте
 * поверх уже загруженного каталога — ничего не весит и не ходит в сеть.
 * Запрос заказчика: выбор «как у Apple» — меньше вариантов за раз.
 */

type Who = "self" | "her" | "him" | "couple";
type Mood = "relax" | "tension" | "ritual" | "surprise";
type Budget = "b1" | "b2" | "b3" | "any";

const WHO: Who[] = ["her", "him", "couple", "self"];
const MOOD: Mood[] = ["relax", "tension", "ritual", "surprise"];
const BUDGET: Budget[] = ["b1", "b2", "b3", "any"];

function inBudget(price: number, b: Budget): boolean {
  if (b === "b1") return price <= 20000;
  if (b === "b2") return price > 20000 && price <= 35000;
  if (b === "b3") return price > 35000;
  return true;
}

type Pick = { program: ProgramDto; option: ProgramOptionDto };

/** Чистый подбор: фильтр по бюджету/паре + скоринг по настроению и меткам. */
export function pickPrograms(
  programs: ProgramDto[],
  who: Who,
  mood: Mood,
  budget: Budget,
): Pick[] {
  const scored: Array<Pick & { score: number }> = [];

  for (const p of programs) {
    // Паре — только программы с вариантом на 2+ гостей
    let options = who === "couple" ? p.options.filter((o) => (o.persons ?? 0) >= 2) : p.options;
    const budgeted = options.filter((o) => inBudget(o.priceKzt, budget));
    if (budgeted.length) options = budgeted;
    else if (budget !== "any") continue; // вне бюджета — не советуем
    if (!options.length) continue;

    let score = 0;
    if (mood === "relax") score += p.category === "massage" ? 2 : 1;
    if (mood === "tension") score += p.category === "massage" ? 2 : 0;
    if (mood === "ritual") score += p.category === "spa" ? 2 : p.category === "set" ? 1 : 0;
    if (mood === "surprise") score += p.category === "set" ? 2 : p.category === "spa" ? 1 : 0;
    if (p.highlight === "hit") score += 1.5;
    if (p.highlight === "trend") score += 1;
    if (who === "couple" && p.options.some((o) => (o.persons ?? 0) >= 2)) score += 2;

    // Вариант для CTA — самый дешёвый из подходящих
    const option = [...options].sort((a, b) => a.priceKzt - b.priceKzt)[0];
    scored.push({ program: p, option, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

const optBtn = (active: boolean) =>
  `rounded-2xl border-[1.5px] px-5 py-3.5 text-sm font-semibold transition-colors active:scale-[0.97] ${
    active
      ? "border-brand-purple bg-brand-purple text-white"
      : "border-brand-purple-100 bg-white hover:border-brand-gold"
  }`;

export function MassageQuiz({ programs }: Readonly<{ programs: ProgramDto[] }>) {
  const t = useTranslations("Quiz");
  const tCatalog = useTranslations("Catalog");
  const tCommon = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [who, setWho] = useState<Who | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);

  const done = who !== null && mood !== null && budget !== null;
  const picks = useMemo(
    () => (done ? pickPrograms(programs, who!, mood!, budget!) : []),
    [done, programs, who, mood, budget],
  );

  const restart = () => {
    setWho(null);
    setMood(null);
    setBudget(null);
    setStep(0);
  };

  const guests = (count: number) => tCommon("guests", { count });
  const hourUnit = tCommon("hour");

  if (!open) {
    return (
      <div className="mx-auto mb-10 flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-brand-gold/40 bg-brand-purple-50/40 px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="font-display text-xl font-semibold text-brand-purple">
            {t("teaser")}
          </p>
          <p className="mt-1 text-sm text-brand-purple-950/60">{t("teaserSub")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-gold-gradient shrink-0 rounded-full px-7 py-3.5 text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
        >
          {t("start")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-10 max-w-3xl rounded-3xl border border-brand-gold/40 bg-white p-6 shadow-sm sm:p-8">
      {!done ? (
        <div key={step} className="step-enter">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold text-brand-purple">
              {t(step === 0 ? "q1" : step === 1 ? "q2" : "q3")}
            </h2>
            <span className="shrink-0 text-xs font-bold tracking-[0.2em] text-brand-gold-700">
              {step + 1} / 3
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {step === 0 &&
              WHO.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={optBtn(who === v)}
                  onClick={() => {
                    setWho(v);
                    setStep(1);
                  }}
                >
                  {t(`who_${v}`)}
                </button>
              ))}
            {step === 1 &&
              MOOD.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={optBtn(mood === v)}
                  onClick={() => {
                    setMood(v);
                    setStep(2);
                  }}
                >
                  {t(`mood_${v}`)}
                </button>
              ))}
            {step === 2 &&
              BUDGET.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={optBtn(budget === v)}
                  onClick={() => setBudget(v)}
                >
                  {t(`budget_${v}`)}
                </button>
              ))}
          </div>
          {step > 0 && (
            <button
              type="button"
              onClick={() => {
                if (step === 1) setWho(null);
                if (step === 2) setMood(null);
                setStep((s) => s - 1);
              }}
              className="mt-5 text-sm font-semibold text-brand-purple-800 hover:text-brand-gold-700"
            >
              ← {tCommon("back")}
            </button>
          )}
        </div>
      ) : (
        <div className="step-enter">
          <h2 className="mb-1 font-display text-2xl font-semibold text-brand-purple">
            {picks.length ? t("resultTitle") : t("noMatch")}
          </h2>
          {picks.length > 0 && (
            <p className="mb-5 text-sm text-brand-purple-950/60">{t("resultSub")}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {picks.map(({ program, option }) => (
              <div
                key={program.id}
                className="flex flex-col rounded-2xl border border-brand-purple-100 p-4"
              >
                {program.highlight && (
                  <span className="mb-2 self-start rounded-full bg-brand-gold-100/60 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-brand-gold-700 uppercase">
                    {tCatalog(
                      program.highlight === "hit"
                        ? "badgeHit"
                        : program.highlight === "trend"
                          ? "badgeTrend"
                          : "badgeSeason",
                    )}
                  </span>
                )}
                <b className="font-display text-lg leading-tight text-brand-purple">
                  {program.name}
                </b>
                <span className="mt-1 text-xs text-brand-purple-950/55">
                  {optionLabel(option, guests, hourUnit)}
                </span>
                <span className="mt-2 mb-3 flex-1 text-sm font-bold text-brand-gold-700">
                  {formatKzt(option.priceKzt)}
                </span>
                <Link
                  href={`/create?option=${option.id}`}
                  className="rounded-full bg-brand-purple px-4 py-2.5 text-center text-xs font-bold text-white transition-colors hover:bg-brand-purple-600 active:scale-[0.97]"
                >
                  {t("give")}
                </Link>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={restart}
            className="mt-5 text-sm font-semibold text-brand-purple-800 hover:text-brand-gold-700"
          >
            ↺ {t("restart")}
          </button>
        </div>
      )}
    </div>
  );
}
