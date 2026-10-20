import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, FilePlus2, Pencil, Printer, TriangleAlert } from "lucide-react";

import { AppointmentStatusBadge, DemoBadge, StudentStatusBadge } from "@/components/app/badges";
import { DetailItem } from "@/components/app/fields";
import { LinkTabs, TableEmpty, param } from "@/components/app/list-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getHealthRecord, getStudent } from "@/features/students/queries";
import { requireRole } from "@/lib/auth/dal";
import { formatDate, formatDateTime, formatTime, studentName } from "@/lib/format";
import { AcademicLine } from "@/features/academics/academic-line";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Student" };

const TABS = ["health", "visits", "appointments", "incidents", "medications"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  health: "Health record",
  visits: "Visits",
  appointments: "Appointments",
  incidents: "Incidents",
  medications: "Medications",
};

export default async function StudentPage({ params, searchParams }: PageProps<"/students/[id]">) {
  await requireRole("clinic_staff");
  const { id } = await params;
  const sp = await searchParams;
  const tabParam = param(sp, "tab");
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "health";

  const [student, record] = await Promise.all([getStudent(id), getHealthRecord(id)]);
  if (!student) notFound();

  const supabase = await createClient();
  const counts = await Promise.all(
    (["clinic_visits", "appointments", "health_incidents"] as const).map((t) =>
      supabase.from(t).select("id", { count: "exact", head: true }).eq("student_id", id)
    )
  );
  const medCount = await supabase
    .from("medication_transactions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", id);
  const countFor: Partial<Record<Tab, number>> = {
    visits: counts[0].count ?? 0,
    appointments: counts[1].count ?? 0,
    incidents: counts[2].count ?? 0,
    medications: medCount.count ?? 0,
  };

  const alerts = [
    record?.allergies ? { label: "Allergies", text: record.allergies } : null,
    record?.existing_conditions ? { label: "Conditions", text: record.existing_conditions } : null,
  ].filter((a): a is { label: string; text: string } => a !== null);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b pb-5">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{studentName(student)}</h1>
            {student.is_demo ? <DemoBadge /> : null}
            <StudentStatusBadge status={student.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs">{student.student_number}</span>
            <AcademicLine student={student} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href={`/visits/new?student=${id}`}>
              <FilePlus2 />
              New visit
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/appointments/new?student=${id}`}>
              <CalendarPlus />
              Book appointment
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/incidents/new?student=${id}`}>
              <TriangleAlert />
              Record incident
            </Link>
          </Button>
          {/* Icon-only on phones so the header fits two rows; the label stays for screen readers. */}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/students/${id}/edit`} title="Edit student">
              <Pencil />
              <span className="sr-only sm:not-sr-only">Edit</span>
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/reports/student/${id}`} title="History report">
              <Printer />
              <span className="sr-only sm:not-sr-only">History report</span>
            </Link>
          </Button>
        </div>
      </div>

      {alerts.length ? (
        <Alert className="border-warning/60 bg-warning/10">
          <TriangleAlert className="text-warning-foreground" />
          <AlertTitle className="text-warning-foreground">Health alerts</AlertTitle>
          <AlertDescription>
            <dl className="grid gap-1 text-foreground">
              {alerts.map((a) => (
                <div key={a.label} className="flex gap-2">
                  <dt className="font-medium">{a.label}:</dt>
                  <dd className="whitespace-pre-line">{a.text}</dd>
                </div>
              ))}
            </dl>
          </AlertDescription>
        </Alert>
      ) : null}

      <LinkTabs
        label="Student record sections"
        active={tab}
        tabs={TABS.map((t) => ({
          key: t,
          label: TAB_LABELS[t],
          href: t === "health" ? `/students/${id}` : `/students/${id}?tab=${t}`,
          count: countFor[t],
        }))}
      />

      {tab === "health" ? <HealthTab studentId={id} student={student} record={record} /> : null}
      {tab === "visits" ? <VisitsTab studentId={id} /> : null}
      {tab === "appointments" ? <AppointmentsTab studentId={id} /> : null}
      {tab === "incidents" ? <IncidentsTab studentId={id} /> : null}
      {tab === "medications" ? <MedicationsTab studentId={id} /> : null}
    </div>
  );
}

