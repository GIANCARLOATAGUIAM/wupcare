import type { Scope } from "@/components/app/list-controls";
import { manilaToday } from "@/lib/format";
import { hrefWith, param, type SearchParams } from "@/lib/pagination";

export const REPORT_MIN_YEAR = 1900;
export const REPORT_MAX_YEAR = 2100;
export const REPORT_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export type AdminReportSelection = { month: string; year: string; scope: Scope };

export function adminReportFilters(sp: SearchParams, today = manilaToday()) {
  // Existing dashboard/bookmarked date-range links select their starting month.
  // Explicit month/year always take precedence over legacy dates.
  const legacy = param(sp, "from");
  const legacyDate = legacy && /^\d{4}-\d{2}-\d{2}$/.test(legacy) ? new Date(`${legacy}T00:00:00Z`) : null;
  const base = !param(sp, "month") && !param(sp, "year") && legacyDate && Number.isFinite(legacyDate.getTime()) && legacyDate.toISOString().slice(0, 10) === legacy
    ? legacy! : today;
  const rawMonth = param(sp, "month") ?? base.slice(5, 7);
  const rawYear = param(sp, "year") ?? base.slice(0, 4);
  const month = /^(0?[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth.padStart(2, "0") : today.slice(5, 7);
  const year = /^\d{4}$/.test(rawYear) && Number(rawYear) >= REPORT_MIN_YEAR && Number(rawYear) <= REPORT_MAX_YEAR ? rawYear : today.slice(0, 4);
  const rawScope = param(sp, "scope");
  const scope: Scope = rawScope === "demo" || rawScope === "all" ? rawScope : "real";
  // Calendar dates, not host-timezone instants. RPCs interpret these in Manila.
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return { month, year, scope, from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}`, period: "month" as const };
}

export function adminReportHref(path: string, sp: SearchParams, next: AdminReportSelection) {
  return hrefWith(path, sp, {
    month: next.month, year: next.year, scope: next.scope,
    from: undefined, to: undefined, period: undefined, page: undefined, report: undefined,
  });
}
