import "server-only";
import { prisma } from "./db";
import {
  formatSalonCode,
  generateCertificateCode,
  hashCode,
  maskCode,
} from "./certificate-code";
import { encryptSecret } from "./crypto";
import { getSetting } from "./data";
import { reportFailure } from "./alerts";
import { recordPaymentEvent, type PaymentEventSource } from "./payment-events";
import type { Prisma } from "./generated/prisma/client";

/** Обычный клиент Prisma или клиент внутри транзакции — оба подходят. */
type PrismaLike = Omit<typeof prisma, "$transaction" | "$connect" | "$disconnect" | "$on" | "$extends" | "$use"> | Prisma.TransactionClient;

/**
 * Следующий номер сертификата по салону: WM9001, WM9002… Атомарно
 * инкрементит счётчик салона (single UPDATE … RETURNING — без гонок).
 * Если у салона не задан codePrefix, номер не присваивается (null) и код
 * выдаётся случайный.
 *
 * Счётчик начинается с 9001, а не с единицы: в Altegio нумерация филиала
 * общая с действующим сайтом, и низкие номера там местами уже заняты его
 * историей. Поймано живьём 2026-08-26 — WM0006 оказался чужим, Altegio
 * отверг продажу («Gift card with such number already exists»), и сертификат
 * в CRM не появился вовсе. Занятые номера встречаются вразнобой, поэтому
 * одной высокой базы мало: номер ещё и подтверждается в Altegio до отправки
 * письма (см. syncCertificateToAltegio), а на занятый берётся следующий.
 */
export async function nextSalonSerial(
  salonId: number,
  /**
   * Клиент транзакции, если номер берётся внутри неё. Это не украшение:
   * инкремент счётчика и создание сертификата обязаны откатываться вместе,
   * иначе упавший выпуск сжигает номер, а следующий покупатель получает
   * WM9007 после WM9005 — и в кассе появляется дырка, которую никто не
   * объяснит.
   */
  db: PrismaLike = prisma,
): Promise<string | null> {
  const salon = await db.salon.update({
    where: { id: salonId },
    data: { lastCertSerial: { increment: 1 } },
    select: { codePrefix: true, lastCertSerial: true },
  });
  if (!salon.codePrefix) return null;
  return formatSalonCode(salon.codePrefix, salon.lastCertSerial);
}

type OrderItem = {
  type: "program" | "nominal";
  programOptionId?: number;
  amountKzt: number;
  designId: number;
  toName: string;
  fromName: string;
  message?: string;
  delivery: {
    method: "email";
    contact: string;
    scheduledAt?: string;
  };
};

/**
 * Подтверждение оплаты (PRD §5.3): переход pending→paid и выпуск сертификата
 * **одной транзакцией**.
 *
 * Раньше это были два отдельных запроса: сначала заказ помечался оплаченным,
 * затем создавался сертификат. Падение между ними (упала база, рестарт
 * контейнера, таймаут) оставляло заказ в состоянии «оплачен, сертификата
 * нет» — а повторный вызов честно отвечал «уже оплачен» и ничего не
 * создавал. Деньги списаны, сертификата нет, починить нечем. Теперь claim,
 * номер и сертификат откатываются вместе, и опрос повторит попытку через
 * минуту.
 *
 * Отсюда же второй режим — **починка**. Если заказ уже `paid`, но
 * сертификата у него нет (последствие старого бага или сбоя снаружи
 * транзакции), выпуск доводится до конца, а не отвергается. Возвращается
 * `repaired`, чтобы это было видно в журнале, а не выглядело обычной
 * продажей.
 *
 * Принимаем и expired: у Kaspi/Forte нет вебхуков, и оплата могла прийти
 * после нашего 30-минутного протухания (API провайдера лежал, сервер
 * рестартовал, покупатель оплатил старый счёт). Деньги первичны —
 * оплаченный заказ воскресает, сертификат выпускается.
 */
export async function fulfillOrder(
  orderId: string,
  externalPaymentId: string,
  /**
   * Кто подтвердил оплату — для журнала платежа. По умолчанию «фоновая
   * проверка»: так вызывает поллер, самый частый путь.
   */
  source: PaymentEventSource = "poller",
): Promise<
  | { status: "fulfilled"; certificateId: string }
  | { status: "repaired"; certificateId: string }
  | { status: "already_fulfilled" }
  | { status: "not_found" }
  | { status: "not_payable" }
