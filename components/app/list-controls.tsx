import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { DateInput } from "./date-input";

import { hrefWith, pageInfo } from "@/lib/pagination";
export { PAGE_SIZE, pageParam, param, hrefWith } from "@/lib/pagination";
import { param, type SearchParams } from "@/lib/pagination";
export type { SearchParams } from "@/lib/pagination";

export type Scope = "all" | "real" | "demo";

export function scopeParam(sp: SearchParams, fallback: Scope = "all"): Scope {
  const v = param(sp, "scope");
  return v === "real" || v === "demo" || v === "all" ? v : fallback;
}

export function dateParam(sp: SearchParams, key: string) {
  const v = param(sp, key);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

// Applies automatically (no Apply button); every change resets to page one.
export { AutoFilterBar as FilterBar } from "./auto-filter-bar";

export function SearchInput({ defaultValue, placeholder, label = "Search" }: { defaultValue?: string; placeholder: string; label?: string }) {
  return (
    <div className="grid min-w-52 flex-1 gap-1.5">
      <Label htmlFor="q" className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id="q" name="q" type="search" defaultValue={defaultValue} placeholder={placeholder} className="pl-8" />
      </div>
    </div>
  );
}

export function FilterSelect({
  name,
  label,
  defaultValue,
  options,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-40", className)}>
      <Label htmlFor={`f-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <NativeSelect id={`f-${name}`} name={name} defaultValue={defaultValue ?? ""}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function FilterText({ name, label, defaultValue, className }: { name: string; label: string; defaultValue?: string; className?: string }) {
  return (
    <div className={cn("grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-44", className)}>
      <Label htmlFor={`f-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`f-${name}`} name={name} defaultValue={defaultValue} />
    </div>
  );
}

export function FilterDate({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) {
  return (
    <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-40">
      <Label htmlFor={`f-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <DateInput id={`f-${name}`} name={name} defaultValue={defaultValue} clearable clearLabel={`Clear ${label.toLowerCase()} date`} />
    </div>
  );
}

export const SCOPE_OPTIONS = [
  { value: "all", label: "All records" },
  { value: "real", label: "Real only" },
  { value: "demo", label: "Demo only" },
];

export function Pagination({
  path,
  sp,
  page,
  total,
}: {
  path: string;
  sp: SearchParams;
  page: number;
  total: number;
}) {
  const { pages, from, to } = pageInfo(page, total);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground print:hidden">
      <p className="tabular">
        Showing {from}–{to} of {total} records
      </p>
      <div className="flex items-center gap-2">
        <span className="tabular text-xs">Page {page} of {pages}</span>
        <PageLink href={hrefWith(path, sp, { page: String(page - 1) })} disabled={page <= 1} label="Previous page">
          <ChevronLeft />
        </PageLink>
        <PageLink href={hrefWith(path, sp, { page: String(page + 1) })} disabled={page >= pages} label="Next page">
          <ChevronRight />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <Button variant="outline" size="icon" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="icon" asChild>
      <Link href={href} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}

// Link-based tabs. Server-rendered, so each tab is a shareable URL.
export function LinkTabs({
  tabs,
  active,
  label,
}: {
  tabs: { key: string; label: string; href: string; count?: number }[];
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm sm:px-3 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            // Forced colors paints transparent borders; keep only the current tab underlined.
            "forced-colors:[border-bottom-color:Canvas]",
            t.key === active && "border-primary font-medium text-foreground forced-colors:[border-bottom-color:Highlight]"
          )}
        >
          {t.label}
          {t.count !== undefined ? <span className="tabular text-xs text-muted-foreground">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
