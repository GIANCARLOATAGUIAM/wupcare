import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FilterBar, FilterDate, FilterSelect, LinkTabs, hrefWith, param } from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { REPORTS, SCOPE_LABEL, isReportKey, loadReport, rangeLabel, reportFilters, type ReportKey } from "@/features/reports/report-data";
import { ReportTable } from "@/features/reports/report-table";
import { requireRole } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Reports" };

// Clinic personnel: all five reports as tabs with a filter form. Administrators
// use one page per report (/reports/[report]) from the sidebar, so they are
// redirected there with their filters kept.
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requireRole("admin", "clinic_staff");
  const isAdmin = user.role === "admin";
  const sp = await searchParams;
  const reportParam = param(sp, "report");
  const report: ReportKey = isReportKey(reportParam) ? reportParam : "visits";

  if (isAdmin) redirect(hrefWith(`/reports/${report}`, sp, { report: undefined, period: undefined }));

  const filters = reportFilters(sp, false);
  const { from, to, scope, period } = filters;
  const { rows, header, failed } = await loadReport(report, filters);
  const range = rangeLabel(filters, false);

  return (
    <div className="grid gap-5">
      <div className="hidden print:block">
        <p className="text-lg font-semibold">WUPCare · {REPORTS[report]}</p>
        <p className="text-sm">
          {range} · {SCOPE_LABEL[scope]}
        </p>
        <p className="text-xs">
          Printed by {user.fullName} on {formatDateTime(new Date())}
        </p>
      </div>

      <div className="print:hidden">
        <PageHeader title="Reports" description="Summary counts for a date range." actions={<PrintButton />} />
      </div>

      <div className="grid gap-4 print:hidden">
        <LinkTabs
          label="Reports"
          active={report}
          tabs={(Object.keys(REPORTS) as ReportKey[]).map((k) => ({ key: k, label: REPORTS[k], href: hrefWith("/reports", sp, { report: k, page: undefined }) }))}
        />
        <FilterBar>
          <input type="hidden" name="report" value={report} />
          <FilterDate name="from" label="From" defaultValue={from} />
          <FilterDate name="to" label="To" defaultValue={to} />
          {report === "visits" ? (
            <FilterSelect
              name="period"
              label="Group by"
              defaultValue={period}
              options={[
                { value: "day", label: "Day" },
                { value: "month", label: "Month" },
              ]}
              className="sm:w-32"
            />
          ) : null}
          <FilterSelect
            name="scope"
            label="Records"
            defaultValue={scope}
            options={[
              { value: "real", label: "Real only" },
              { value: "demo", label: "Demo only" },
              { value: "all", label: "All records" },
            ]}
            className="sm:w-36"
          />
        </FilterBar>
      </div>

      <ReportTable report={report} title={REPORTS[report]} subtitle={`${range} · ${SCOPE_LABEL[scope]}`} rows={rows} header={header} failed={failed} sp={sp} path="/reports" />
    </div>
  );
}
