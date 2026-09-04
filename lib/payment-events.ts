import "server-only";
import { prisma } from "./db";

/**
 * Запись в журнал платежа.
 *
 * Пишем только осмысленные переходы: выставили счёт, подтвердили оплату,
 * получили отказ, увидели отмену, не смогли спросить статус. Обычный ответ
 * «ещё не оплачено» не пишем — поллер спрашивает раз в минуту, и журнал
 * состоял бы из него одного, а нужное в нём было бы не найти.
 *
 * Никогда не бросает. Журнал — вспомогательная запись; уронить из-за неё
 * подтверждение оплаты было бы ровно тем, от чего мы защищаемся.
 */

export type PaymentEventKind =
  | "invoice"
  | "paid"
  | "repaired"
  | "failed"
  | "reversed"
  | "error";

export type PaymentEventSource =
  | "page"
  | "poller"
  | "bridge"
  | "manual"
  | "reconcile"
  | "webhook"
  | "invoice";

export async function recordPaymentEvent(input: {
  orderId: string;
  provider: string | null | undefined;
  source: PaymentEventSource;
  kind: PaymentEventKind;
  externalRef?: string | null;
  statusRaw?: string | null;
  amountKzt?: number | null;
  note?: string | null;
}): Promise<void> {
  try {
    await prisma.paymentEvent.create({
      data: {
        orderId: input.orderId,
        provider: (input.provider ?? "—").slice(0, 16),
        source: input.source,
        kind: input.kind,
        externalRef: input.externalRef?.slice(0, 128) ?? null,
        statusRaw: input.statusRaw?.slice(0, 64) ?? null,
        amountKzt: input.amountKzt ?? null,
        note: input.note?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    console.error("payment-event: не записано", error);
  }
}

const KIND_LABEL: Record<PaymentEventKind, string> = {
  invoice: "Счёт выставлен",
  paid: "Оплата подтверждена",
  repaired: "Сертификат довыпущен",
  failed: "Платёж отклонён",
  reversed: "Платёж отменён банком",
  error: "Не удалось узнать статус",
};

const SOURCE_LABEL: Record<PaymentEventSource, string> = {
  page: "страница оплаты",
  poller: "фоновая проверка",
  bridge: "мост Kaspi",
  manual: "вручную из админки",
  reconcile: "сверка",
  webhook: "вебхук",
  invoice: "создание счёта",
};

/** Человеческая подпись события для карточки заказа. */
export function describePaymentEvent(event: {
  kind: string;
  source: string;
}): string {
  const kind = KIND_LABEL[event.kind as PaymentEventKind] ?? event.kind;
  const source = SOURCE_LABEL[event.source as PaymentEventSource] ?? event.source;
  return `${kind} · ${source}`;
}
