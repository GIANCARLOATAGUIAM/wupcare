import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  Clock,
  PackageCheck,
  PackageMinus,
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

  const [visitsToday, pending, todayAppts, incidentsMonth, meds, registrations] = await Promise.all([
    supabase.from("clinic_visits").select("id", { count: "exact", head: true }).gte("visit_at", dayStart).lt("visit_at", dayEnd),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending"),
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

  const active = meds.data ?? [];
  const low = active.filter((m) => m.stock_quantity <= m.reorder_level);
  const expiring = active.filter((m) => m.expiration_date >= today && m.expiration_date <= soon);
  const expired = active.filter((m) => m.expiration_date < today);
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
        <div className="grid grid-cols-2 gap-2 sm:gap-3 @md:grid-cols-3 @4xl:grid-cols-6">
          <Stat label="Visits today" value={visitsToday.count ?? 0} href={`/visits?from=${today}&to=${today}`} icon={Stethoscope} />
          <Stat label="Pending requests" value={pending.count ?? 0} href="/appointments/pending" tone={pending.count ? "warning" : undefined} icon={CalendarClock} />
          <Stat label="Appointments today" value={todayAppts.data?.length ?? 0} href="/appointments/scheduled?when=today" icon={CalendarCheck} />
          <Stat label="Low stock" value={low.length} href="/medications?flag=low" tone={low.length ? "warning" : undefined} icon={PackageMinus} />
          <Stat label="Expiring in 30 days" value={expiring.length} href="/medications?flag=expiring" tone={expiring.length ? "warning" : undefined} icon={Clock} />
          <Stat label="Incidents this month" value={incidentsMonth.count ?? 0} href={`/incidents?from=${monthStart(today)}`} icon={TriangleAlert} />
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

// FR-RPT-5, administrator: aggregate counters only (real records, this month).
async function AdminDashboard() {
  const supabase = await createClient();
  const today = manilaToday();
  const args = { p_from: monthStart(today), p_to: today, p_scope: "real" };

  const [visits, incidents, appointments, profiles] = await Promise.all([
    supabase.rpc("report_visits", { ...args, p_period: "month" }),
    supabase.rpc("report_incidents", args),
    supabase.rpc("report_appointments", args),
    supabase.from("profiles").select("role").eq("is_active", true),
  ]);

  const show = (n: number | null | undefined) => (n === null ? "<5" : String(n ?? 0));
  const sum = (rows: { n: number | null }[]) => {
    const hidden = rows.some((r) => r.n === null);
    const total = rows.reduce((s, r) => s + (r.n ?? 0), 0);
    return rows.length === 0 ? "0" : hidden ? (total ? `${total}+` : "<5") : String(total);
  };
  const usersByRole = ROLES.map((r) => ({ role: r, count: (profiles.data ?? []).filter((p) => p.role === r).length }));

  return (
    <div className="grid gap-6">
      <section aria-labelledby="month-heading" className="@container grid gap-3">
        <h2 id="month-heading" className="text-sm font-medium">
          This month <span className="font-normal text-muted-foreground">· real records</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 @lg:grid-cols-3 @4xl:grid-cols-5">
          <Stat label="Clinic visits" value={show(visits.data?.[0]?.visit_count)} href="/reports/visits" />
          <Stat label="Health incidents" value={sum((incidents.data ?? []).map((r) => ({ n: r.incident_count })))} href="/reports/incidents" />
          {(["pending", "approved", "completed"] as const).map((s) => (
            <Stat
              key={s}
              label={`Appointments ${s}`}
              value={show((appointments.data ?? []).find((r) => r.status === s)?.appointment_count ?? 0)}
              href="/reports/appointments"
            />
          ))}
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
        Administrators see summary counts only, and counts below 5 are shown as &lt;5. Individual student health records are
        visible to clinic personnel.
      </p>
    </div>
  );
}
