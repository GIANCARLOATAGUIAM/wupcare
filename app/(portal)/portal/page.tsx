import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CalendarPlus, ChevronRight, CircleCheck, Hourglass, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { StudentAppointmentCard, WaitingForVerification } from "@/features/appointments/components/student-appointment-card";
import { STUDENT_APPOINTMENT_COLUMNS, linkedStudentId, upcomingFrom } from "@/features/appointments/student-portal";
import { requireRole } from "@/lib/auth/dal";
import { firstName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

// Compact metric: three fit side by side on a 320px phone. The icon appears
// once the card itself is wide enough (container query on the card).
function SummaryCard({ label, value, href, icon: Icon, tone }: { label: string; value: number | string; href: string; icon: LucideIcon; tone?: "warning" }) {
  return (
    <Link
      href={href}
      className="@container grid min-w-0 gap-1 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none sm:gap-1.5 sm:px-4 sm:py-3"
    >
      <span className="flex items-start justify-between gap-2 text-xs leading-snug text-muted-foreground">
        <span className="min-w-0">
          {label}
          <span className="sr-only"> appointments</span>
        </span>
        <Icon className={cn("mt-px hidden size-4 shrink-0 @[7.5rem]:block", tone === "warning" && "text-warning-foreground")} aria-hidden="true" />
      </span>
      <span className={cn("text-xl font-semibold tabular tracking-tight sm:text-2xl", tone === "warning" && "text-warning-foreground")}>{value}</span>
    </Link>
  );
}

export default async function PortalDashboardPage() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const studentId = await linkedStudentId(supabase, user.id);
  const header = <PageHeader title={`Hello, ${firstName(user.fullName)}!`} description="Manage your campus clinic appointments." />;

  if (!studentId) {
    return (
      <div className="grid gap-6">
        {header}
        <WaitingForVerification />
      </div>
    );
  }

  // RLS returns only this student's appointments; the student_id filter repeats it.
  const from = upcomingFrom();
  const mine = () => supabase.from("appointments").select("id", { count: "exact", head: true }).eq("student_id", studentId);
  const [pending, upcoming, completed, next] = await Promise.all([
    mine().eq("status", "pending"),
    mine().eq("status", "approved").gte("scheduled_at", from),
    mine().eq("status", "completed"),
    supabase
      .from("appointments")
      .select(STUDENT_APPOINTMENT_COLUMNS)
      .eq("student_id", studentId)
      .eq("status", "approved")
      .gte("scheduled_at", from)
      .order("scheduled_at")
      .order("id")
      .limit(1)
      .maybeSingle(),
  ]);
  const failed = Boolean(pending.error || upcoming.error || completed.error || next.error);
  // Same rule as before: one pending request at a time (also enforced by the database).
  const hasPending = Boolean(pending.error) || (pending.count ?? 0) > 0;
  const show = (n: number | null) => (failed ? "—" : n ?? 0);

  const requestAction = hasPending ? (
    <Button disabled title="You already have a pending request">
      <CalendarPlus />
      Request appointment
    </Button>
  ) : (
    <Button asChild>
      <Link href="/portal/request">
        <CalendarPlus />
        Request appointment
      </Link>
    </Button>
  );

  return (
    <div className="grid gap-6 sm:gap-8">
      <PageHeader title={`Hello, ${firstName(user.fullName)}!`} description="Manage your campus clinic appointments." actions={requestAction} />

      {failed ? <p className="text-sm text-destructive">Could not load all appointment details. Please reload the page.</p> : null}

      <section aria-labelledby="summary-heading" className="grid gap-3">
        <h2 id="summary-heading" className="sr-only">
          Appointment summary
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <SummaryCard label="Pending" value={show(pending.count)} href="/portal/appointments?status=pending" icon={Hourglass} tone={pending.count ? "warning" : undefined} />
          <SummaryCard label="Upcoming" value={show(upcoming.count)} href="/portal/appointments?status=upcoming" icon={CalendarCheck} />
          <SummaryCard label="Completed" value={show(completed.count)} href="/portal/appointments?status=completed" icon={CircleCheck} />
        </div>
      </section>

      <section aria-labelledby="next-heading" className="grid gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="next-heading" className="text-sm font-medium">
            Next upcoming appointment
          </h2>
          <Link href="/portal/appointments" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline">
            All appointments
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {next.data ? (
          <StudentAppointmentCard appointment={next.data} />
        ) : (
          <EmptyState
            icon={CalendarCheck}
            title="No upcoming appointment"
            action={
              hasPending ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/portal/appointments?status=pending">View pending request</Link>
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link href="/portal/request">
                    <CalendarPlus />
                    Request appointment
                  </Link>
                </Button>
              )
            }
          >
            {hasPending
              ? "Your request is waiting for the clinic. Its schedule appears here once it is approved."
              : "Request an appointment and the clinic will confirm a schedule."}
          </EmptyState>
        )}
      </section>

      {hasPending ? (
        <p className="text-sm text-muted-foreground">
          You have a pending request. You can send another one after the clinic responds or after you cancel it.
        </p>
      ) : null}
    </div>
  );
}
