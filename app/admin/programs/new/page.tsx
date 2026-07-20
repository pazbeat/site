import { requireSuperadmin } from "@/lib/admin/guard";
import { AdminChrome } from "@/components/admin/chrome";
import { ProgramEditor } from "@/components/admin/program-editor";

export default async function NewProgramPage() {
  const admin = await requireSuperadmin();
  return (
    <AdminChrome email={admin.email} role={admin.role} title="Новая программа">
      <ProgramEditor
        initial={{
          category: "massage",
          nameRu: "",
          nameKk: "",
          nameEn: "",
          descRu: "",
          descKk: "",
          descEn: "",
          highlight: null,
          active: true,
          photoUrl: null,
          cities: "",
          options: [{ durationMin: "", persons: "", priceKzt: "" }],
        }}
      />
    </AdminChrome>
  );
}