> {
  // Читаем настройку ДО транзакции: держать её открытой ради обращения к
  // справочнику незачем, а короткая транзакция — меньше шансов на таймаут.
  const validityMonthsRaw = await getSetting("certificate_validity_months");
  const validityMonths =
    typeof validityMonthsRaw === "number" ? validityMonthsRaw : 3;

  const outcome = await prisma.$transaction(async (tx) => {
    // Блокировка строки заказа на время транзакции. Без неё два одновременных
    // прохода поллера, увидев «оплачен, сертификата нет», выпустили бы по
    // сертификату каждый. Запрос параметризован (правило проекта — никакого
    // склеенного SQL).
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

    const before = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, _count: { select: { certificates: true } } },
    });
    if (!before) return { kind: "not_found" as const };

    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["pending", "expired"] } },
      // paidAt отдельно от createdAt: вебхуков у Kaspi и Forte нет, статус
      // узнаём опросом или подтверждают руками — деньги приходят много позже
      // создания заказа, а иногда и после его протухания.
      data: { status: "paid", paymentId: externalPaymentId, paidAt: new Date() },
    });

    // Сертификат у заказа уже есть — второй не выпускаем НИКОГДА, чем бы ни
    // закончился claim.
    //
    // Раньше эта проверка стояла только в ветке «claim не прошёл», и заказ в
    // состоянии «сертификат есть, а заказ не оплачен» (его же ищет инвариант 2
    // сверки) при подтверждении оплаты получал ВТОРОЙ сертификат: второй
    // номер, вторую продажу в Altegio на те же деньги и второе письмо
    // получателю. Деньги при этом принять надо — заказ выше уже помечен
    // оплаченным, и это правильно.
    if (before._count.certificates > 0) return { kind: "already" as const };

    let repaired = false;
    if (claimed.count === 0) {
      // cancelled / refunded — выпускать нечего
      if (before.status !== "paid") return { kind: "not_payable" as const };
      // Оплачен, а сертификата нет — тот самый случай, ради которого всё это
      repaired = true;
    }

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const item = order.item as OrderItem;

    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + validityMonths);

    // Номер сертификата по салону (WM0001…): атомарный инкремент счётчика.
    // Он же публичный код — один номер и в письме, и в PDF, и в Altegio, как
    // на действующем сайте: кассир ищет в CRM ровно то, что покупатель видит.
    let serial = await nextSalonSerial(order.salonId, tx);
    // Номер мог быть занят: ручной выпуск позволяет задать любой, и счётчик
    // после него подтягивается вперёд, но исторические записи и правки в базе
    // это не покрывают. Проверяем ДО вставки, а не ловим ошибку уникальности:
    // упавший INSERT в Postgres делает всю транзакцию непригодной, и
    // подтверждение оплаты откатилось бы целиком — при каждой попытке.
    for (let attempt = 0; attempt < 10 && serial; attempt += 1) {
      const clash = await tx.certificate.findFirst({
        where: { OR: [{ serial }, { codeHash: hashCode(serial) }] },
        select: { id: true },
      });
      if (!clash) break;
      console.warn(
        `fulfillOrder: номер ${serial} занят — берём следующий (заказ ${orderId})`,
      );
      serial = await nextSalonSerial(order.salonId, tx);
    }
    // Запасной путь: у салона нет префикса — выдаём случайный код, иначе
    // сертификат остался бы вовсе без номера.
    const code = serial ?? generateCertificateCode();

    const certificate = await tx.certificate.create({
      data: {
        orderId: order.id,
        salonId: order.salonId,
        codeHash: hashCode(code),
        codeDisplay: maskCode(code),
        codeEncrypted: encryptSecret(code),
        serial,
        type: item.type,
        programOptionId:
          item.type === "program" ? (item.programOptionId ?? null) : null,
        amountKzt: item.amountKzt,
        balanceKzt: item.amountKzt,
        designId: item.designId,
        toName: item.toName,
        fromName: item.fromName,
        message: item.message || null,
        deliveryMethod: item.delivery.method,
        deliveryContact: item.delivery.contact,
        scheduledAt: item.delivery.scheduledAt
          ? new Date(item.delivery.scheduledAt)
          : null,
        validUntil,
      },
    });

    return {
      kind: "issued" as const,
      certificateId: certificate.id,
      serial: certificate.serial,
      scheduledAt: certificate.scheduledAt,
      provider: order.paymentProvider,
      amountKzt: order.amountKzt,
      repaired,
    };
  },
  {
    // Дольше умолчания (5 с). Внутри только claim, счётчик номера и вставка —
    // это доли секунды, но транзакция подтверждает ОПЛАТУ, и обрывать её из-за
    // секундной задержки базы нельзя: следующий шанс будет через минуту, а
    // покупатель в это время смотрит на «проверяем оплату».
    timeout: 15_000,
  });

  if (outcome.kind === "not_found") return { status: "not_found" };
  if (outcome.kind === "not_payable") return { status: "not_payable" };
  // Повторный вебхук или второй проход опроса — идемпотентный успех
  if (outcome.kind === "already") return { status: "already_fulfilled" };

  const certificate = {
    id: outcome.certificateId,
    serial: outcome.serial,
    scheduledAt: outcome.scheduledAt,
  };
  if (outcome.repaired) {
    // Не «обычная продажа»: заказ был оплачен раньше, а сертификата у него
    // не было. Пусть это видно в журнале — иначе такие случаи растворяются.
    console.warn(
      `fulfillOrder: заказ ${orderId} был оплачен без сертификата — выпущен ${certificate.serial ?? certificate.id}`,
    );
  }

  void recordPaymentEvent({
    orderId,
    provider: outcome.provider,
    source,
    kind: outcome.repaired ? "repaired" : "paid",
    externalRef: externalPaymentId,
    amountKzt: outcome.amountKzt,
    note: certificate.serial ? `сертификат ${certificate.serial}` : null,
  });

  // Запись в Altegio — ДО доставки, и её ждём. Номер сертификата уникален в
  // филиале, а нумерация там общая с действующим сайтом: часть номеров уже
  // занята его историей. На занятом номере выпуск подбирает следующий
  // свободный (см. syncCertificateToAltegio), поэтому письмо должно уходить
  // после — иначе покупатель получит один номер, а в CRM ляжет другой.
  // Сбой синка доставку не отменяет: деньги приняты, сертификат обязан уйти,
  // а провал виден в админке (altegioSyncStatus: failed) и в оповещении.
  try {
    const { syncCertificateToAltegio } = await import("./altegio/sync");
    await syncCertificateToAltegio(certificate.id);
  } catch (error) {
    void reportFailure("Altegio: сертификат не записан в CRM", error, {
      сертификат: certificate.id,
      заказ: orderId,
      серийник: certificate.serial,
    });
  }

  // Доставка: сразу или к назначенной дате. Сбой постановки в очередь
  // не блокирует подтверждение оплаты (вебхук должен ответить 200) —
  // резервный путь: немедленная доставка в фоне.
  try {
    const { enqueueDelivery } = await import("./queue");
    await enqueueDelivery(certificate.id, certificate.scheduledAt);
  } catch (error) {
    void reportFailure("доставка: очередь недоступна", error, {
      сертификат: certificate.id,
      заказ: orderId,
    });
    void import("./delivery")
      .then(({ deliverCertificate }) => deliverCertificate(certificate.id))
      .catch((deliveryError) =>
        reportFailure("доставка: не ушло письмо", deliveryError, {
          сертификат: certificate.id,
          заказ: orderId,
        }),
      );
  }

  // Уведомление админу о продаже (Telegram) — тоже best-effort.
  void import("./notify")
    .then(({ notifySale }) =>
      notifySale(certificate.id, {
        manual: externalPaymentId.startsWith("manual:"),
      }),
    )
    .catch((error) =>
      reportFailure("уведомление о продаже не отправлено", error, {
        сертификат: certificate.id,
      }),
    );

  return outcome.repaired
    ? { status: "repaired", certificateId: certificate.id }
    : { status: "fulfilled", certificateId: certificate.id };
}