function HealthTab({
  studentId,
  student,
  record,
}: {
  studentId: string;
  student: NonNullable<Awaited<ReturnType<typeof getStudent>>>;
  record: Awaited<ReturnType<typeof getHealthRecord>>;
}) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Health information</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/students/${studentId}/health/edit`}>
              <Pencil />
              Edit health record
            </Link>
          </Button>
        </div>
        {record ? (
          <>
            <dl className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
              <DetailItem label="Allergies">{record.allergies}</DetailItem>
              <DetailItem label="Existing conditions">{record.existing_conditions}</DetailItem>
              <DetailItem label="Medical history">{record.medical_history}</DetailItem>
              <DetailItem label="Immunizations">{record.immunizations}</DetailItem>
              <DetailItem label="Health notes" className="sm:col-span-2">
                {record.health_notes}
              </DetailItem>
              <DetailItem label="Emergency contact" className="sm:col-span-2">
                {[record.emergency_contact_name, record.emergency_contact_relationship, record.emergency_contact_number]
                  .filter(Boolean)
                  .join(" · ")}
              </DetailItem>
            </dl>
            <p className="text-xs text-muted-foreground">
              {record.updater
                ? `Last updated by ${record.updater.full_name}, ${formatDateTime(record.updated_at)}`
                : "Not updated since the record was created."}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No health record found.</p>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Profile</h2>
        <dl className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Sex">{student.sex ? (student.sex === "male" ? "Male" : "Female") : null}</DetailItem>
          <DetailItem label="Birth date">{student.birth_date ? formatDate(student.birth_date) : null}</DetailItem>
          <DetailItem label="Mobile number">{student.contact_number}</DetailItem>
          <DetailItem label="Email">{student.email}</DetailItem>
          <DetailItem label="Address" className="sm:col-span-2">
            {student.address}
          </DetailItem>
          <DetailItem label="Parent or guardian" className="sm:col-span-2 lg:col-span-3">
            {[student.guardian_name, student.guardian_relationship, student.guardian_contact].filter(Boolean).join(" · ")}
          </DetailItem>
        </dl>
      </section>
    </div>
  );
}

async function VisitsTab({ studentId }: { studentId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinic_visits")
    .select("id, visit_at, reason, category:health_concern_categories(name), attended:profiles!clinic_visits_attended_by_fkey(full_name)")
    .eq("student_id", studentId)
    .order("visit_at", { ascending: false })
    .limit(100);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead className="hidden sm:table-cell">Concern</TableHead>
          <TableHead className="hidden md:table-cell">Attended by</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.length ? (
          data.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="whitespace-nowrap">
                <Link href={`/visits/${v.id}`} className="hover:underline">
                  {formatDateTime(v.visit_at)}
                </Link>
              </TableCell>
              <TableCell className="max-w-72 truncate">{v.reason}</TableCell>
              <TableCell className="hidden sm:table-cell">{v.category?.name}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{v.attended?.full_name}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableEmpty colSpan={4}>No clinic visits recorded.</TableEmpty>
        )}
      </TableBody>
    </Table>
  );
}

async function AppointmentsTab({ studentId }: { studentId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("id, preferred_date, preferred_time, scheduled_at, status, reason")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Requested for</TableHead>
          <TableHead>Schedule</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden md:table-cell">Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.length ? (
          data.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="whitespace-nowrap">
                <Link href={`/appointments/${a.id}`} className="hover:underline">
                  {formatDate(a.preferred_date)}, {formatTime(a.preferred_time)}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">{a.scheduled_at ? formatDateTime(a.scheduled_at) : "—"}</TableCell>
              <TableCell>
                <AppointmentStatusBadge status={a.status} />
              </TableCell>
              <TableCell className="hidden max-w-72 truncate md:table-cell">{a.reason}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableEmpty colSpan={4}>No appointments.</TableEmpty>
        )}
      </TableBody>
    </Table>
  );
}

async function IncidentsTab({ studentId }: { studentId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("health_incidents")
    .select("id, occurred_at, type, description")
    .eq("student_id", studentId)
    .order("occurred_at", { ascending: false })
    .limit(100);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.length ? (
          data.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="whitespace-nowrap">
                <Link href={`/incidents/${i.id}`} className="hover:underline">
                  {formatDateTime(i.occurred_at)}
                </Link>
              </TableCell>
              <TableCell className="capitalize">{i.type}</TableCell>
              <TableCell className="max-w-96 truncate">{i.description}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableEmpty colSpan={3}>No health incidents recorded.</TableEmpty>
        )}
      </TableBody>
    </Table>
  );
}

async function MedicationsTab({ studentId }: { studentId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("medication_transactions")
    .select("id, created_at, quantity, clinic_visit_id, incident_id, notes, medicine:medicines(id, name, unit)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Medicine</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="hidden sm:table-cell">Given during</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.length ? (
          data.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="whitespace-nowrap">{formatDateTime(t.created_at)}</TableCell>
              <TableCell>
                {t.medicine ? (
                  <Link href={`/medications/${t.medicine.id}`} className="hover:underline">
                    {t.medicine.name}
                  </Link>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular whitespace-nowrap">
                {-t.quantity} {t.medicine?.unit}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {t.clinic_visit_id ? (
                  <Link href={`/visits/${t.clinic_visit_id}`} className="hover:underline">
                    Visit
                  </Link>
                ) : t.incident_id ? (
                  <Link href={`/incidents/${t.incident_id}`} className="hover:underline">
                    Incident
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Direct issue</span>
                )}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableEmpty colSpan={4}>No medicines issued.</TableEmpty>
        )}
      </TableBody>
    </Table>
  );
}
