import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { createMedicine } from "@/features/medications/actions";
import { MedicineForm } from "@/features/medications/components/medicine-form";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Add medicine" };

export default async function NewMedicinePage() {
  await requireRole("admin");
  return (
    <div className="grid gap-5">
      <PageHeader title="Add medicine" />
      <MedicineForm action={createMedicine} cancelHref="/medications" />
    </div>
  );
}
