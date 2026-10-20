import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Clock,
  PackageCheck,
  PackageMinus,
  PackageX,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { DemoBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { expirySoonDate } from "@/features/medications/queries";
import { requireRole } from "@/lib/auth/dal";
import { studentRegistrationEnabled } from "@/lib/features";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { addDays, firstName, formatDateTime, formatLongDate, manilaDayStart, manilaToday, monthStart, studentName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireRole("admin", "clinic_staff");

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Hello, ${firstName(user.fullName)}`}
        description={
          <>
            {formatLongDate(new Date())} · {ROLE_LABELS[user.role]}
          </>
        }
      />
      {user.role === "clinic_staff" ? <ClinicStaffDashboard /> : <AdminDashboard />}
    </div>
  );
}

function Stat({ label, value, href, tone, icon: Icon }: { label: string; value: string | number; href?: string; tone?: "warning" | "danger"; icon?: LucideIcon }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2 text-xs leading-snug text-muted-foreground">
        {label}
        {Icon ? <Icon className={cn("mt-px size-3.5 shrink-0 sm:size-4", tone === "warning" && "text-warning-foreground", tone === "danger" && "text-destructive")} aria-hidden="true" /> : null}
      </span>
      <span
        className={cn(
          "text-xl font-semibold tabular tracking-tight sm:text-2xl",
          tone === "warning" && "text-warning-foreground",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </span>
    </>
  );
  const cls = "grid min-w-0 content-between gap-1 rounded-lg border bg-card px-3 py-2.5 sm:gap-1.5 sm:px-4 sm:py-3";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// A titled list panel with a "View all" style link.
function Panel({ id, title, href, linkLabel, children }: { id: string; title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid min-w-0 content-start gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-sm font-medium">
          {title}
        </h2>
        <Link href={href} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline">
          {linkLabel}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {children}
    </section>
  );
}

// FR-RPT-5, clinic personnel: operational counters (all records, demo included).
async function ClinicStaffDashboard() {
  const supabase = await createClient();
  const today = manilaToday();
  const dayStart = manilaDayStart(today);
  const dayEnd = manilaDayStart(addDays(today, 1));
  const soon = expirySoonDate();
  const registration = studentRegistrationEnabled();

  // Appointment counters use the same filters as the appointment lists they
  // link to (all records, demo included). Clinic visits are separate records.
  const appts = () => supabase.from("appointments").select("id", { count: "exact", head: true });
  const [visitsToday, pending, scheduled, completed, totalAppts, todayAppts, incidentsMonth, meds, registrations] = await Promise.all([
    supabase.from("clinic_visits").select("id", { count: "exact", head: true }).gte("visit_at", dayStart).lt("visit_at", dayEnd),
    appts().eq("status", "pending"),
    appts().eq("status", "approved"),
    appts().eq("status", "completed"),
    appts(),
    supabase
      .from("appointments")
      .select("id, scheduled_at, reason, students(first_name, middle_name, last_name, is_demo)")
      .eq("status", "approved")
      .gte("scheduled_at", dayStart)
      .lt("scheduled_at", dayEnd)
      .order("scheduled_at"),
    supabase.from("health_incidents").select("id", { count: "exact", head: true }).gte("occurred_at", manilaDayStart(monthStart(today))),
    supabase.from("medicines").select("id, name, stock_quantity, reorder_level, expiration_date, unit, is_demo").eq("is_active", true),
    // Accounts still waiting for the manual verification step (migration 0010).
    registration
      ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student").eq("is_active", true).is("student_id", null)
      : Promise.resolve({ count: null }),
  ]);

  const { low, expiring, expired } = inventoryAlerts(meds.data ?? [], today, soon);
  const attention = [
    ...expired.map((m) => ({ ...m, note: "Expired" })),
    ...expiring.map((m) => ({ ...m, note: "Expiring soon" })),
    ...low.filter((m) => m.expiration_date >= today).map((m) => ({ ...m, note: `Low stock: ${m.stock_quantity} ${m.unit}` })),
  ];
  const waiting = registrations.count ?? 0;

  return (
    <div className="grid gap-6 sm:gap-8">
      {waiting ? (
        <Link
          href="/students/registrations"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm transition-colors hover:bg-warning/20"
        >
          <UserCheck className="size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
          <span className="font-medium">
            {waiting} student {waiting === 1 ? "account is" : "accounts are"} waiting for record verification
          </span>
          <span className="ml-auto inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            Review registrations
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      <section aria-labelledby="today-heading" className="@container grid gap-3">
        <h2 id="today-heading" className="text-sm font-medium">
          Today at the clinic
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 @md:grid-cols-3 @4xl:grid-cols-5">
          <Stat label="Clinic visits today" value={visitsToday.count ?? 0} href={`/visits?from=${today}&to=${today}`} icon={Stethoscope} />
          <Stat label="Appointments today" value={todayAppts.data?.length ?? 0} href="/appointments/scheduled?when=today" icon={CalendarCheck} />
          <Stat label="Low stock" value={low.length} href="/medications?flag=low" tone={low.length ? "warning" : undefined} icon={PackageMinus} />
          <Stat label="Expiring in 30 days" value={expiring.length} href="/medications?flag=expiring" tone={expiring.length ? "warning" : undefined} icon={Clock} />
          <Stat label="Incidents this month" value={incidentsMonth.count ?? 0} href={`/incidents?from=${monthStart(today)}`} icon={TriangleAlert} />
        </div>
      </section>

      <section aria-labelledby="appointments-summary-heading" className="@container grid gap-3">
        <h2 id="appointments-summary-heading" className="text-sm font-medium">
          Appointments <span className="font-normal text-muted-foreground">· all records</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 @md:grid-cols-4">
          <Stat label="Pending requests" value={count(pending)} href="/appointments/pending" tone={pending.count ? "warning" : undefined} icon={CalendarClock} />
          <Stat label="Scheduled (approved)" value={count(scheduled)} href="/appointments/scheduled" icon={CalendarCheck} />
          <Stat label="Completed" value={count(completed)} href="/appointments/history?status=completed" icon={CircleCheck} />
          <Stat label="Total appointments" value={count(totalAppts)} href="/appointments" icon={CalendarDays} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel id="appointments-heading" title="Today's appointments" href="/appointments/scheduled?when=today" linkLabel="All of today">
          {todayAppts.data?.length ? (
            <ul className="divide-y rounded-lg border bg-card">
              {todayAppts.data.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/appointments/${a.id}`}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm hover:bg-muted/50 sm:grid-cols-[4.5rem_minmax(0,14rem)_minmax(0,1fr)]"
                  >
                    <span className="tabular text-muted-foreground">{formatDateTime(a.scheduled_at).split(", ").pop()}</span>
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      <span className="truncate">{a.students ? studentName(a.students) : "Student"}</span>
                      {a.students?.is_demo ? <DemoBadge /> : null}
                    </span>
                    <span className="col-start-2 truncate text-muted-foreground sm:col-start-auto">{a.reason}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarCheck} title="No appointments scheduled today">
              Approved appointments for today appear here.
            </EmptyState>
          )}
        </Panel>

        <Panel id="medicines-heading" title="Medicines needing attention" href="/medications" linkLabel="Inventory">
          {attention.length ? (
            <ul className="divide-y rounded-lg border bg-card">
              {attention.slice(0, 8).map((m) => (
                <li key={`${m.id}-${m.note}`}>
                  <Link href={`/medications/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      <span className="truncate">{m.name}</span>
                      {m.is_demo ? <DemoBadge /> : null}
                    </span>
                    <span className={cn("shrink-0 text-xs", m.note === "Expired" ? "text-destructive" : "text-warning-foreground")}>{m.note}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={PackageCheck} title="All medicines are in stock and in date">
              Low-stock, expiring, and expired medicines appear here.
            </EmptyState>
          )}
          {attention.length > 8 ? (
            <p className="text-xs text-muted-foreground">Showing 8 of {attention.length}. Use the inventory filters to see the rest.</p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

// FR-RPT-5, administrator: aggregate counters only, real records. Appointment
// counts are current totals per status (appointment_summary, migration 0013);
// visits and incidents are this month's report totals (exact, migration 0011).
// No student names or clinical details.
async function AdminDashboard() {
  const supabase = await createClient();
  const today = manilaToday();
  const soon = expirySoonDate();
  const args = { p_from: monthStart(today), p_to: today, p_scope: "real" };

  const [summary, visits, incidents, meds, profiles] = await Promise.all([
    supabase.rpc("appointment_summary", { p_scope: "real" }),
    supabase.rpc("report_visits", { ...args, p_period: "month" }),
    supabase.rpc("report_incidents", args),
    supabase.from("medicines").select("id, stock_quantity, reorder_level, expiration_date").eq("is_active", true).eq("is_demo", false),
    supabase.from("profiles").select("role").eq("is_active", true),
  ]);

  // Exact numbers only. A missing value (failed query, or a database that
  // still withholds small counts) is shown as "—", never guessed.
  const show = (n: number | null | undefined, failed = false) => (failed || n === null ? "—" : String(n ?? 0));
  const sum = (rows: (number | null)[], failed: boolean) =>
    failed || rows.some((n) => n === null) ? "—" : String(rows.reduce<number>((t, n) => t + (n ?? 0), 0));
  const a = summary.error ? undefined : summary.data?.[0];
  const noSummary = Boolean(summary.error);
  const { low, expiring, expired } = inventoryAlerts(meds.data ?? [], today, soon);
  const usersByRole = ROLES.map((r) => ({ role: r, count: (profiles.data ?? []).filter((p) => p.role === r).length }));

  return (
    <div className="grid gap-6">
      <section aria-labelledby="admin-appointments-heading" className="@container grid gap-3">
        <h2 id="admin-appointments-heading" className="text-sm font-medium">
          Appointments <span className="font-normal text-muted-foreground">· current totals, real records</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 @lg:grid-cols-3 @4xl:grid-cols-5">
          <Stat label="Pending requests" value={show(a?.pending, noSummary)} href="/reports/appointments" icon={CalendarClock} tone={a?.pending ? "warning" : undefined} />
          <Stat label="Scheduled (approved)" value={show(a?.scheduled, noSummary)} href="/reports/appointments" icon={CalendarCheck} />
          <Stat label="Appointments today" value={show(a?.today, noSummary)} href="/reports/appointments" icon={CalendarDays} />
          <Stat label="Completed" value={show(a?.completed, noSummary)} href="/reports/appointments" icon={CircleCheck} />
          <Stat label="Total appointments" value={show(a?.total, noSummary)} href="/reports/appointments" icon={CalendarDays} />
        </div>
        {noSummary ? <p className="text-xs text-destructive">Appointment totals are unavailable until database update 0013 is installed.</p> : null}
      </section>

      <section aria-labelledby="month-heading" className="@container grid gap-3">
        <h2 id="month-heading" className="text-sm font-medium">
          This month <span className="font-normal text-muted-foreground">· real records</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 @lg:grid-cols-4">
          <Stat label="Clinic visits" value={show(visits.data?.length ? visits.data[0].visit_count : 0, Boolean(visits.error))} href="/reports/visits" icon={Stethoscope} />
          <Stat label="Health incidents" value={sum((incidents.data ?? []).map((r) => r.incident_count), Boolean(incidents.error))} href="/reports/incidents" icon={TriangleAlert} />
        </div>
      </section>

      <section aria-labelledby="inventory-heading" className="@container grid gap-3">
        <h2 id="inventory-heading" className="text-sm font-medium">
          Medicine inventory <span className="font-normal text-muted-foreground">· active, real records</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 @lg:grid-cols-3">
          <Stat label="Low stock" value={show(low.length, Boolean(meds.error))} href="/medications?flag=low&scope=real" tone={low.length ? "warning" : undefined} icon={PackageMinus} />
          <Stat label="Expiring in 30 days" value={show(expiring.length, Boolean(meds.error))} href="/medications?flag=expiring&scope=real" tone={expiring.length ? "warning" : undefined} icon={Clock} />
          <Stat label="Expired" value={show(expired.length, Boolean(meds.error))} href="/medications?flag=expired&scope=real" tone={expired.length ? "danger" : undefined} icon={PackageX} />
        </div>
      </section>

      <section aria-labelledby="users-heading" className="@container grid gap-3">
        <h2 id="users-heading" className="text-sm font-medium">
          Active users
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 @xs:grid-cols-3">
          {usersByRole.map((u) => (
            <Stat key={u.role} label={ROLE_LABELS[u.role]} value={u.count} href={u.role === "clinic_staff" ? "/admin/users/personnel" : u.role === "student" ? "/admin/users/students" : undefined} />
          ))}
        </div>
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        Administrators see summary counts only. Individual student health records are visible to clinic personnel.
      </p>
    </div>
  );
}

// Active medicines that need attention. Shared by both dashboards so their
// counts follow the same rules as the inventory filters.
function inventoryAlerts<T extends { stock_quantity: number; reorder_level: number; expiration_date: string }>(meds: T[], today: string, soon: string) {
  return {
    low: meds.filter((m) => m.stock_quantity <= m.reorder_level),
    expiring: meds.filter((m) => m.expiration_date >= today && m.expiration_date <= soon),
    expired: meds.filter((m) => m.expiration_date < today),
  };
}

const count = (r: { count: number | null; error?: unknown }) => (r.error ? "—" : (r.count ?? 0));
