import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ToggleActiveButton } from "@/components/admin/toggle-active";
import { DesignEditor } from "@/components/admin/design-editor";
import { toggleDesignActiveAction } from "./actions";
import { prisma } from "@/lib/db";
import { pickL10n } from "@/lib/l10n";
import type { DesignBgStyle } from "@/lib/types";

function preview(bg: DesignBgStyle): string {
  return bg.kind === "gradient"
    ? `linear-gradient(${bg.angle ?? 135}deg, ${bg.from}, ${bg.to})`
    : (bg.color ?? "#4D295D");
}

export default async function AdminDesignsPage() {
  const admin = await requireSuperadmin();
  const designs = await prisma.design.findMany({ orderBy: { sort: "asc" } });

  return (
    <AdminChrome email={admin.email} role={admin.role} title="Дизайны открыток">
      <DesignEditor />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {designs.map((d) => (
          <div
            key={d.id}
            className="rounded-2xl border border-brand-purple-100 bg-white p-4"
          >
            <div
              className="mb-3 flex h-24 items-center justify-center rounded-xl border border-brand-gold text-sm font-bold"
              style={{
                background: preview(d.bgStyle as DesignBgStyle),
                color: d.textColor,
              }}
            >
              {pickL10n(d.names, "ru")}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-brand-purple-950/55">
                {d.active ? "Активен" : "Скрыт"}
              </span>
              <ToggleActiveButton
                id={d.id}
                active={d.active}
                action={toggleDesignActiveAction}
              />
            </div>
          </div>
        ))}
      </div>
    </AdminChrome>
  );
}
