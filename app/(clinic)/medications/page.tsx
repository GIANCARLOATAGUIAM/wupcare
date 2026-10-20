import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageOutOfRange, pageRange } from "@/lib/pagination";
import { lowStockPage } from "@/features/medications/low-stock-page";
import { Plus } from "lucide-react";

import { DemoBadge, StockFlags, stockState } from "@/components/app/badges";
import {
  FilterBar,
  FilterSelect,
  hrefWith,
  Pagination,
  SCOPE_OPTIONS,
  SearchInput,
  TableEmpty,
  pageParam,
  param,
  scopeParam,
} from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { expirySoonDate } from "@/features/medications/queries";
import { requireRole } from "@/lib/auth/dal";
import { searchTerm } from "@/lib/forms";
import { formatDate, manilaToday } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Medications" };

const FLAG_OPTIONS = [
  { value: "", label: "Any stock" },
  { value: "low", label: "Low stock" },
  { value: "expiring", label: "Expiring in 30 days" },
  { value: "expired", label: "Expired" },
];
const ACTIVE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "any", label: "Active and inactive" },
];

export default async function MedicationsPage({ searchParams }: PageProps<"/medications">) {
  // Both roles see the inventory; only Administrators add medicines.
  const user = await requireRole("admin", "clinic_staff");
  const isAdmin = user.role === "admin";
  const sp = await searchParams;
  const q = searchTerm(param(sp, "q"));
  const flag = param(sp, "flag");
  const active = param(sp, "active") ?? "active";
  const scope = scopeParam(sp);
  const page = pageParam(sp);
  const today = manilaToday();
  const soon = expirySoonDate();

  const supabase = await createClient();
  const low = flag === "low" ? await lowStockPage(supabase, page, { q, active, scope }) : null;
  if (low && pageOutOfRange(page, low.total, low.error)) redirect(hrefWith("/medications", sp, { page: undefined }));
  let query = supabase.from("medicines").select("*", { count: "exact" });
  if (low) query = query.in("id", low.ids).order("id").range(0, 9);
  else query = query.order("name").order("expiration_date").order("id").range(...pageRange(page));
  if (q) query = query.ilike("name", `%${q}%`);
  if (active === "active") query = query.eq("is_active", true);
  if (active === "inactive") query = query.eq("is_active", false);
  if (scope !== "all") query = query.eq("is_demo", scope === "demo");
  if (flag === "expired") query = query.lt("expiration_date", today);
  if (flag === "expiring") query = query.gte("expiration_date", today).lte("expiration_date", soon);
  const result = low?.error ? { data: null, count: null, error: low.error } : await query;
  const { data, error } = result;
  const count = low?.total ?? result.count;
  if (pageOutOfRange(page, count, error)) redirect(hrefWith("/medications", sp, { page: undefined }));
  const pageRows = (data ?? []).map((m) => ({ ...m, state: stockState(m, today, soon) }));

  return (
    <div className="grid gap-5">
      <PageHeader
        title={isAdmin ? "Medicine Inventory" : "Medications"}
        description={
          isAdmin
            ? "Add medicines, restock, adjust stock, and review stock history."
            : "Stock levels and expiration. Open a medicine to issue it to a student; the inventory is managed by the administrator."
        }
        actions={
          isAdmin ? (
            <Button asChild>
              <Link href="/medications/new">
                <Plus />
                Add medicine
              </Link>
            </Button>
          ) : null
        }
      />

      <FilterBar>
        <SearchInput defaultValue={param(sp, "q")} placeholder="Medicine name" />
        <FilterSelect name="flag" label="Stock" defaultValue={flag} options={FLAG_OPTIONS} className="sm:w-48" />
        <FilterSelect name="active" label="Status" defaultValue={active} options={ACTIVE_OPTIONS} className="sm:w-48" />
        <FilterSelect name="scope" label="Records" defaultValue={scope} options={SCOPE_OPTIONS} className="sm:w-36" />
      </FilterBar>

      {error ? (
        <p className="text-sm text-destructive">Could not load medicines. Please reload the page.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medicine</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Reorder at</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="hidden md:table-cell">Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length ? (
              pageRows.map((m) => (
                <TableRow key={m.id} className={cn(!m.is_active && "text-muted-foreground")}>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Link href={`/medications/${m.id}`} className="font-medium hover:underline">
                        {m.name}
                      </Link>
                      {m.is_demo ? <DemoBadge /> : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular whitespace-nowrap">
                    {m.stock_quantity} <span className="text-muted-foreground">{m.unit}</span>
                  </TableCell>
                  <TableCell className="hidden text-right tabular sm:table-cell">{m.reorder_level}</TableCell>
                  <TableCell className={cn("whitespace-nowrap", m.state.expired && "text-destructive")}>{formatDate(m.expiration_date)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StockFlags state={m.state} inactive={!m.is_active} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmpty colSpan={5}>No medicines found.</TableEmpty>
            )}
          </TableBody>
        </Table>
      )}

      {!error ? <Pagination path="/medications" sp={sp} page={page} total={count ?? 0} /> : null}
    </div>
  );
}
