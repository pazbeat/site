import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ProgramEditor } from "@/components/admin/program-editor";
import { prisma } from "@/lib/db";
import { pickL10n } from "@/lib/l10n";

export default async function EditProgramPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const admin = await requireSuperadmin();
  const { id } = await params;
  const program = await prisma.program.findUnique({
    where: { id: Number(id) },
    include: { options: { orderBy: { priceKzt: "asc" } } },
  });
  if (!program) notFound();

  return (
    <AdminChrome
      email={admin.email}
      role={admin.role}
      title={`Программа: ${pickL10n(program.names, "ru")}`}
    >
      <ProgramEditor
        initial={{
          id: program.id,
          category: program.category,
          nameRu: pickL10n(program.names, "ru"),
          nameKk: pickL10n(program.names, "kk"),
          nameEn: pickL10n(program.names, "en"),
          descRu: pickL10n(program.descriptions, "ru"),
          descKk: pickL10n(program.descriptions, "kk"),
          descEn: pickL10n(program.descriptions, "en"),
          popular: program.popular,
          active: program.active,
          photoUrl: program.photoUrl,
          cities: program.cities.join(", "),
          options: program.options.map((o) => ({
            id: o.id,
            durationMin: o.durationMin?.toString() ?? "",
            persons: o.persons?.toString() ?? "",
            priceKzt: o.priceKzt.toString(),
          })),
        }}
      />
    </AdminChrome>
  );
}
