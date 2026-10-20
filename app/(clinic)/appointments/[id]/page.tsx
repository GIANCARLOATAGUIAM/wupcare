import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, FilePlus2 } from "lucide-react";

import { ActionForm } from "@/components/app/action-form";
import { AppointmentStatusBadge, DemoBadge } from "@/components/app/badges";
import { DetailItem, TextAreaField, TextField } from "@/components/app/fields";
import { param } from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateAppointmentStatus } from "@/features/appointments/actions";
import { APPOINTMENT_CATEGORIES, CATEGORY_KEYS, categoryForStatus, doneMessage, isOverdue, safeBackHref } from "@/features/appointments/categories";
import { scheduleChanged } from "@/features/appointments/components/student-appointment-card";
import { requireRole } from "@/lib/auth/dal";
import { formatDate, formatDateTime, formatTime, studentName, toManilaInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Appointment" };

export default async function AppointmentPage({ params, searchParams }: PageProps<"/appointments/[id]">) {
  await requireRole("clinic_staff");
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: a }, { data: visit }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "*, students(id, student_number, first_name, middle_name, last_name, is_demo), requester:profiles!appointments_requested_by_fkey(full_name, role), handler:profiles!appointments_handled_by_fkey(full_name)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("clinic_visits").select("id").eq("appointment_id", id).maybeSingle(),
  ]);
  if (!a || !a.students) notFound();
  const s = a.students;
  const preferredLocal = `${a.preferred_date}T${a.preferred_time.slice(0, 5)}`;
  const act = (intent: Parameters<typeof updateAppointmentStatus>[1]) => updateAppointmentStatus.bind(null, id, intent);

  // Where the record lives now, and the list the nurse came from (filters kept).
  const category = APPOINTMENT_CATEGORIES[categoryForStatus(a.status)];
  const back = safeBackHref(param(sp, "back")) ?? category.href;
  const backPath = back.split("?")[0];
  const backLabel = APPOINTMENT_CATEGORIES[CATEGORY_KEYS.find((k) => APPOINTMENT_CATEGORIES[k].href === backPath) ?? "all"].label;
  // Shown only while it still matches the record (another change may have followed).
  const reported = doneMessage(param(sp, "done"));
  const done = reported && APPOINTMENT_CATEGORIES[reported.category] === category ? reported : undefined;
  const overdue = isOverdue(a);
  // Sent with every action so the page reopens with the same "Back" link.
  const backField = <input type="hidden" name="back" value={back} />;

  return (
    <div className="grid gap-5">
      <Link href={back} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {backLabel}
      </Link>

      {done ? (
        <Alert role="status" className="border-success/30">
          <CircleCheck className="text-success" />
          <AlertDescription>
            <p>
              <span className="font-medium text-success">{done.text}</span>{" "}
              {/* The current status decides the list, so this stays true if the page is reopened later. */}
              It is now in{" "}
              <Link href={category.href} className="font-medium text-foreground underline underline-offset-2">
                {category.label}
              </Link>
              .
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <PageHeader
        title="Appointment"
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Link href={`/students/${s.id}`} className="font-medium text-foreground hover:underline">
              {studentName(s)}
            </Link>
            <span className="font-mono text-xs">{s.student_number}</span>
            {s.is_demo ? <DemoBadge /> : null}
          </span>
        }
        actions={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <AppointmentStatusBadge status={a.status} />
            {overdue ? <Badge className="bg-destructive/10 text-destructive">Overdue</Badge> : null}
          </span>
        }
      />

      <dl className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* The student's preferred time is kept as requested; the clinic's
            confirmed time is stored separately (scheduled_at). */}
        <DetailItem label="Preferred schedule">
          {formatDate(a.preferred_date)}, {formatTime(a.preferred_time)}
        </DetailItem>
        <DetailItem label="Confirmed schedule">
          {a.scheduled_at ? (
            <>
              {formatDateTime(a.scheduled_at)}
              {scheduleChanged(a) ? <span className="block text-xs text-muted-foreground">Different from the preferred schedule</span> : null}
            </>
          ) : a.status === "pending" ? (
            <span className="text-muted-foreground">Not confirmed yet</span>
          ) : null}
        </DetailItem>
        <DetailItem label="Listed in">
          <Link href={category.href} className="underline underline-offset-2 hover:text-primary">
            {category.label}
          </Link>
          {overdue ? <span className="block text-xs text-destructive">Overdue: the confirmed time has passed. Complete, reschedule, or cancel it.</span> : null}
        </DetailItem>
        <DetailItem label="Reschedules">{String(a.reschedule_count)}</DetailItem>
        <DetailItem label="Reason" className="sm:col-span-2 lg:col-span-3">
          {a.reason}
        </DetailItem>
        <DetailItem label="Clinic remarks" className="sm:col-span-2 lg:col-span-3">
          {a.staff_remarks}
        </DetailItem>
        <DetailItem label="Requested by">
          {a.requester ? `${a.requester.full_name}${a.requester.role === "student" ? " (student)" : ""}` : null}, {formatDateTime(a.created_at)}
        </DetailItem>
        <DetailItem label="Handled by">{a.handler?.full_name}</DetailItem>
      </dl>

      {a.status === "pending" ? (
        <div key={a.updated_at} className="grid gap-4 md:grid-cols-2">
          <ActionPanel title="Approve">
            <ActionForm action={act("approve")} submitLabel="Approve">
              {backField}
              <TextField
                id="approve-scheduled_at"
                name="scheduled_at"
                label="Confirmed schedule"
                type="datetime-local"
                required
                defaultValue={preferredLocal}
                hint="Set to the student's preferred time. Change it to confirm a different time."
              />
              <TextAreaField id="approve-staff_remarks" name="staff_remarks" label="Remarks (optional)" rows={2} />
            </ActionForm>
          </ActionPanel>
          <ActionPanel title="Decline">
            <ActionForm action={act("decline")} submitLabel="Decline" variant="outline" confirm={{ title: "Decline Appointment Request?", message: "This request will be marked as declined. The student will see your reason and must submit a new request to book again.", confirmLabel: "Decline Request", cancelLabel: "Keep Request", destructive: true }}>
              {backField}
              <TextAreaField id="decline-staff_remarks" name="staff_remarks" label="Reason for declining" required rows={2} />
            </ActionForm>
          </ActionPanel>
        </div>
      ) : null}

      {a.status === "approved" ? (
        <div key={a.updated_at} className="grid gap-4 md:grid-cols-3">
          <ActionPanel title="Attended">
            <p className="text-sm text-muted-foreground">Mark as completed after the student visits. You can then record the visit.</p>
            <ActionForm action={act("complete")} submitLabel="Mark completed">
              {backField}
            </ActionForm>
          </ActionPanel>
          <ActionPanel title="Reschedule">
            <ActionForm action={act("reschedule")} submitLabel="Reschedule" variant="outline" confirm={{ title: "Reschedule Appointment?", message: "The approved appointment will move to the new schedule you entered. The student will see the updated time and your remark.", confirmLabel: "Reschedule Appointment", cancelLabel: "Keep Schedule" }}>
              {backField}
              <TextField
                id="reschedule-scheduled_at"
                name="scheduled_at"
                label="New schedule"
                type="datetime-local"
                required
                defaultValue={a.scheduled_at ? toManilaInput(a.scheduled_at) : preferredLocal}
              />
              <TextAreaField id="reschedule-staff_remarks" name="staff_remarks" label="Remark for the student" required rows={2} />
            </ActionForm>
          </ActionPanel>
          <ActionPanel title="Cancel">
            <ActionForm
              action={act("cancel")}
              submitLabel="Cancel appointment"
              variant="destructive"
              confirm={{ title: "Cancel Appointment?", message: "The appointment will be marked as cancelled. The student will see it as cancelled, and its history will be kept.", confirmLabel: "Cancel Appointment", cancelLabel: "Keep Appointment", destructive: true }}
            >
              {backField}
              <TextAreaField id="cancel-staff_remarks" name="staff_remarks" label="Reason (optional)" rows={2} />
            </ActionForm>
          </ActionPanel>
        </div>
      ) : null}

      {a.status === "completed" ? (
        visit ? (
          <p className="text-sm">
            Visit recorded.{" "}
            <Link href={`/visits/${visit.id}`} className="text-primary hover:underline">
              View visit
            </Link>
          </p>
        ) : (
          <div>
            <Button asChild>
              <Link href={`/visits/new?student=${s.id}&appointment=${id}`}>
                <FilePlus2 />
                Record visit
              </Link>
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}

function ActionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}
