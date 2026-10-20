import type { Metadata } from "next";

import { DetailItem } from "@/components/app/fields";
import { PageHeader } from "@/components/app/page-header";
import { PasswordForm } from "@/features/account/password-form";
import { DisplayNameForm } from "@/features/account/display-name-form";
import { myAcademicProfile } from "@/features/account/academic";
import { AcademicProfileForm } from "@/features/account/academic-form";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

export default async function PortalAccountPage() {
  const user = await requireRole("student");
  // Own profile row only (RLS profiles_select). Students cannot read the
  // student record itself, so the verified student number is not shown; the
  // number typed at self-registration is shown when there is one.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("requested_student_number, student_id")
    .eq("id", user.id)
    .maybeSingle();
  const academic = profile?.student_id ? await myAcademicProfile(supabase) : null;

  return (
    <div className="grid gap-6">
      <PageHeader title="My Account" description="Your student profile and sign-in settings." />

      <section aria-labelledby="profile-heading" className="grid gap-4 border-b pb-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
        <div className="grid content-start gap-1">
          <h2 id="profile-heading" className="text-sm font-medium">
            Profile
          </h2>
          <p className="text-sm text-muted-foreground">Your name as shown in the sidebar.</p>
        </div>
        <div className="grid gap-5">
          <DisplayNameForm current={user.fullName} />
          <dl className="grid max-w-2xl gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <DetailItem label="Email">{user.email}</DetailItem>
            {profile?.requested_student_number ? (
              <DetailItem label="Student ID (as registered)">{profile.requested_student_number}</DetailItem>
            ) : null}
            <DetailItem label="Record status">{profile?.student_id ? "Linked to your clinic record" : "Waiting for clinic verification"}</DetailItem>
          </dl>
          <p className="max-w-md text-xs text-muted-foreground">
            Your email address is your sign-in name. Ask the clinic to correct your clinic record name or student details.
          </p>
        </div>
      </section>

      {academic ? (
        <section aria-labelledby="academic-heading" className="grid gap-4 border-b pb-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
          <div className="grid content-start gap-1">
            <h2 id="academic-heading" className="text-sm font-medium">
              Academic details
            </h2>
            <p className="text-sm text-muted-foreground">Required for appointment requests.</p>
          </div>
          <AcademicProfileForm current={academic} flow="settings" />
        </section>
      ) : null}

      <section aria-labelledby="password-heading" className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
        <div className="grid content-start gap-1">
          <h2 id="password-heading" className="text-sm font-medium">
            Password
          </h2>
          <p className="text-sm text-muted-foreground">Enter your current password to set a new one.</p>
        </div>
        <PasswordForm />
      </section>
    </div>
  );
}
