import type { Metadata } from "next";

import { param } from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { bookAppointment } from "@/features/appointments/actions";
import { RequestForm } from "@/features/appointments/components/request-form";
import { StudentPicker } from "@/features/students/components/student-picker";
import { StudentSummary } from "@/features/students/components/student-summary";
import { getHealthRecord, getStudent } from "@/features/students/queries";
import { requireRole } from "@/lib/auth/dal";
import { manilaToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Book appointment" };

// FR-APT-2: clinic personnel book an appointment for a student. It is saved
// as approved at the chosen date and time; staff hours are not restricted.
export default async function NewAppointmentPage({ searchParams }: PageProps<"/appointments/new">) {
  await requireRole("clinic_staff");
  const sp = await searchParams;
  const studentId = param(sp, "student");
  const student = studentId ? await getStudent(studentId) : null;
  // The booking is saved against this student record (students.id). A student
  // sees it in My Appointments only when their portal account is linked to
  // this same record, so say which case applies before booking.
  const portal = student ? await linkedPortalAccount(student.id) : null;

  return (
    <div className="grid gap-5">
      <PageHeader title="Book appointment" description="Schedule an appointment for a student, for example after a phone call." />
      {student ? (
        <>
          <StudentSummary student={student} record={await getHealthRecord(student.id)} changeHref="/appointments/new" />
          <p className={portal ? "text-sm text-muted-foreground" : "text-sm text-warning-foreground"}>
            {portal
              ? portal.is_active
                ? "This student has a portal account. The appointment will appear in their My Appointments under Upcoming."
                : "This student's portal account is inactive, so they will not see the appointment until it is reactivated."
              : "This student record has no portal account. The appointment is saved, but no student account will show it. Check the Student ID if the student says they have an account."}
          </p>
          <RequestForm
            action={bookAppointment}
            hidden={{ student_id: student.id }}
            minDate={manilaToday()}
            cancelHref="/appointments"
            submitLabel="Book appointment"
          />
        </>
      ) : (
        <StudentPicker path="/appointments/new" q={param(sp, "q")} />
      )}
    </div>
  );
}

// Portal account linked to this student record, if any (clinic personnel can
// read profiles; RLS). Only the active flag is used.
async function linkedPortalAccount(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("is_active").eq("role", "student").eq("student_id", studentId).maybeSingle();
  return data;
}
