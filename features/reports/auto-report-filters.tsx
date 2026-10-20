"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { adminReportHref, REPORT_MAX_YEAR, REPORT_MIN_YEAR, REPORT_MONTHS, type AdminReportSelection } from "./admin-month";

const YEARS = Array.from({ length: REPORT_MAX_YEAR - REPORT_MIN_YEAR + 1 }, (_, index) => String(REPORT_MAX_YEAR - index));

// Admin-only filters. Every selection navigates immediately; the server derives
// the complete Manila calendar month and continues using the report RPCs.
export function AutoReportFilters({ initial, children }: { initial: AdminReportSelection; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [values, setValues] = useState(initial);
  const latest = useRef(initial);
  const [pending, startTransition] = useTransition();
  useEffect(() => { latest.current = initial; }, [initial]);

  const key = `${initial.month}|${initial.year}|${initial.scope}`;
  const [syncedKey, setSyncedKey] = useState(key);
  if (key !== syncedKey) {
    setSyncedKey(key);
    setValues(initial);
  }

  function update(change: Partial<AdminReportSelection>) {
    // Preserve rapid successive selections while the previous URL is loading.
    const next = { ...latest.current, ...change };
    latest.current = next;
    setValues(next);
    const sp = Object.fromEntries(searchParams.entries());
    const href = adminReportHref(pathname, sp, next);
    if (href === `${pathname}?${searchParams.toString()}`) return;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <>
      <form role="search" aria-label="Report filters" onSubmit={(event) => event.preventDefault()} className="flex flex-wrap items-end gap-3 print:hidden">
        <ReportSelect id="f-month" label="Month" value={values.month} onChange={(month) => update({ month })}>
          {REPORT_MONTHS.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}
        </ReportSelect>
        <ReportSelect id="f-year" label="Year" value={values.year} onChange={(year) => update({ year })}>
          {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
        </ReportSelect>
        <ReportSelect id="f-scope" label="Records" value={values.scope} onChange={(scope) => update({ scope: scope as AdminReportSelection["scope"] })}>
          <option value="real">Real only</option>
          <option value="demo">Demo only</option>
          <option value="all">All records</option>
        </ReportSelect>
        <p role="status" aria-live="polite" aria-atomic="true" className="flex h-5 w-full shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {pending ? <><LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Updating…</> : null}
        </p>
      </form>
      <div aria-busy={pending} className={cn("min-w-0 transition-opacity motion-reduce:transition-none", pending && "opacity-60")}>
        {children}
      </div>
    </>
  );
}

function ReportSelect({ id, label, value, onChange, children }: {
  id: string; label: string; value: string; onChange: (value: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-40">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>{children}</NativeSelect>
    </div>
  );
}
