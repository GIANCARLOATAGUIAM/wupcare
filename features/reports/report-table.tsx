import { redirect } from "next/navigation";
import { pageParam, pageInfo, hrefWith, PAGE_SIZE, type SearchParams } from "@/lib/pagination";
import { Pagination, TableEmpty } from "@/components/app/list-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { ReportKey, ReportRow } from "./report-data";

// The report body: a heading line and the count table. Shared by every report
// page; it fills the content width with the count columns kept narrow.
export function ReportTable({
  report,
  title,
  subtitle,
  rows,
  header,
  failed,
  sp,
  path,
}: {
  report: ReportKey;
  title: string;
  subtitle: string;
  rows: ReportRow[];
  header: [string, string, string?];
  failed: boolean;
  sp: SearchParams;
  path: string;
}) {
  const page = pageParam(sp);
  const { pages } = pageInfo(page, rows.length);
  if (!failed && page > pages) redirect(hrefWith(path, sp, { page: undefined }));
  const hasHidden = rows.some((r) => r.count === null);
  const total = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const showCount = (n: number | null) => (n === null ? "<5" : n.toLocaleString("en-PH"));

  return (
    <section className="grid w-full min-w-0 gap-2">
      <h2 className="text-sm font-medium">
        {title} <span className="font-normal text-muted-foreground">· {subtitle}</span>
      </h2>
      {failed ? (
        <p className="text-sm text-destructive">Could not load the report. Please try again.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full">{header[0]}</TableHead>
              <TableHead className="text-right whitespace-nowrap">{header[1]}</TableHead>
              {header[2] ? <TableHead className="text-right whitespace-nowrap">{header[2]}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              <>
                {rows.map((r, index) => (
                  <TableRow key={`${r.label}-${index}`} className={index >= (page - 1) * PAGE_SIZE && index < page * PAGE_SIZE ? undefined : "hidden print:table-row"}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right tabular">{showCount(r.count)}</TableCell>
                    {header[2] ? <TableCell className="text-right tabular text-muted-foreground">{r.extra}</TableCell> : null}
                  </TableRow>
                ))}
                {report !== "medications" ? (
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular">{hasHidden ? `${total.toLocaleString("en-PH")}+` : total.toLocaleString("en-PH")}</TableCell>
                  </TableRow>
                ) : null}
              </>
            ) : (
              <TableEmpty colSpan={header[2] ? 3 : 2}>No records in this range.</TableEmpty>
            )}
          </TableBody>
        </Table>
      )}
      {!failed ? <Pagination path={path} sp={sp} page={page} total={rows.length} /> : null}
      {hasHidden && report !== "medications" ? (
        <p className="text-xs text-muted-foreground">The total excludes groups shown as &lt;5.</p>
      ) : null}
    </section>
  );
}
