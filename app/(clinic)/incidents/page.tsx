import { pageOutOfRange } from "@/lib/pagination";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INCIDENT_TYPES } from "@/features/incidents/constants";
import { requireRole } from "@/lib/auth/dal";
import { ilikeAny, searchTerm } from "@/lib/forms";
import { addDays, formatDateTime, manilaDayStart, studentName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Incidents" };

type IncidentType = (typeof INCIDENT_TYPES)[number]["value"];

export default async function IncidentsPage({ searchParams }: PageProps<"/incidents">) {
  await requireRole("clinic_staff");
  const sp = await searchParams;
  const q = searchTerm(param(sp, "q"));
  const type = param(sp, "type");
  const from = dateParam(sp, "from");
  const to = dateParam(sp, "to");
  const scope = scopeParam(sp);
  const page = pageParam(sp);

  const supabase = await createClient();
  let query = supabase
    .from("health_incidents")
    .select(
      "id, occurred_at, type, location, description, students!inner(id, student_number, first_name, middle_name, last_name, is_demo)",
      { count: "exact" }
    )
    .order("occurred_at", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (type && INCIDENT_TYPES.some((t) => t.value === type)) query = query.eq("type", type as IncidentType);
  if (from) query = query.gte("occurred_at", manilaDayStart(from));
  if (to) query = query.lt("occurred_at", manilaDayStart(addDays(to, 1)));
  if (scope !== "all") query = query.eq("students.is_demo", scope === "demo");
  if (q) {
    query = query.or(ilikeAny(["student_number", "first_name", "last_name"], q), { referencedTable: "students" });
  }
  const { data: rows, count, error } = await query;
  // A page number past the end: go back to the first page.
  if (pageOutOfRange(page, count, error)) redirect(hrefWith("/incidents", sp, { page: undefined }));

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Health incidents"
        description="Illnesses, injuries, accidents, and other incidents, with the action taken."
        actions={
          <Button asChild>
            <Link href="/incidents/new">
              <TriangleAlert />
              Record incident
            </Link>
          </Button>
        }
      />

      <FilterBar>
        <SearchInput defaultValue={param(sp, "q")} placeholder="Student number or name" label="Student" />
        <FilterSelect name="type" label="Type" defaultValue={type} options={[{ value: "", label: "All types" }, ...INCIDENT_TYPES]} className="sm:w-36" />
        <FilterDate name="from" label="From" defaultValue={from} />
        <FilterDate name="to" label="To" defaultValue={to} />
        <FilterSelect name="scope" label="Records" defaultValue={scope} options={SCOPE_OPTIONS} className="sm:w-36" />
      </FilterBar>

      {error ? (
        <p className="text-sm text-destructive">Could not load incidents. Please reload the page.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.length ? (
              rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/incidents/${i.id}`} className="font-medium hover:underline">
                      {formatDateTime(i.occurred_at)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {i.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Link href={`/students/${i.students.id}`} className="hover:underline">
                        {studentName(i.students)}
                      </Link>
                      {i.students.is_demo ? <DemoBadge /> : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-72 truncate md:table-cell">{i.description}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{i.location ?? "—"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmpty colSpan={5}>No incidents found.</TableEmpty>
            )}
          </TableBody>
        </Table>
      )}

      <Pagination path="/incidents" sp={sp} page={page} total={count ?? 0} />
    </div>
  );
}
