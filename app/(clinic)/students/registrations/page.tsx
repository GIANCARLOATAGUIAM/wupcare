import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck, UserCheck } from "lucide-react";

import { ActionForm } from "@/components/app/action-form";
import { EmptyState } from "@/components/app/empty-state";
import { TextField } from "@/components/app/fields";
import { PageHeader } from "@/components/app/page-header";
import { approveRegistration } from "@/features/registration/actions";
import { requireRole } from "@/lib/auth/dal";
import { studentRegistrationEnabled } from "@/lib/features";
import { formatDateTime, studentName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Student registrations" };

// SYSTEM_SPEC §8.10, step 4: clinic personnel verify the student and approve
// the link to an existing student record. The number the user typed is a
// hint only; approval links to the record whose number staff confirm.
export default async function RegistrationsPage() {
  await requireRole("clinic_staff");
  if (!studentRegistrationEnabled()) notFound();

  const supabase = await createClient();
  const { data: pending, error } = await supabase
    .from("profiles")
    .select("id, email, created_at, requested_student_number")
    .eq("role", "student")
    .eq("is_active", true)
    .is("student_id", null)
    .order("created_at");

  const numbers = [
    ...new Set((pending ?? []).map((p) => p.requested_student_number).filter((n): n is string => Boolean(n))),
  ];
  const { data: matches } = numbers.length
    ? await supabase
        .from("students")
        .select("student_number, first_name, middle_name, last_name, status")
        .in("student_number", numbers)
    : { data: [] };
  const match = new Map((matches ?? []).map((s) => [s.student_number, s]));

  return (
    <div className="grid gap-5">
      <PageHeader title="Student registrations" description="Self-registered student accounts waiting for approval." />

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Approve only after checking the student&apos;s identity, for example with their school ID at the clinic.
        Approving lets the account request appointments for that student record. The administrator can deactivate
        accounts that should not be approved.
      </p>

      {error ? (
        <p className="text-sm text-destructive">Could not load registrations. Please reload the page.</p>
      ) : pending?.length ? (
        <ul className="grid gap-3">
          {pending.map((p) => {
            const m = p.requested_student_number ? match.get(p.requested_student_number) : undefined;
            return (
              <li key={p.id} className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[1fr_20rem] md:items-start">
                <dl className="grid gap-1 text-sm">
                  <Row label="Email">
                    <span className="font-medium">{p.email}</span>
                  </Row>
                  <Row label="Student number entered">
                    <span className="font-mono text-xs leading-5">{p.requested_student_number ?? "—"}</span>
                  </Row>
                  <Row label="Matching record">
                    {m ? `${studentName(m)}${m.status !== "active" ? ` (${m.status})` : ""}` : "None found. Check the number with the student."}
                  </Row>
                  <Row label="Registered">{formatDateTime(p.created_at)}</Row>
                </dl>
                <ActionForm
                  action={approveRegistration.bind(null, p.id)}
                  submitLabel="Approve and link"
                  confirm={{
                    title: "Approve Student Link?",
                    message: "Link this account to the student record? The student will see their own appointments.",
                    confirmLabel: "Yes, approve",
                  }}
                >
                  <TextField id={`link-${p.id}`} name="student_number" label="Student number to link" required defaultValue={p.requested_student_number ?? ""} />
                </ActionForm>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={UserCheck} title="No registrations waiting">
          New student accounts appear here after the student registers.
        </EmptyState>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd>{children}</dd>
    </div>
  );
}
