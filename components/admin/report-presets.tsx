import Link from "next/link";

/**
 * Быстрый выбор периода: сегодня, вчера, неделя, месяц, квартал, год.
 *
 * Ссылками, а не формой: бухгалтер открывает отчёт по многу раз в день, и
 * каждый лишний клик по выпадающему списку — это её время. Даты считаются по
 * Алматы: «сегодня» должно означать сегодняшнюю смену, а не сегодняшний UTC.
 */

const ALMATY_SHIFT = 5 * 3_600_000;

/** YYYY-MM-DD того дня, в котором момент находится по алматинскому времени. */
function almatyDay(at: Date): string {
  return new Date(at.getTime() + ALMATY_SHIFT).toISOString().slice(0, 10);
}

function shiftDays(day: string, delta: number): string {
  const base = new Date(`${day}T00:00:00Z`).getTime();
  return new Date(base + delta * 24 * 3_600_000).toISOString().slice(0, 10);
}

export type Preset = { label: string; from: string; to: string };

export function buildPresets(now: Date = new Date()): Preset[] {
  const today = almatyDay(now);
  const yesterday = shiftDays(today, -1);
  // Неделя — понедельник текущей недели по Алматы
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = shiftDays(today, -weekday);
  const monthStart = `${today.slice(0, 7)}-01`;
  const year = today.slice(0, 4);
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  const quarterStart = `${year}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;

  return [
    { label: "Сегодня", from: today, to: today },
    { label: "Вчера", from: yesterday, to: yesterday },
    { label: "Неделя", from: monday, to: today },
    { label: "Месяц", from: monthStart, to: today },
    { label: "Квартал", from: quarterStart, to: today },
    { label: "Год", from: `${year}-01-01`, to: today },
  ];
}

export function ReportPresets({
  basePath,
  active,
  now = new Date(),
}: Readonly<{ basePath: string; active?: string; now?: Date }>) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {buildPresets(now).map((preset) => {
        const href = `${basePath}?from=${preset.from}&to=${preset.to}`;
        const current = active === `${preset.from}:${preset.to}`;
        return (
          <Link
            key={preset.label}
            href={href}
            className={
              current
                ? "rounded-full bg-brand-purple px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border border-brand-purple-100 px-4 py-1.5 text-sm text-brand-purple-950/70 hover:border-brand-gold"
            }
          >
            {preset.label}
          </Link>
        );
      })}
    </div>
  );
}
