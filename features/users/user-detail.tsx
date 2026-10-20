import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ActionForm } from "@/components/app/action-form";
import { DetailItem, SelectField, TextField } from "@/components/app/fields";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { setTemporaryPassword, setUserActive, updateUser } from "@/features/users/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { USER_KIND, type UserKind } from "./user-list";

export const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export const kindForRole = (role: string): UserKind => (role === "student" ? "students" : "personnel");

// One account, for administrators. Uses the existing user server actions
// (admin-checked, RLS and the profile guard apply). Login account data only.
export async function UserDetail({ id, kind, meId, backQuery = "" }: { id: string; kind: UserKind; meId: string; backQuery?: string }) {
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [{ data: u }, { data: numbers }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, is_active, created_at, requested_student_number").eq("id", id).maybeSingle(),
    supabase.rpc("account_student_numbers"),
  ]);
  if (!u) notFound();
  // Keep each account under its own list (and sidebar item).
  if (kindForRole(u.role) !== kind) redirect(`${USER_KIND[kindForRole(u.role)].path}/${id}`);

  const self = u.id === meId;
  const studentNumber = numbers?.find((n) => n.profile_id === id)?.student_number;
  const list = USER_KIND[kind];

  return (
    <div className="grid gap-5">
      <Link href={`${list.path}${backQuery}`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {list.title}
      </Link>

      <PageHeader
        title={u.full_name}
        description={u.email}
        actions={u.is_active ? <Badge className="bg-success/12 text-success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
      />

      <dl className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <DetailItem label="Role">{ROLE_LABELS[u.role]}</DetailItem>
        {u.role === "student" ? (
          <DetailItem label="Student number">
            {studentNumber ?? (u.requested_student_number ? `Pending approval (entered ${u.requested_student_number})` : "Pending approval")}
          </DetailItem>
        ) : null}
        <DetailItem label="Created">{formatDateTime(u.created_at)}</DetailItem>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="grid content-start gap-3 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium">Account details</h2>
          <ActionForm action={updateUser.bind(null, id)} submitLabel="Save" confirm={self || u.role === "student" ? undefined : {
            title: "Change Role?", message: "This account's access permissions will change when you save.", confirmLabel: "Change Role", cancelLabel: "Keep Role",
            whenChanged: { field: "role", from: u.role, to: ["clinic_staff", "admin"], label: "role", labels: ROLE_LABELS },
          }}>
            <TextField name="full_name" label="Full name" required maxLength={120} defaultValue={u.full_name} />
            {u.role === "student" ? (
              <p className="text-xs text-muted-foreground">Student accounts keep the Student role.</p>
            ) : self ? (
              <p className="text-xs text-muted-foreground">You cannot change the role of your own account.</p>
            ) : (
              <SelectField
                name="role"
                label="Role"
                defaultValue={u.role}
                options={[
                  { value: "clinic_staff", label: "Clinic Personnel" },
                  { value: "admin", label: "Administrator" },
                ]}
              />
            )}
          </ActionForm>
        </section>

        {self ? null : (
          <section className="grid content-start gap-3 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">Temporary password</h2>
            <ActionForm action={setTemporaryPassword.bind(null, id)} submitLabel="Set password" variant="outline" confirm={{ title: "Set Temporary Password?", message: "The current password will stop working. Share the new temporary password with this user securely.", confirmLabel: "Set Password", cancelLabel: "Keep Password" }}>
              <TextField name="password" label="New temporary password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters." />
            </ActionForm>
          </section>
        )}
      </div>

      {self ? (
        <p className="text-xs text-muted-foreground">You cannot deactivate your own account.</p>
      ) : (
        <section className="grid gap-2 border-t pt-4">
          <h2 className="text-sm font-medium">Access</h2>
          <p className="text-sm text-muted-foreground">
            {u.is_active
              ? "Deactivating removes all access at once and blocks sign-in. Records the user created are kept."
              : "This account cannot sign in or see any data."}
          </p>
          <ActionForm
            action={setUserActive.bind(null, id, !u.is_active)}
            submitLabel={u.is_active ? "Deactivate account" : "Reactivate account"}
            variant={u.is_active ? "destructive" : "outline"}
            confirm={
              u.is_active
                ? { title: "Deactivate Account?", message: `${u.full_name} will no longer be able to access WUPCare until their account is reactivated. Records they created are kept.`, confirmLabel: "Deactivate Account", cancelLabel: "Keep Account", destructive: true }
                : { title: "Reactivate Account?", message: `${u.full_name} will be able to sign in and use their existing role again.`, confirmLabel: "Reactivate Account", cancelLabel: "Keep Inactive" }
            }
          />
        </section>
      )}
    </div>
  );
}
