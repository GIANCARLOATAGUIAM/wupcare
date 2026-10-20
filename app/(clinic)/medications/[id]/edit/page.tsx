import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { updateMedicine } from "@/features/medications/actions";
import { MedicineForm } from "@/features/medications/components/medicine-form";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit medicine" };

export default async function EditMedicinePage({ params }: PageProps<"/medications/[id]/edit">) {
  await requireRole("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: medicine } = await supabase.from("medicines").select("*").eq("id", id).maybeSingle();
  if (!medicine) notFound();

  return (
    <div className="grid gap-5">
      <PageHeader title="Edit medicine" description="Stock changes only through restock, adjustment, or issuance." />
      <MedicineForm action={updateMedicine.bind(null, id)} medicine={medicine} cancelHref={`/medications/${id}`} />
    </div>
  );
}
