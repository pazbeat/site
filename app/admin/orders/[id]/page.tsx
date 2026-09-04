import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { CertActions } from "@/components/admin/cert-actions";
import { CertEdit } from "@/components/admin/cert-edit";
import { ManualFulfill } from "@/components/admin/manual-fulfill";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";
import { describePaymentEvent } from "@/lib/payment-events";

const CERT_STATUS: Record<string, string> = {
  active: "Активен",
  partially_used: "Частично использован",
  used: "Использован",
  expired: "Истёк",
  refunded: "Возвращён",
  blocked: "Заблокирован",
};

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between gap-4 border-b border-brand-purple-100/60 py-2 last:border-0">
      <dt className="text-brand-purple-950/55">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export default async function AdminOrderPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const admin = await requireAdmin();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      salon: true,
      certificates: {
        include: {
          design: true,
          redemptions: { orderBy: { createdAt: "desc" } },
          programOption: { include: { program: true } },
        },
      },
      // Журнал платежа: что провайдер отвечал и когда. Спор «я оплатил»
      // решается этой таблицей, а не памятью менеджера.
      paymentEvents: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!order) notFound();

  const salons = await prisma.salon.findMany({
    where: { active: true },
    orderBy: { sort: "asc" },
  });
  const salonOptions = salons.map((s) => ({
    id: s.id,
    label: `${s.city}, ${s.address}`,
  }));

  const consent = order.consent as {
    versions?: Record<string, number>;
    hashes?: Record<string, string>;
    ip?: string;
    ua?: string;
    locale?: string;
    ts?: string;
    steps?: { builder?: string; payment?: string };
  };
  // Тексты редакций, на которые сослалось согласие: без них запись «offer:13»
  // ничего не доказывает — нужно уметь показать, ЧТО именно человек принял.
  const consentVersionIds = Object.values(consent.versions ?? {}).filter(
    (v): v is number => typeof v === "number",
  );
  const consentVersions = consentVersionIds.length
    ? await prisma.legalVersion.findMany({
        where: { id: { in: consentVersionIds } },
        select: {
          id: true,
          lang: true,
          createdAt: true,
          contentSha256: true,
          document: { select: { type: true } },
        },
      })
    : [];
  const item = order.item as {
    toName?: string;
    fromName?: string;
    message?: string;
    delivery?: { method?: string; contact?: string };
  };
  const cert = order.certificates[0];

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Заказ">
      <Link
        href="/admin/orders"
        className="mb-4 inline-block text-sm text-brand-purple hover:underline"
      >
        ← К списку
      </Link>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 font-display text-lg text-brand-purple">Заказ</h2>
          <dl className="text-sm">
            <Row label="ID" value={order.id} />
            <Row label="Статус" value={order.status} />
            <Row label="Сумма" value={formatKzt(order.amountKzt)} />
            <Row label="Филиал" value={`${order.salon.city}, ${order.salon.address}`} />
            <Row label="Email покупателя" value={order.buyerEmail} />
            <Row label="Телефон" value={order.buyerPhone ?? "—"} />
            <Row
              label="Провайдер"
              value={order.paymentProvider ?? "—"}
            />
            <Row label="ID оплаты" value={order.paymentId ?? "—"} />
            <Row
              label="Создан"
              value={order.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            />
            <Row label="Кому" value={item.toName ?? "—"} />
            <Row label="От кого" value={item.fromName ?? "—"} />
            <Row label="Поздравление" value={item.message || "—"} />
            <Row
              label="Доставка"
              value={
                item.delivery
                  ? `${item.delivery.method}: ${item.delivery.contact}`
                  : "—"
              }
            />
          </dl>
        </section>

        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-1 font-display text-lg text-brand-purple">
            Согласие покупателя
          </h2>
          {/* Пояснение для того, кто будет собирать доказательства к спору:
              отдельного поля «галочка проставлена» нет и не нужно — сервер не
              создаёт заказ без подтверждённого согласия, поэтому существование
              этой записи и есть доказательство. */}
          <p className="mb-3 text-xs text-brand-purple-950/60">
            Заказ не создаётся без проставленной галочки — записи ниже сняты
            сервером в момент оформления и с браузера не подделываются.
          </p>
          <dl className="text-sm">
            <Row label="Время" value={consent.ts ?? "—"} />
            <Row label="IP" value={consent.ip ?? "—"} />
            <Row label="Язык документов" value={consent.locale ?? "—"} />
            <Row label="Браузер (User-Agent)" value={consent.ua ?? "—"} />
          </dl>

          <h3 className="mt-4 mb-2 text-xs font-bold tracking-wider text-brand-purple-600 uppercase">
            Где ставилась галочка
          </h3>
          <dl className="text-sm">
            <Row
              label="Окно перед конструктором"
              value={consent.steps?.builder ?? "—"}
            />
            <Row
              label="Галочка на шаге оплаты"
              value={consent.steps?.payment ?? "—"}
            />
          </dl>
          <p className="mt-1.5 text-xs text-brand-purple-950/55">
            Эти два времени — по часам браузера покупателя, их можно
            подкрутить. Доказательное время выше: его снял сервер. Здесь важно
            другое — подтверждений было два, и второе он дал перед оплатой.
          </p>

          <h3 className="mt-4 mb-2 text-xs font-bold tracking-wider text-brand-purple-600 uppercase">
            Принятые редакции
          </h3>
          {consentVersions.length === 0 ? (
            <p className="text-sm text-brand-purple-600">—</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {consentVersions.map((v) => {
                const hash = consent.hashes?.[v.document.type];
                return (
                  <li key={v.id} className="border-b border-brand-purple-100 pb-2 last:border-0">
                    <Link
                      href={`/admin/legal/version/${v.id}`}
                      className="font-semibold text-brand-purple underline"
                    >
                      {v.document.type} · редакция №{v.id}
                    </Link>{" "}
                    <span className="text-brand-purple-600">
                      ({v.lang}, от {v.createdAt.toISOString().slice(0, 10)})
                    </span>
                    {hash ? (
                      <div className="mt-0.5 font-mono text-[11px] break-all text-brand-purple-600">
                        sha256: {hash}
                        {v.contentSha256 && v.contentSha256 !== hash ? (
                          <span className="ml-1 font-sans font-bold text-brand-red">
                            ← не сходится с текущим текстом редакции!
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {cert ? (
        <section className="mt-5 rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 font-display text-lg text-brand-purple">
            Сертификат {cert.serial ? `${cert.serial} · ` : ""}
            {cert.codeDisplay}
          </h2>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <dl className="text-sm">
              <Row label="Серийный №" value={cert.serial ?? "—"} />
              <Row label="Статус" value={CERT_STATUS[cert.status]} />
              <Row label="Баланс" value={formatKzt(cert.balanceKzt)} />
              <Row label="Номинал" value={formatKzt(cert.amountKzt ?? 0)} />
              <Row
                label="Действует до"
                value={cert.validUntil.toISOString().slice(0, 10)}
              />
            </dl>
            <dl className="text-sm">
              <Row label="Кому" value={cert.toName} />
              <Row label="От кого" value={cert.fromName} />
              <Row label="Поздравление" value={cert.message ?? "—"} />
              <Row
                label="Тип"
                value={
                  cert.type === "program"
                    ? "Программа"
                    : "Номинал"
                }
              />
              <Row
                label="Доставка"
                value={`${cert.deliveryMethod}: ${cert.deliveryContact}`}
              />
              <Row
                label="Отправлен"
                value={
                  cert.sentAt
                    ? cert.sentAt.toISOString().slice(0, 16).replace("T", " ")
                    : cert.scheduledAt
                      ? `запланирован на ${cert.scheduledAt.toISOString().slice(0, 16).replace("T", " ")}`
                      : "—"
                }
              />
              <Row
                label="Синк Altegio"
                value={
                  cert.altegioSyncStatus === "synced"
                    ? `✓ синхронизирован${cert.altegioCertId ? ` (док ${cert.altegioCertId})` : ""}`
                    : cert.altegioSyncStatus === "failed"
                      ? "✕ ошибка синка"
                      : cert.altegioSyncStatus === "missing"
                        ? "⚠ пропал из Altegio — проверьте CRM"
                        : "⏳ ожидает"
                }
              />
              {cert.altegioCheckedAt && (
                <Row
                  label="Сверка с CRM"
                  value={`остаток по Altegio ${formatKzt(cert.altegioBalanceKzt ?? 0)} · ${cert.altegioCheckedAt.toISOString().slice(0, 16).replace("T", " ")}`}
                />
              )}
            </dl>
          </div>

          <div className="mb-4">
            <CertEdit
              certificateId={cert.id}
              toName={cert.toName}
              fromName={cert.fromName}
              message={cert.message}
              deliveryMethod={cert.deliveryMethod}
              deliveryContact={cert.deliveryContact}
            />
          </div>

          <CertActions
            certificateId={cert.id}
            balanceKzt={cert.balanceKzt}
            status={cert.status}
            isBlocked={cert.status === "blocked"}
            salons={salonOptions}
          />

          {cert.redemptions.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-bold">История погашений</h3>
              <ul className="text-sm">
                {cert.redemptions.map((r) => (
                  <li
                    key={r.id}
                    className="flex justify-between border-b border-brand-purple-100/60 py-1.5 last:border-0"
                  >
                    <span>
                      {r.createdAt.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                      {r.actor} · {r.source}
                    </span>
                    <span className="font-medium">−{formatKzt(r.amountKzt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <section className="mt-5 rounded-2xl border border-brand-purple-100 bg-white p-5">
          {/* Оплаченный заказ без сертификата — это не «ждём оплату», а сбой:
              деньги приняты, покупатель ничего не получил. Такой случай надо
              и назвать иначе, и дать кнопку починки. */}
          {order.status === "paid" ? (
            <p className="mb-4 rounded-xl border-l-[3px] border-brand-red bg-brand-red/5 px-4 py-3 text-sm text-brand-purple-950/80">
              <strong>Заказ оплачен, но сертификата нет.</strong> Покупатель
              заплатил и ничего не получил. Выпустите сертификат — деньги
              повторно не списываются, оплата уже зафиксирована.
            </p>
          ) : (
            <p className="mb-4 text-sm text-brand-purple-950/60">
              Сертификат ещё не выпущен (заказ не оплачен). Если покупатель
              подтвердил оплату чеком или выпиской, а автоматика её не увидела —
              выпустите сертификат вручную.
            </p>
          )}
          {(order.status === "pending" ||
            order.status === "expired" ||
            order.status === "paid") && (
            <ManualFulfill orderId={order.id} repair={order.status === "paid"} />
          )}
        </section>
      )}

      {order.paymentEvents.length > 0 && (
        <section className="mt-5 rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-1 text-sm font-bold text-brand-purple">
            Журнал платежа
          </h2>
          <p className="mb-3 text-xs text-brand-purple-950/55">
            Что отвечал провайдер и кто подтвердил оплату. Время — Asia/Almaty.
          </p>
          <ul className="text-sm">
            {order.paymentEvents.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-brand-purple-100/60 py-2 last:border-0"
              >
                <span className="font-medium">
                  {describePaymentEvent(event)}
                </span>
                <span className="text-xs whitespace-nowrap text-brand-purple-950/55">
                  {new Date(event.createdAt.getTime() + 5 * 3_600_000)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </span>
                {(event.externalRef || event.statusRaw || event.note) && (
                  <p className="w-full text-xs text-brand-purple-950/60">
                    {[
                      event.externalRef && `операция ${event.externalRef}`,
                      event.statusRaw && `статус «${event.statusRaw}»`,
                      event.note,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminChrome>
  );
}
