import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { AutoReportFilters } from "@/features/reports/auto-report-filters";
import { adminReportFilters } from "@/features/reports/admin-month";
import { SCOPE_LABEL, isReportKey, loadReport, rangeLabel, type ReportKey } from "@/features/reports/report-data";
import { ReportTable } from "@/features/reports/report-table";
import { requireRole } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";

// Administrator report pages, one per sidebar link. Same data and table as
// /reports; aggregate only, one Manila calendar month, exact counts
// (migration 0011). Nulls are never guessed.
const PAGES: Record<ReportKey, { title: string; description: string }> = {
  visits: { title: "Clinic Visits", description: "Number of clinic visits per month." },
  concerns: { title: "Health Concerns", description: "Clinic visits grouped by health concern." },
  medications: { title: "Medication Usage", description: "Quantity of each medicine issued, with current stock." },
  incidents: { title: "Health Incidents", description: "Recorded health incidents by type." },
  appointments: { title: "Appointments", description: "Appointment requests by status." },
};

export async function generateMetadata({ params }: PageProps<"/reports/[report]">): Promise<Metadata> {
  const { report } = await params;
  return { title: isReportKey(report) ? PAGES[report].title : "Reports" };
}

export default async function AdminReportPage({ params, searchParams }: PageProps<"/reports/[report]">) {
  const user = await requireRole("admin");
  const { report } = await params;
  if (!isReportKey(report)) notFound();
  const sp = await searchParams;

  const filters = adminReportFilters(sp);
  const { rows, header, failed } = await loadReport(report, filters);
  const range = rangeLabel(filters, true);
  const page = PAGES[report];

  return (
    <div className="grid min-w-0 gap-5">
      <div className="hidden print:block">
        <p className="text-lg font-semibold">WUPCare · {page.title}</p>
        <p className="text-sm">
          {range} · {SCOPE_LABEL[filters.scope]}
        </p>
        <p className="text-xs">
          Printed by {user.fullName} on {formatDateTime(new Date())}
        </p>
      </div>

      <div className="print:hidden">
        <PageHeader title={page.title} description={page.description} actions={<PrintButton />} />
      </div>

      <div className="grid min-w-0 gap-4">
        <div className="print:hidden">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            Monthly aggregate reports. Individual student medical records are not included.
          </p>
        </div>
        <AutoReportFilters initial={{ month: filters.month, year: filters.year, scope: filters.scope }}>
          <ReportTable report={report} title={page.title} subtitle={`${range} · ${SCOPE_LABEL[filters.scope]}`} rows={rows} header={header} failed={failed} sp={sp} path={`/reports/${report}`} />
        </AutoReportFilters>
      </div>
    </div>
  );
}
