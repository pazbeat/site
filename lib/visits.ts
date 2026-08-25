import "server-only";
import { prisma } from "./db";
import { almatyDayKey } from "./admin/period";
import { isChannel } from "./source";

/**
 * Засчитать заход в дневной агрегат.
 *
 * Единственное место, где аналитика пишет в базу. Никакого публичного
 * маршрута для этого намеренно нет: открытый POST, увеличивающий счётчик,
 * позволял бы накрутить знаменатель конверсии одной строкой в терминале —
 * и все цифры отчёта стали бы недоказуемыми.
 *
 * Ошибки глотаем: аналитика не имеет права ронять страницу покупателю.
 */
export async function countVisit(
  channel: string,
  stage: "visit" | "builder",
): Promise<void> {
  if (!isChannel(channel)) return;
  // День режем по Алматы, а не по UTC: иначе граница агрегата разъедется с
  // отчётами админки на пять часов, и вечерние заходы уедут в завтра.
  const day = new Date(`${almatyDayKey(new Date())}T00:00:00Z`);
  try {
    await prisma.visitStat.upsert({
      where: { day_source_stage: { day, source: channel, stage } },
      create: { day, source: channel, stage, visits: 1 },
      update: { visits: { increment: 1 } },
    });
  } catch {
    // молча: счётчик не стоит того, чтобы из-за него не открылась страница
  }
}
