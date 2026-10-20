import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";

import { AppointmentStatusBadge, DemoBadge } from "@/components/app/badges";
import {
  FilterBar,
  FilterDate,
  FilterSelect,
  LinkTabs,
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
  type SearchParams,
} from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ilikeEveryWord, searchTerm } from "@/lib/forms";
import { addDays, formatDate, formatDateTime, formatTime, manilaDayStart, manilaToday, studentName } from "@/lib/format";
import { pageOutOfRange } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

import { APPOINTMENT_CATEGORIES, CATEGORY_KEYS, HISTORY_STATUSES, isOverdue, type AppointmentCategory } from "../categories";

const DESCRIPTIONS: Record<AppointmentCategory, string> = {
  all: "Every appointment, whatever its status. Newest requests first.",
  pending: "Requests waiting for review. Approve to confirm a schedule, or decline with a reason.",
  scheduled: "Approved appointments not yet completed, including overdue ones. Earliest first.",
  history: "Completed, declined, and cancelled appointments, with their remarks.",
};

const TAB_LABELS: Record<AppointmentCategory, string> = { all: "All", pending: "Pending", scheduled: "Scheduled", history: "History" };

const EMPTY: Record<AppointmentCategory, string> = {
  all: "No appointments match these filters.",
  pending: "No requests waiting for review.",
  scheduled: "No scheduled appointments match these filters.",
  history: "No past appointments match these filters.",
};

export const WHEN_OPTIONS = [
  { value: "", label: "All scheduled" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Overdue" },
];
type When = "today" | "upcoming" | "overdue";

export const HISTORY_OPTIONS = [
  { value: "", label: "All outcomes" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
];

// Student number and every name part; each typed word must match one of them.
const SEARCH_COLUMNS = ["student_number", "first_name", "middle_name", "last_name"];

// One list for every appointment category (Nurse sidebar: Appointment
// Management). Statuses, ordering, and RLS are the existing ones.
export async function AppointmentList({ category, sp }: { category: AppointmentCategory; sp: SearchParams }) {
  const { href: path, label: title } = APPOINTMENT_CATEGORIES[category];
  const q = searchTerm(param(sp, "q"));
  const date = dateParam(sp, "date");
  const scope = scopeParam(sp);
  const page = pageParam(sp);
  const whenValue = param(sp, "when");
  const when = category === "scheduled" && WHEN_OPTIONS.some((o) => o.value && o.value === whenValue) ? (whenValue as When) : undefined;
  const statusValue = param(sp, "status");
  const outcome = category === "history" ? HISTORY_STATUSES.find((s) => s === statusValue) : undefined;
  const now = new Date();
  const today = manilaToday();

  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select(
      "id, preferred_date, preferred_time, scheduled_at, status, reason, created_at, students!inner(id, student_number, first_name, middle_name, last_name, is_demo)",
      { count: "exact" }
    )
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (category === "pending") query = query.eq("status", "pending").order("preferred_date").order("preferred_time");
  else if (category === "scheduled") {
    // Past approved appointments stay here (as overdue) until completed or cancelled.
    query = query.eq("status", "approved");
    if (when === "today") query = query.gte("scheduled_at", manilaDayStart(today)).lt("scheduled_at", manilaDayStart(addDays(today, 1)));
    else if (when === "upcoming") query = query.gte("scheduled_at", now.toISOString());
    else if (when === "overdue") query = query.lt("scheduled_at", now.toISOString());
    query = query.order("scheduled_at");
  } else if (category === "history") {
    query = (outcome ? query.eq("status", outcome) : query.in("status", [...HISTORY_STATUSES])).order("updated_at", { ascending: false });
  } else query = query.order("created_at", { ascending: false });

  query = query.order("id");

  if (date) {
    query = query.or(
      `preferred_date.eq.${date},and(scheduled_at.gte."${manilaDayStart(date)}",scheduled_at.lt."${manilaDayStart(addDays(date, 1))}")`
    );
  }
  if (scope !== "all") query = query.eq("students.is_demo", scope === "demo");
  for (const filter of ilikeEveryWord(SEARCH_COLUMNS, q)) query = query.or(filter, { referencedTable: "students" });

  const { data: rows, count, error } = await query;
  // A page number past the end: go back to the first page.
  if (pageOutOfRange(page, count, error)) redirect(hrefWith(path, sp, { page: undefined }));

  // Rows open the detail page, which links back to this exact list (filters and page).
  const back = hrefWith(path, sp, {});
  // Category tabs keep the shared filters; category-only filters and the page reset.
  const tabHref = (key: AppointmentCategory) => hrefWith(APPOINTMENT_CATEGORIES[key].href, sp, { when: undefined, status: undefined, page: undefined });

  return (
    <div className="grid gap-5">
      <PageHeader
        title={title}
        description={DESCRIPTIONS[category]}
        actions={
          <Button asChild>
            <Link href="/appointments/new">
              <CalendarPlus />
              Book appointment
            </Link>
          </Button>
        }
      />

      <LinkTabs
        label="Appointment categories"
        active={category}
        tabs={CATEGORY_KEYS.map((key) => ({ key, label: TAB_LABELS[key], href: tabHref(key) }))}
      />

      <FilterBar>
        <SearchInput defaultValue={param(sp, "q")} placeholder="Student number or name" label="Student" />
        {category === "scheduled" ? <FilterSelect name="when" label="When" defaultValue={when ?? ""} options={WHEN_OPTIONS} /> : null}
        {category === "history" ? <FilterSelect name="status" label="Outcome" defaultValue={outcome ?? ""} options={HISTORY_OPTIONS} /> : null}
        <FilterDate name="date" label="Date" defaultValue={date} />
        <FilterSelect name="scope" label="Records" defaultValue={scope} options={SCOPE_OPTIONS} className="sm:w-36" />
      </FilterBar>

      {error ? (
        <p className="text-sm text-destructive">Could not load appointments. Please reload the page.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Preferred schedule</TableHead>
              <TableHead>Confirmed schedule</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="hidden md:table-cell">Reason</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.length ? (
              rows.map((a) => {
                const overdue = isOverdue(a, now.getTime());
                return (
                  // The whole row opens the appointment: one stretched link (a single
                  // tab stop, Enter to open, tap anywhere). No other controls in the row.
                  <TableRow key={a.id} className="relative cursor-pointer focus-within:bg-muted/40">
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/appointments/${a.id}?${new URLSearchParams({ back })}`}
                        className="font-medium outline-none after:absolute after:inset-0 after:rounded-sm after:content-[''] hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                      >
                        {formatDate(a.preferred_date)}, {formatTime(a.preferred_time)}
                        <span className="sr-only">
                          , {studentName(a.students)}, {a.status}
                          {overdue ? ", overdue" : ""}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{a.scheduled_at ? formatDateTime(a.scheduled_at) : "—"}</TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-x-1.5">
                        {studentName(a.students)}
                        {a.students.is_demo ? <DemoBadge /> : null}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">{a.students.student_number}</span>
                    </TableCell>
                    <TableCell className="hidden max-w-64 truncate md:table-cell">{a.reason}</TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <AppointmentStatusBadge status={a.status} />
                        {overdue ? <Badge className="bg-destructive/10 text-destructive">Overdue</Badge> : null}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableEmpty colSpan={5}>{EMPTY[category]}</TableEmpty>
            )}
          </TableBody>
        </Table>
      )}

      <Pagination path={path} sp={sp} page={page} total={count ?? 0} />
    </div>
  );
}
