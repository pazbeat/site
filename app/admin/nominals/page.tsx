import Link from "next/link";
import { requireCatalogEditor } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ToggleActiveButton } from "@/components/admin/toggle-active";
import { DeleteRowButton } from "@/components/admin/delete-row";
import { InlineCreateForm } from "@/components/admin/inline-create";
import { StatusSelect } from "@/components/admin/status-select";
import {
  deleteNominalAction,
  saveNominalAction,
  setNominalVariantAction,
  toggleNominalActiveAction,
} from "./actions";
import { prisma } from "@/lib/db";
import { formatKzt } from "@/lib/format";
import { isAbVariant } from "@/lib/ab";
import { availableNominalAmounts } from "@/lib/altegio/catalog";

export default async function AdminNominalsPage() {
  const admin = await requireCatalogEditor();
  const [nominals, salons] = await Promise.all([
    prisma.nominal.findMany({ orderBy: { sort: "asc" } }),
    prisma.salon.findMany({
      where: { orderable: true, active: true },
      select: { id: true, altegioLocationId: true },
    }),
  ]);
  const experimentOn = nominals.some((n) => isAbVariant(n.variant));
  // В Altegio под каждую сумму нужен свой товар-сертификат: сумма без товара
  // не выпустится, и на круге конструктора её быть не должно. Считаем, в
  // скольких продаваемых филиалах сумма реально заведена.
  const amounts = nominals.map((n) => n.amountKzt);
  const issuableIn = new Map<number, number>(
    amounts.map((a) => [
      a,
      salons.filter(
        (s) =>
          s.altegioLocationId !== null &&
          availableNominalAmounts(s.altegioLocationId, [a]).length > 0,
      ).length,
    ]),
  );
  const salonCount = salons.length;

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Номиналы">
      <p className="mb-4 max-w-3xl text-sm text-brand-purple-950/60">
        Суммы на круге конструктора: что здесь включено, то покупатель и
        видит. Колонка «В Altegio» показывает, в скольких филиалах сумма
        реально выпустится — сумму без товара покупать нельзя, её лучше
        скрыть. Колонка «A/B» запускает тест цен: поставьте
        одним номиналам группу A, другим B — половина посетителей увидит первый
        набор, половина второй. Номинал без группы видят все.{" "}
        {experimentOn ? (
          <>
            Тест идёт —{" "}
            <Link
              href="/admin/experiments"
              className="font-semibold text-brand-gold hover:underline"
            >
              смотреть результаты →
            </Link>
          </>
        ) : (
          "Сейчас тест не идёт: групп ни у кого нет."
        )}
      </p>
      <InlineCreateForm
        action={saveNominalAction}
        fields={[
          { name: "amountKzt", type: "number", placeholder: "Сумма, ₸", required: true },
          { name: "label", type: "text", placeholder: "Метка (напр. Хит)" },
        ]}
        submitLabel="Добавить номинал"
      />

      <div className="mt-5 overflow-x-auto rounded-2xl border border-brand-purple-100 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-brand-purple-100 text-left text-xs text-brand-purple-950/55 uppercase">
              <th className="px-4 py-3 font-semibold">Сумма</th>
              <th className="px-4 py-3 font-semibold">Метка</th>
              <th className="px-4 py-3 font-semibold">A/B</th>
              <th className="px-4 py-3 font-semibold">В Altegio</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {nominals.map((n) => (
              <tr
                key={n.id}
                className="border-b border-brand-purple-100/60 last:border-0"
              >
                <td className="px-4 py-3 font-medium">{formatKzt(n.amountKzt)}</td>
                <td className="px-4 py-3">{n.label ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusSelect
                    id={String(n.id)}
                    name="variant"
                    value={isAbVariant(n.variant) ? n.variant : ""}
                    done="Группа изменена."
                    action={setNominalVariantAction}
                    options={[
                      { value: "", label: "Видят все" },
                      { value: "A", label: "Только A" },
                      { value: "B", label: "Только B" },
                    ]}
                  />
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const ok = issuableIn.get(n.amountKzt) ?? 0;
                    if (ok === 0) {
                      return (
                        <span className="font-semibold text-brand-red">
                          нет товара — не выпустится
                        </span>
                      );
                    }
                    return (
                      <span
                        className={
                          ok === salonCount ? "" : "text-brand-gold"
                        }
                      >
                        {ok === salonCount
                          ? `во всех ${salonCount} филиалах`
                          : `в ${ok} из ${salonCount} филиалов`}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  {n.active ? "Активен" : "Скрыт"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <ToggleActiveButton
                      id={n.id}
                      active={n.active}
                      action={toggleNominalActiveAction}
                    />
                    <DeleteRowButton
                      id={n.id}
                      name={formatKzt(n.amountKzt)}
                      what="номинал"
                      body="Сумма пропадёт с круга конструктора — купить её будет нельзя. Уже выпущенные сертификаты не изменятся: сумма записана в них самих. Если сумму нужно убрать временно, лучше «Скрыть»."
                      action={deleteNominalAction}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminChrome>
  );
}
