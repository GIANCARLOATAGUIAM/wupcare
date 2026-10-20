import { pageOutOfRange } from "@/lib/pagination";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";

import { DemoBadge, StudentStatusBadge } from "@/components/app/badges";
import {
  FilterBar,
  FilterSelect,
  PAGE_SIZE,
  Pagination,
  SCOPE_OPTIONS,
  SearchInput,
  TableEmpty,
  hrefWith,
  pageParam,
  param,
  scopeParam,
} from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_OPTIONS, YEAR_OPTIONS } from "@/features/students/schema";
import { requireRole } from "@/lib/auth/dal";
import { STUDENT_SEARCH_COLUMNS, ilikeEveryWord, searchTerm } from "@/lib/forms";
import { studentName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  await requireRole("clinic_staff");
  const sp = await searchParams;
  const q = searchTerm(param(sp, "q"));
  const year = param(sp, "year");
  const status = param(sp, "status");
  const scope = scopeParam(sp);
  const page = pageParam(sp);

  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select("id, student_number, first_name, middle_name, last_name, college, program, year_level, status, is_demo", { count: "exact" })
    .order("last_name")
    .order("first_name")
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  for (const words of ilikeEveryWord(STUDENT_SEARCH_COLUMNS, q)) query = query.or(words);
  if (year && /^[1-6]$/.test(year)) query = query.eq("year_level", Number(year));
  if (status === "active" || status === "inactive" || status === "graduated") query = query.eq("status", status);
  if (scope !== "all") query = query.eq("is_demo", scope === "demo");

  const { data: students, count, error } = await query;
  // A page number past the end: go back to the first page.
  if (pageOutOfRange(page, count, error)) redirect(hrefWith("/students", sp, { page: undefined }));
  const filtered = Boolean(q || year || status || scope !== "all");

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Students"
        description="Student profiles and health records."
        actions={
          <Button asChild>
            <Link href="/students/new">
              <UserPlus />
              Add student
            </Link>
          </Button>
        }
      />

      <FilterBar>
        <SearchInput defaultValue={param(sp, "q")} placeholder="Search student ID, name, college, or program..." />
        <FilterSelect name="year" label="Year" defaultValue={year} options={[{ value: "", label: "Any year" }, ...YEAR_OPTIONS]} className="sm:w-32" />
        <FilterSelect name="status" label="Status" defaultValue={status} options={[{ value: "", label: "Any status" }, ...STATUS_OPTIONS]} className="sm:w-36" />
        <FilterSelect name="scope" label="Records" defaultValue={scope} options={SCOPE_OPTIONS} className="sm:w-36" />
      </FilterBar>

      {error ? (
        <p className="text-sm text-destructive">Could not load students. Please reload the page.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student number</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">College / program</TableHead>
              <TableHead className="hidden sm:table-cell">Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students?.length ? (
              students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{s.student_number}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/students/${s.id}`} className="font-medium hover:underline">
                        {studentName(s)}
                      </Link>
                      {s.is_demo ? <DemoBadge /> : null}
                      <StudentStatusBadge status={s.status} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {[s.college, s.program].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="hidden tabular sm:table-cell">{s.year_level ?? "—"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmpty colSpan={4}>
                {filtered ? "No students match these filters." : "No students yet. Add the first student to get started."}
              </TableEmpty>
            )}
          </TableBody>
        </Table>
      )}

      <Pagination path="/students" sp={sp} page={page} total={count ?? 0} />
    </div>
  );
}
