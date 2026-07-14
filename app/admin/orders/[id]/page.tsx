import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { CertActions } from "@/components/admin/cert-actions";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";

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
    ip?: string;
    ts?: string;
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
            <Row
              label="Создан"
              value={order.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            />
          </dl>
        </section>

        <section className="rounded-2xl border border-brand-purple-100 bg-white p-5">
          <h2 className="mb-3 font-display text-lg text-brand-purple">
            Согласие (PRD §5.2)
          </h2>
          <dl className="text-sm">
            <Row label="IP" value={consent.ip ?? "—"} />
            <Row label="Время" value={consent.ts ?? "—"} />
            <Row
              label="Версии документов"
              value={
                consent.versions
                  ? Object.entries(consent.versions)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(", ")
                  : "—"
              }
            />
          </dl>
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
                      : "⏳ ожидает"
                }
              />
            </dl>
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
        <p className="mt-5 rounded-2xl border border-brand-purple-100 bg-white p-5 text-sm text-brand-purple-950/60">
          Сертификат ещё не выпущен (заказ не оплачен).
        </p>
      )}
    </AdminChrome>
  );
}
