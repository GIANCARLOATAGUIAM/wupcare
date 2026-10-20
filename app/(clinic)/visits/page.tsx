import { pageOutOfRange } from "@/lib/pagination";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";

import { DemoBadge } from "@/components/app/badges";
import {
  FilterBar,
  FilterDate,
  FilterSelect,
  PAGE_SIZE,
  Pagination,
  SCOPE_OPTIONS,
  SearchInput,
  TableEmpty,
  dateParam,
  hrefWith,
  pageParam,
  param,
  scopeParam,
} from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { concernCategories } from "@/features/medications/queries";
import { requireRole } from "@/lib/auth/dal";
import { ilikeAny, searchTerm } from "@/lib/forms";
import { addDays, formatDateTime, manilaDayStart, studentName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Visits" };

export default async function VisitsPage({ searchParams }: PageProps<"/visits">) {
  await requireRole("clinic_staff");
  const sp = await searchParams;
  const q = searchTerm(param(sp, "q"));
  const from = dateParam(sp, "from");
  const to = dateParam(sp, "to");
  const category = param(sp, "category");
  const scope = scopeParam(sp);
  const page = pageParam(sp);

  const supabase = await createClient();
  const categories = await concernCategories();

  let query = supabase
    .from("clinic_visits")
    .select(
      "id, visit_at, reason, category:health_concern_categories(name), attended:profiles!clinic_visits_attended_by_fkey(full_name), students!inner(id, student_number, first_name, middle_name, last_name, is_demo)",
      { count: "exact" }
    )
    .order("visit_at", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (from) query = query.gte("visit_at", manilaDayStart(from));
  if (to) query = query.lt("visit_at", manilaDayStart(addDays(to, 1)));
  if (category && categories.some((c) => c.id === category)) query = query.eq("concern_category_id", category);
  if (scope !== "all") query = query.eq("students.is_demo", scope === "demo");
  if (q) {
    query = query.or(ilikeAny(["student_number", "first_name", "last_name"], q), {
      referencedTable: "students",
    });
  }

  const { data: visits, count, error } = await query;
  // A page number past the end: go back to the first page.
  if (pageOutOfRange(page, count, error)) redirect(hrefWith("/visits", sp, { page: undefined }));

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Visits"
        description="Clinic visits and consultations, newest first."
        actions={
          <Button asChild>
            <Link href="/visits/new">
              <FilePlus2 />
              New visit
            </Link>
          </Button>
        }
      />

      <FilterBar>
        <SearchInput defaultValue={param(sp, "q")} placeholder="Student number or name" label="Student" />
        <FilterDate name="from" label="From" defaultValue={from} />
        <FilterDate name="to" label="To" defaultValue={to} />
        <FilterSelect
          name="category"
          label="Concern"
          defaultValue={category}
          options={[{ value: "", label: "All concerns" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          className="sm:w-48"
        />
        <FilterSelect name="scope" label="Records" defaultValue={scope} options={SCOPE_OPTIONS} className="sm:w-36" />
      </FilterBar>

      {error ? (
        <p className="text-sm text-destructive">Could not load visits. Please reload the page.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="hidden md:table-cell">Reason</TableHead>
              <TableHead className="hidden sm:table-cell">Concern</TableHead>
              <TableHead className="hidden lg:table-cell">Attended by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visits?.length ? (
              visits.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/visits/${v.id}`} className="font-medium hover:underline">
                      {formatDateTime(v.visit_at)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Link href={`/students/${v.students.id}`} className="hover:underline">
                        {studentName(v.students)}
                      </Link>
                      {v.students.is_demo ? <DemoBadge /> : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-64 truncate md:table-cell">{v.reason}</TableCell>
                  <TableCell className="hidden sm:table-cell">{v.category?.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{v.attended?.full_name}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmpty colSpan={5}>No visits found.</TableEmpty>
            )}
          </TableBody>
        </Table>
      )}

      <Pagination path="/visits" sp={sp} page={page} total={count ?? 0} />
    </div>
  );
}
