import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoBadge } from "@/components/app/badges";
import { DetailItem } from "@/components/app/fields";
import { PrintButton } from "@/components/app/print-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getHealthRecord, getStudent } from "@/features/students/queries";
import { requireRole } from "@/lib/auth/dal";
import { formatDate, formatDateTime, formatTime, studentName } from "@/lib/format";
import { AcademicLine } from "@/features/academics/academic-line";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Student clinic history" };

// FR-RPT-2: printable summary for one student. Clinic personnel only.
export default async function StudentHistoryReport({ params }: PageProps<"/reports/student/[id]">) {
  const user = await requireRole("clinic_staff");
  const { id } = await params;
  const [student, record] = await Promise.all([getStudent(id), getHealthRecord(id)]);
  if (!student) notFound();

  const supabase = await createClient();
  const [visits, appointments, incidents, meds] = await Promise.all([
    supabase
      .from("clinic_visits")
      .select("id, visit_at, reason, assessment, treatment, follow_up_instructions, category:health_concern_categories(name)")
      .eq("student_id", id)
      .order("visit_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, preferred_date, preferred_time, scheduled_at, status, reason")
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("health_incidents")
      .select("id, occurred_at, type, description, action_taken")
      .eq("student_id", id)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("medication_transactions")
      .select("id, created_at, quantity, medicine:medicines(name, unit)")
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <article className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="grid gap-1">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">WUPCare · Student clinic history</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {studentName(student)} {student.is_demo ? <DemoBadge /> : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs">{student.student_number}</span>
            <AcademicLine student={student} />
          </p>
          <p className="text-xs text-muted-foreground">
            Prepared by {user.fullName} on {formatDateTime(new Date())}. Confidential health information.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link href={`/students/${id}`} className="self-center text-sm text-primary hover:underline">
            Back to student
          </Link>
          <PrintButton />
        </div>
      </header>

      <Section title="Health record">
        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Allergies">{record?.allergies}</DetailItem>
          <DetailItem label="Existing conditions">{record?.existing_conditions}</DetailItem>
          <DetailItem label="Medical history">{record?.medical_history}</DetailItem>
          <DetailItem label="Immunizations">{record?.immunizations}</DetailItem>
          <DetailItem label="Health notes">{record?.health_notes}</DetailItem>
          <DetailItem label="Emergency contact">
            {[record?.emergency_contact_name, record?.emergency_contact_relationship, record?.emergency_contact_number].filter(Boolean).join(" · ")}
          </DetailItem>
        </dl>
      </Section>

      <Section title={`Clinic visits (${visits.data?.length ?? 0})`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reason / concern</TableHead>
              <TableHead>Assessment and treatment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visits.data?.length ? (
              visits.data.map((v) => (
                <TableRow key={v.id} className="align-top">
                  <TableCell className="whitespace-nowrap align-top">{formatDateTime(v.visit_at)}</TableCell>
                  <TableCell className="align-top">
                    {v.reason}
                    <span className="block text-xs text-muted-foreground">{v.category?.name}</span>
                  </TableCell>
                  <TableCell className="align-top whitespace-pre-line">
                    {[v.assessment, v.treatment, v.follow_up_instructions ? `Follow-up: ${v.follow_up_instructions}` : null].filter(Boolean).join("\n") || "—"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty cols={3}>No visits.</Empty>
            )}
          </TableBody>
        </Table>
      </Section>

      <Section title={`Health incidents (${incidents.data?.length ?? 0})`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>What happened / action taken</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.data?.length ? (
              incidents.data.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="whitespace-nowrap align-top">{formatDateTime(i.occurred_at)}</TableCell>
                  <TableCell className="align-top capitalize">{i.type}</TableCell>
                  <TableCell className="align-top whitespace-pre-line">{`${i.description}\nAction: ${i.action_taken}`}</TableCell>
                </TableRow>
              ))
            ) : (
              <Empty cols={3}>No incidents.</Empty>
            )}
          </TableBody>
        </Table>
      </Section>

      <Section title={`Medicines issued (${meds.data?.length ?? 0})`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Medicine</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meds.data?.length ? (
              meds.data.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(m.created_at)}</TableCell>
                  <TableCell>{m.medicine?.name}</TableCell>
                  <TableCell className="text-right tabular">
                    {-m.quantity} {m.medicine?.unit}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty cols={3}>No medicines issued.</Empty>
            )}
          </TableBody>
        </Table>
      </Section>

      <Section title={`Appointments (${appointments.data?.length ?? 0})`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested for</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.data?.length ? (
              appointments.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(a.preferred_date)}, {formatTime(a.preferred_time)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{a.scheduled_at ? formatDateTime(a.scheduled_at) : "—"}</TableCell>
                  <TableCell className="capitalize">{a.status}</TableCell>
                  <TableCell>{a.reason}</TableCell>
                </TableRow>
              ))
            ) : (
              <Empty cols={4}>No appointments.</Empty>
            )}
          </TableBody>
        </Table>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 break-inside-avoid-page">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-3 text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
