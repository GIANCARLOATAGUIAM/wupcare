import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { param } from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { myAcademicProfile, safePortalNext } from "@/features/account/academic";
import { AcademicProfileForm } from "@/features/account/academic-form";
import { linkedStudentId } from "@/features/appointments/student-portal";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Complete your profile" };

// Shown after sign-in to linked students whose record has no Department/
// College or Year Level. They cannot request appointments until it is done.
export default async function CompleteProfilePage({ searchParams }: PageProps<"/portal/complete-profile">) {
  const user = await requireRole("student");
  const next = safePortalNext(param(await searchParams, "next"));
  const supabase = await createClient();
  if (!(await linkedStudentId(supabase, user.id))) redirect("/portal");
  const profile = await myAcademicProfile(supabase);
  if (!profile || profile.complete) redirect(next);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Complete Your Profile"
        description="Choose your College, Program and Year Level to continue. You need these before you can request an appointment."
      />
      <AcademicProfileForm current={profile} flow="complete" next={next} />
      <p className="max-w-xl text-xs text-muted-foreground">
        You can change these later in My Account. Your Student ID and clinic records are not changed here.
      </p>
    </div>
  );
}
