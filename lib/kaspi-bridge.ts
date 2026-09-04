import "server-only";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { resolveProgramTitle } from "@/lib/altegio/catalog";
import { normalizeOrderRef } from "@/lib/order-ref";

/**
 * Мост для Kaspi через бэкенд действующего сайта.
 *
 * Ссылка и QR Kaspi несут только номер заказа — сумму и вид услуги
 * приложение спрашивает у бэкенда мерчанта. Kaspi ходит на старый сайт, наших
 * заказов он не знает, поэтому покупатель упирается в «проверьте правильность
 * ввода данных» (проверено живьём 2026-08-21).
 *
 * Пока Kaspi не перенаправили на наш домен, старый сайт проксирует: не найдя
 * заказ у себя, спрашивает нас, а после оплаты сообщает нам о ней. Протокол
 * Kaspi при этом целиком остаётся на его стороне — нам нужны только два
 * простых вызова, и знать формат Kaspi нам не требуется.
 *
 * Оба вызова закрыты общим секретом `KASPI_BRIDGE_TOKEN`: `paid` переводит
 * заказ в оплаченные и выпускает сертификат, такое наружу открывать нельзя.
 * Без секрета в окружении мост выключен целиком.
 */

export type BridgeOrder = {
  orderId: string;
  /** Короткий номер, под которым заказ виден в Kaspi */
  kaspiRef: string | null;
  /** Каким способом покупатель выбрал платить: мосту Kaspi чужие не отдаём */
  paymentProvider: string | null;
  /** Вид услуги — то, что покупатель увидит в приложении Kaspi */
  name: string;
  amountKzt: number;
  /** Та же сумма в тиынах — если шлюзу удобнее так */
  amountTiyn: number;
  status: string;
  city: string;
  salon: string;
  createdAt: string;
};

/** Секрет моста; null — мост выключен. */
export function bridgeToken(): string | null {
  const token = process.env.KASPI_BRIDGE_TOKEN?.trim();
  return token ? token : null;
}

/**
 * Проверяет секрет из заголовка. Сравнение постоянного времени: обычное
 * сравнение строк выходит из цикла на первом несовпавшем символе и по времени
 * ответа позволяет подбирать секрет посимвольно.
 */
export function bridgeAuthorized(request: Request): boolean {
  const expected = bridgeToken();
  if (!expected) return false;

  const header =
    request.headers.get("x-bridge-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type OrderItem = {
  type?: string;
  programId?: number;
  programOptionId?: number;
  amountKzt?: number;
};

/**
 * Вид услуги для приложения Kaspi. Для номинала — как называются
 * товары-сертификаты в их каталоге («Новый Электронный 20000»), для программы
 * — её название из CRM, иначе название программы с сайта.
 */
async function serviceName(
  item: OrderItem,
  faceAmountKzt: number,
): Promise<string> {
  if (item.type === "program" && item.programId) {
    const program = await prisma.program.findUnique({
      where: { id: item.programId },
    });
    const nameRu = (program?.names as { ru?: string } | null)?.ru?.trim();
    if (nameRu) {
      return resolveProgramTitle(nameRu, faceAmountKzt) ?? nameRu;
    }
  }
  return `Новый Электронный ${faceAmountKzt}`;
}

/**
 * Данные заказа для проверки в Kaspi; null — заказа нет.
 *
 * Ищем и по короткому номеру, и по внутреннему: наружу уходит короткий
 * (двадцать цифр — наш внутренний в 25 знаков приложение отбрасывает по
 * маске), но заказы,
 * созданные до его появления, короткого не имеют.
 */
export async function describeOrder(
  ref: string,
): Promise<BridgeOrder | null> {
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ kaspiRef: normalizeOrderRef(ref) }, { id: ref }],
    },
    include: { salon: true },
  });
  if (!order) return null;

  const item = (order.item ?? {}) as OrderItem;
  // Показываем сумму К ОПЛАТЕ (со скидкой промокода), а не номинал
  const amountKzt = order.amountKzt;

  return {
    orderId: order.id,
    kaspiRef: order.kaspiRef,
    paymentProvider: order.paymentProvider,
    name: await serviceName(item, item.amountKzt ?? amountKzt),
    amountKzt,
    amountTiyn: amountKzt * 100,
    status: order.status,
    city: order.salon.city,
    salon: order.salon.name,
    createdAt: order.createdAt.toISOString(),
  };
}
