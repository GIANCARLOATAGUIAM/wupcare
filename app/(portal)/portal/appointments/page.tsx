import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CalendarPlus } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { LinkTabs, Pagination, hrefWith, pageParam, param } from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { StudentAppointmentCard, WaitingForVerification } from "@/features/appointments/components/student-appointment-card";
import {
  STUDENT_APPOINTMENT_COLUMNS,
  STUDENT_TABS,
  STUDENT_TAB_LABELS,
  linkedStudentId,
  studentTab,
  upcomingFrom,
} from "@/features/appointments/student-portal";
import { requireRole } from "@/lib/auth/dal";
import { pageOutOfRange, pageRange } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My appointments" };

const EMPTY: Record<ReturnType<typeof studentTab>, string> = {
  all: "Your requests will appear here with their status and any remarks from the clinic.",
  pending: "You have no request waiting for the clinic.",
  upcoming: "You have no approved appointments coming up.",
  completed: "No completed appointments yet.",
  closed: "No cancelled or declined requests.",
};

export default async function MyAppointmentsPage({ searchParams }: PageProps<"/portal/appointments">) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const tab = studentTab(param(sp, "status"));
  const page = pageParam(sp);
  const supabase = await createClient();
  const studentId = await linkedStudentId(supabase, user.id);

  const header = (
    <PageHeader
      title="My Appointments"
      description="Your clinic appointment requests and their status."
      actions={
        studentId ? (
          <Button asChild variant="outline">
            <Link href="/portal/request">
              <CalendarPlus />
              Request appointment
            </Link>
          </Button>
        ) : null
      }
    />
  );
  if (!studentId) {
    return (
      <div className="grid gap-6">
        {header}
        <WaitingForVerification />
      </div>
    );
  }

  // RLS returns only this student's appointments; the student_id filter repeats it.
  let query = supabase
    .from("appointments")
    .select(STUDENT_APPOINTMENT_COLUMNS, { count: "exact" })
    .eq("student_id", studentId);
  if (tab === "pending") query = query.eq("status", "pending").order("preferred_date").order("preferred_time");
  else if (tab === "upcoming") query = query.eq("status", "approved").gte("scheduled_at", upcomingFrom()).order("scheduled_at");
  else if (tab === "completed") query = query.eq("status", "completed").order("scheduled_at", { ascending: false });
  else if (tab === "closed") query = query.in("status", ["cancelled", "declined"]).order("updated_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });
  const { data: rows, count, error } = await query.order("id").range(...pageRange(page));
  if (pageOutOfRange(page, count, error)) redirect(hrefWith("/portal/appointments", sp, { page: undefined }));

  return (
    <div className="grid gap-5">
      {header}
      <LinkTabs
        label="Appointment status"
        active={tab}
        tabs={STUDENT_TABS.map((t) => ({
          key: t,
          label: STUDENT_TAB_LABELS[t],
          href: hrefWith("/portal/appointments", sp, { status: t === "all" ? undefined : t, page: undefined }),
        }))}
      />
      {error ? (
        <p className="text-sm text-destructive">Could not load appointments. Please reload the page.</p>
      ) : rows?.length ? (
        <ul className="grid gap-3">
          {rows.map((a) => (
            <li key={a.id}>
              <StudentAppointmentCard appointment={a} headingLevel="h2" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={CalendarClock} title={tab === "all" ? "No appointments yet" : `No ${STUDENT_TAB_LABELS[tab].toLowerCase()} appointments`}>
          {EMPTY[tab]}
        </EmptyState>
      )}
      {!error ? <Pagination path="/portal/appointments" sp={sp} page={page} total={count ?? 0} /> : null}
    </div>
  );
}
