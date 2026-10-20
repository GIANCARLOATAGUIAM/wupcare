import type { Metadata } from "next";

import { DetailItem } from "@/components/app/fields";
import { PageHeader } from "@/components/app/page-header";
import { DisplayNameForm } from "@/features/account/display-name-form";
import { PasswordForm } from "@/features/account/password-form";
import { requireRole } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireRole("admin", "clinic_staff");
  const isAdmin = user.role === "admin";

  return (
    <div className="grid gap-6">
      <PageHeader
        title="My Account"
        description={isAdmin ? "Your administrator profile and sign-in settings." : "Your clinic personnel profile and sign-in settings."}
      />

      <section aria-labelledby="profile-heading" className="grid gap-4 border-b pb-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
        <div className="grid content-start gap-1">
          <h2 id="profile-heading" className="text-sm font-medium">
            Profile
          </h2>
          <p className="text-sm text-muted-foreground">Your name as shown in the sidebar.</p>
        </div>
        <div className="grid gap-5">
          <DisplayNameForm current={user.fullName} />
          <dl className="grid max-w-sm gap-4 sm:grid-cols-2">
            <DetailItem label="Email">{user.email}</DetailItem>
            <DetailItem label="Role">{ROLE_LABELS[user.role]}</DetailItem>
          </dl>
          <p className="max-w-sm text-xs text-muted-foreground">
            Your email address is your sign-in name and can&apos;t be changed here.
          </p>
        </div>
      </section>

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
