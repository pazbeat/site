import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ScheduledActions } from "@/components/admin/scheduled-actions";
import { sendNowAction, rescheduleAction } from "./actions";
import { prisma } from "@/lib/db";

/** Момент (UTC) → строка datetime-local в Asia/Almaty (UTC+5, без DST). */
function toAlmatyLocal(d: Date): string {
  return new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 16);
}

export default async function AdminScheduledPage() {
  const admin = await requireAdmin();

  const certs = await prisma.certificate.findMany({
    where: { sentAt: null, scheduledAt: { not: null } },
    orderBy: { scheduledAt: "asc" },
    include: { order: { select: { id: true, buyerEmail: true } } },
  });

  const now = new Date();

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Отложенные отправки">
      <p className="mb-5 text-sm text-brand-purple-950/60">
        Сертификаты с назначенной датой отправки, ещё не доставленные. Развозка
        идёт автоматически при наступлении даты; можно отправить сейчас или
        перенести. Время — Asia/Almaty.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Отправка</th>
              <th className="px-4 py-3 font-semibold">Сертификат</th>
              <th className="px-4 py-3 font-semibold">Получатель</th>
              <th className="px-4 py-3 font-semibold">Покупатель</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {certs.map((cert) => {
              const overdue = cert.scheduledAt! <= now;
              return (
                <tr
                  key={cert.id}
                  className="border-b border-brand-purple-100/60 align-top last:border-0"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={overdue ? "font-bold text-brand-red" : ""}>
                      {toAlmatyLocal(cert.scheduledAt!).replace("T", " ")}
                    </span>
                    {overdue && (
                      <div className="text-xs text-brand-red">
                        просрочено — развозится
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/admin/orders/${cert.order.id}`}
                      className="font-medium text-brand-purple hover:underline"
                    >
                      {cert.serial ? `${cert.serial} · ` : ""}
                      {cert.codeDisplay}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {cert.deliveryMethod}: {cert.deliveryContact}
                  </td>
                  <td className="px-4 py-3">{cert.order.buyerEmail}</td>
                  <td className="px-4 py-3">
                    <ScheduledActions
                      certificateId={cert.id}
                      scheduledLocal={toAlmatyLocal(cert.scheduledAt!)}
                      sendNow={sendNowAction}
                      reschedule={rescheduleAction}
                    />
                  </td>
                </tr>
              );
            })}
            {certs.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-brand-purple-950/50"
                >
                  Нет отложенных отправок.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminChrome>
  );
}
