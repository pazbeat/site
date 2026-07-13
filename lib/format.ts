/** Деньги — integer, целые тенге (PRD §8). */
export function formatKzt(amount: number): string {
  return `${amount.toLocaleString("ru-RU").replace(/ /g, " ")} ₸`;
}

const HOURS: Record<number, string> = {
  60: "1",
  90: "1,5",
  120: "2",
  150: "2,5",
  180: "3",
};

/** «1,5 ч» / «1.5 h» — подпись варианта длительности. */
export function formatDuration(minutes: number, hourUnit: string): string {
  const hours = HOURS[minutes] ?? String(minutes / 60).replace(".", ",");
  return `${hours} ${hourUnit}`;
}
