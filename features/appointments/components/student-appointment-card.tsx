import { Hourglass } from "lucide-react";

import { ActionForm } from "@/components/app/action-form";
import { AppointmentStatusBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { cancelMyAppointment } from "@/features/appointments/actions";
import type { Database } from "@/types/database";
import { formatDate, formatDateTime, formatTime, toManilaInput } from "@/lib/format";

type Status = Database["public"]["Enums"]["appointment_status"];

export type StudentAppointment = {
  id: string;
  preferred_date: string;
  preferred_time: string;
  scheduled_at: string | null;
  status: Status;
  reason: string;
  staff_remarks: string | null;
  reschedule_count: number;
  created_at: string;
};

export const CANCEL_REQUEST_CONFIRMATION = {
  title: "Cancel Appointment Request?",
  message: "Your pending appointment request will be cancelled. You can submit a new request later.",
  confirmLabel: "Cancel Request",
  cancelLabel: "Keep Request",
  destructive: true,
};

// Whether the clinic's confirmed time differs from the student's preferred
// date and time (compared in Asia/Manila, minute precision).
export function scheduleChanged(a: Pick<StudentAppointment, "preferred_date" | "preferred_time" | "scheduled_at">) {
  if (!a.scheduled_at) return false;
  return toManilaInput(a.scheduled_at) !== `${a.preferred_date}T${a.preferred_time.slice(0, 5)}`;
}

// What a closed request means for the student. Declined and cancelled stay
// separate: the clinic not approving a request is not a cancellation.
export const STATUS_NOTES: Partial<Record<Status, string>> = {
  declined: "The clinic did not approve this request. You can submit a new request.",
  cancelled: "This appointment was cancelled and will no longer proceed.",
};

// One appointment as the student sees it. Title = reason; status at the
// upper right. Pending/cancelled/declined show the preferred schedule;
// approved/completed show the confirmed clinic schedule prominently, plus
// the preferred one when the clinic chose a different time.
export function StudentAppointmentCard({ appointment: a, headingLevel = "h3" }: { appointment: StudentAppointment; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  const preferred = `${formatDate(a.preferred_date)}, ${formatTime(a.preferred_time)}`;
  const confirmed = a.scheduled_at && (a.status === "approved" || a.status === "completed") ? formatDateTime(a.scheduled_at) : null;
  const changed = confirmed !== null && scheduleChanged(a);

  return (
    <article className="grid gap-3 rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <Heading className="min-w-0 text-sm font-medium break-words">{a.reason}</Heading>
        <AppointmentStatusBadge status={a.status} audience="student" />
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-[repeat(2,minmax(0,16rem))] sm:gap-x-8">
        {confirmed ? (
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Clinic schedule</dt>
            <dd className="text-base font-semibold tabular text-primary">{confirmed}</dd>
            {a.status === "approved" && a.reschedule_count > 0 ? (
              <dd className="text-xs text-muted-foreground">Rescheduled by the clinic</dd>
            ) : null}
          </div>
        ) : null}
        {!confirmed || changed ? (
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{confirmed ? "You requested" : "Preferred schedule"}</dt>
            <dd className={confirmed ? "tabular text-muted-foreground" : "tabular font-medium"}>{preferred}</dd>
            {a.status === "pending" ? <dd className="text-xs text-muted-foreground">Waiting for the clinic to confirm</dd> : null}
          </div>
        ) : null}
      </dl>
      {STATUS_NOTES[a.status] ? <p className="text-sm text-muted-foreground">{STATUS_NOTES[a.status]}</p> : null}
      {a.staff_remarks ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm break-words">
          <span className="font-medium">{a.status === "declined" ? "Reason from the clinic: " : "Clinic remarks: "}</span>
          {a.staff_remarks}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-muted-foreground">Requested on {formatDateTime(a.created_at)}</p>
        {a.status === "pending" ? (
          <ActionForm
            action={cancelMyAppointment.bind(null, a.id)}
            submitLabel="Cancel request"
            pendingLabel="Cancelling…"
            variant="outline"
            confirm={CANCEL_REQUEST_CONFIRMATION}
          />
        ) : null}
      </div>
    </article>
  );
}

// Shown until clinic staff link the account to a student record.
export function WaitingForVerification() {
  return (
    <EmptyState icon={Hourglass} title="Waiting for clinic approval">
      Your account is not linked to your student record yet. The clinic will verify your details. You can request
      appointments after that.
    </EmptyState>
  );
}
