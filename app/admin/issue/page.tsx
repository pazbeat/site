import { requireAdmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { IssueForm } from "@/components/admin/issue-form";
import { prisma } from "@/lib/db";
import { pickL10n } from "@/lib/l10n";

/**
 * Ручной выпуск сертификата.
 *
 * Для случаев, когда заказа у нас нет вовсе: человек купил на действующем
 * сайте и потерял письмо, оплатил переводом, получил сертификат в подарок от
 * салона. Кнопка «довыпустить» в карточке заказа решает другую задачу — она
 * чинит заказ, который у нас есть.
 */
export default async function AdminIssuePage() {
  const admin = await requireAdmin();

  const [salons, programs, nominals, designs, validity] = await Promise.all([
    prisma.salon.findMany({
      where: { active: true },
      orderBy: [{ city: "asc" }, { sort: "asc" }],
      select: {
        id: true,
        city: true,
        name: true,
        codePrefix: true,
        lastCertSerial: true,
        altegioLocationId: true,
        orderable: true,
      },
    }),
    prisma.program.findMany({
      where: { active: true },
      orderBy: { sort: "asc" },
      select: {
        id: true,
        names: true,
        cities: true,
        options: {
          orderBy: { priceKzt: "asc" },
          select: { id: true, priceKzt: true, durationMin: true, persons: true },
        },
      },
    }),
    prisma.nominal.findMany({
      where: { active: true },
      orderBy: { amountKzt: "asc" },
      select: { id: true, amountKzt: true },
    }),
    prisma.design.findMany({
      where: { active: true },
      orderBy: { sort: "asc" },
      select: { id: true, names: true },
    }),
    prisma.setting.findUnique({ where: { key: "certificate_validity_months" } }),
  ]);

  return (
    <AdminChrome
      email={admin.email}
      role={admin.role}
      title="Выпустить сертификат"
    >
      <IssueForm
        salons={salons.map((s) => ({
          id: s.id,
          label: `${s.city}, ${s.name}`,
          // Показываем, какой номер получит сертификат, если не задавать свой
          nextSerial: s.codePrefix
            ? `${s.codePrefix}${String(s.lastCertSerial + 1).padStart(4, "0")}`
            : null,
          inAltegio: s.altegioLocationId !== null,
          orderable: s.orderable,
        }))}
        programs={programs.map((p) => ({
          id: p.id,
          name: pickL10n(p.names, "ru"),
          cities: p.cities,
          options: p.options.map((o) => ({
            id: o.id,
            priceKzt: o.priceKzt,
            label: [
              o.durationMin ? `${o.durationMin} мин` : null,
              o.persons ? `${o.persons} чел.` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })),
        }))}
        nominals={nominals}
        designs={designs.map((d) => ({ id: d.id, name: pickL10n(d.names, "ru") }))}
        defaultMonths={
          typeof validity?.value === "number" ? validity.value : 3
        }
      />
    </AdminChrome>
  );
}
