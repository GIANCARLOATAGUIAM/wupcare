import { collectRows } from "@/lib/collect-rows";
import "server-only";

import { dateParam, param, scopeParam, type Scope, type SearchParams } from "@/components/app/list-controls";
import { formatDate, manilaToday, monthStart } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { adminReportFilters } from "./admin-month";

// Shared by /reports (clinic personnel, tabs) and /reports/[report]
// (administrator, sidebar pages). FR-RPT-1..4: aggregate counts only, from the
// report_* database functions. For administrators the database widens the
// range to whole months and hides counts below 5 (FR-RPT-3a); null counts are
// shown as "<5".

export const REPORTS = {
  visits: "Clinic visits",
  concerns: "Common health concerns",
  medications: "Medication usage",
  incidents: "Health incidents",
  appointments: "Appointments",
} as const;
export type ReportKey = keyof typeof REPORTS;

export function isReportKey(value: unknown): value is ReportKey {
  return typeof value === "string" && value in REPORTS;
}

export const SCOPE_LABEL = { real: "Real records only", demo: "Demo records only", all: "All records" } as const;

export type ReportRow = { label: string; count: number | null; extra?: string };

export type ReportFilters = { from: string; to: string; scope: Scope; period: "day" | "month" };

export function reportFilters(sp: SearchParams, isAdmin: boolean): ReportFilters {
  if (isAdmin) return adminReportFilters(sp);
  const today = manilaToday();
  let from = dateParam(sp, "from") ?? monthStart(today);
  let to = dateParam(sp, "to") ?? today;
  if (to < from) [from, to] = [to, from];
  const scope = scopeParam(sp, "real");
  const period = param(sp, "period") === "month" ? "month" : "day";
  return { from, to, scope, period };
}

const monthLabel = (date: string) =>
  new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" });

export function rangeLabel({ from, to }: ReportFilters, isAdmin: boolean) {
  return isAdmin ? monthLabel(from) : `${formatDate(from)} – ${formatDate(to)}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function loadReport(report: ReportKey, { from, to, scope, period }: ReportFilters) {
  const supabase = await createClient();
  const args = { p_from: from, p_to: to, p_scope: scope };
  let rows: ReportRow[] = [];
  let header: [string, string, string?] = ["", "Count"];
  let failed = false;

  if (report === "visits") {
    const { data, error } = await collectRows((from, to) => supabase.rpc("report_visits", { ...args, p_period: period }).order("period").range(from, to));
    failed = Boolean(error);
    header = [period === "month" ? "Month" : "Date", "Visits"];
    rows = (data ?? []).map((r) => ({ label: period === "month" ? monthLabel(r.period) : formatDate(r.period), count: r.visit_count }));
  } else if (report === "concerns") {
    const { data, error } = await collectRows((from, to) => supabase.rpc("report_concerns", args).order("visit_count", { ascending: false, nullsFirst: false }).order("category").range(from, to));
    failed = Boolean(error);
    header = ["Health concern", "Visits"];
    rows = (data ?? []).map((r) => ({ label: r.category, count: r.visit_count }));
  } else if (report === "medications") {
    const { data, error } = await collectRows((from, to) => supabase.rpc("report_medication_usage", args).order("quantity_issued", { ascending: false, nullsFirst: false }).order("medicine_id").range(from, to));
    failed = Boolean(error);
    header = ["Medicine", "Quantity issued", "Current stock"];
    rows = (data ?? []).map((r) => ({ label: r.medicine_name, count: r.quantity_issued, extra: `${r.stock_quantity} ${r.unit}` }));
  } else if (report === "incidents") {
    const { data, error } = await collectRows((from, to) => supabase.rpc("report_incidents", args).order("incident_type").range(from, to));
    failed = Boolean(error);
    header = ["Incident type", "Incidents"];
    rows = (data ?? []).map((r) => ({ label: cap(r.incident_type), count: r.incident_count }));
  } else {
    const { data, error } = await collectRows((from, to) => supabase.rpc("report_appointments", args).order("status").range(from, to));
    failed = Boolean(error);
    header = ["Status", "Appointments"];
    rows = (data ?? []).map((r) => ({ label: cap(r.status), count: r.appointment_count }));
  }

  return { rows, header, failed };
}
