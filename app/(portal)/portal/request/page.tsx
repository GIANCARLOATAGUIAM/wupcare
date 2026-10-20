import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { requireCompleteProfile } from "@/features/account/academic";
import { requestAppointment } from "@/features/appointments/actions";
import { RequestForm } from "@/features/appointments/components/request-form";
import { getClinicSettings, requestLimits } from "@/features/appointments/queries";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Request appointment" };

export default async function RequestPage() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const [{ data: profile }, settings, { count: pending }] = await Promise.all([
    supabase.from("profiles").select("student_id").eq("id", user.id).maybeSingle(),
    getClinicSettings(),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (!profile?.student_id || pending) redirect("/portal");
  // College, Program and Year Level are required before requesting.
  await requireCompleteProfile(supabase, "/portal/request");

  return (
    <div className="grid gap-6">
      <PageHeader title="Request Appointment" description="The clinic will review your request and confirm a schedule." />
      {settings ? (
        <RequestForm action={requestAppointment} cancelHref="/portal" {...requestLimits(settings)} />
      ) : (
        <p className="text-sm text-destructive">Clinic hours are not set up yet. Please try again later.</p>
      )}
    </div>
  );
}
