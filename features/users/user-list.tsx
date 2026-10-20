import { collectRows } from "@/lib/collect-rows";
import { redirect } from "next/navigation";
import { displayName } from "@/lib/auth/display-name";
import { pageOutOfRange, pageRange } from "@/lib/pagination";
import Link from "next/link";
import { UserPlus } from "lucide-react";

import { Pagination, hrefWith, pageParam, TableEmpty, param, type SearchParams } from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setUserActive, updateUser } from "@/features/users/actions";
import { ilikeAny, searchTerm } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

import { AutoListFilters } from "./auto-list-filters";
import { RowActionStatus, RowActions } from "./row-actions";

export type UserKind = "personnel" | "students";

// `roles` is what each list shows. Detail pages for administrator accounts
// still live under /admin/users/personnel/[id] (see kindForRole).
export const USER_KIND = {
  personnel: { path: "/admin/users/personnel", title: "Clinic Personnel", roles: ["clinic_staff"] as const },
  students: { path: "/admin/users/students", title: "Student Accounts", roles: ["student"] as const },
} as const;

// Filters a detail page's back link may restore (?return=...).
export function listReturnQuery(sp: SearchParams) {
  const raw = param(sp, "return");
  if (!raw) return "";
  const keep = new URLSearchParams();
  const parsed = new URLSearchParams(raw);
  for (const k of ["q", "status", "page"]) {
    const v = parsed.get(k);
    if (v) keep.set(k, v.slice(0, 60));
  }
  const qs = keep.toString();
  return qs ? `?${qs}` : "";
}

// Account lists for administrators. Login accounts only: name, email, student
// number, and status. No health records or clinical data. Reads and actions
// use the admin's own session and the existing admin-checked server actions.
export async function UserList({ kind, sp, meId }: { kind: UserKind; sp: SearchParams; meId: string }) {
  const page = pageParam(sp);
  const cfg = USER_KIND[kind];
  const isStudents = kind === "students";
  const qRaw = param(sp, "q") ?? "";
  const q = searchTerm(qRaw);
  const statusParam = param(sp, "status");
  const status = statusParam === "active" || statusParam === "inactive" ? statusParam : "";

  const supabase = await createClient();
  const { data: numbers, error: numberError } = isStudents ? await collectRows((from, to) => supabase.rpc("account_student_numbers").order("profile_id").range(from, to)) : { data: [], error: null };
  const numberFor = new Map((numbers ?? []).map((n) => [n.profile_id, n.student_number]));

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, student_id, requested_student_number", { count: "exact" })
    .in("role", [...cfg.roles])
    .order("full_name")
    .order("id")
    .range(...pageRange(page));
  if (q) {
    let filter = ilikeAny(isStudents ? ["full_name", "email", "requested_student_number"] : ["full_name", "email"], q);
    if (isStudents) {
      // Linked accounts: match the student number of the linked record.
      const ids = (numbers ?? []).filter((n) => n.student_number.toLowerCase().includes(q.toLowerCase())).map((n) => n.profile_id);
      if (ids.length) filter += `,id.in.(${ids.join(",")})`;
    }
    query = query.or(filter);
  }
  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);
  const result = await query;
  const { data: users, count } = result;
  const error = result.error || numberError;
  if (pageOutOfRange(page, count, error)) redirect(hrefWith(cfg.path, sp, { page: undefined }));

  // Row links remember the filters so "Back" restores them.
  const back = new URLSearchParams();
  if (q) back.set("q", q);
  if (status) back.set("status", status);
  if (page > 1) back.set("page", String(page));
  const returnParam = back.toString() ? `?return=${encodeURIComponent(back.toString())}` : "";

  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        title={cfg.title}
        description={isStudents ? "Student login accounts. Health records are managed by clinic personnel." : "Clinic personnel accounts."}
        actions={
          <Button asChild>
            <Link href={`${cfg.path}/new`}>
              <UserPlus />
              {isStudents ? "Add Student Account" : "Add Account"}
            </Link>
          </Button>
        }
      />

      <RowActionStatus>
        <AutoListFilters initial={{ q: qRaw, status }} searchPlaceholder={isStudents ? "Name, email, or student number" : "Name or email"}>
          {error ? (
            <p className="text-sm text-destructive">Could not load accounts. Please reload the page.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  {isStudents ? <TableHead>Student number</TableHead> : null}
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only sm:not-sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.length ? (
                  users.map((u) => {
                    const number = numberFor.get(u.id);
                    const href = `${cfg.path}/${u.id}${returnParam}`;
                    const self = u.id === meId;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="min-w-0">
                          <Link href={href} className="font-medium hover:underline">
                            {displayName(u.full_name, u.role)}
                          </Link>
                          {self ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                          <span className="block truncate text-xs text-muted-foreground sm:hidden">{u.email}</span>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{u.email}</TableCell>
                        {isStudents ? (
                          <TableCell>
                            {number ? (
                              <span className="font-mono text-xs">{number}</span>
                            ) : (
                              <span className="grid gap-0.5">
                                <Badge className="bg-warning/25 text-warning-foreground">Pending approval</Badge>
                                {u.requested_student_number ? (
                                  <span className="font-mono text-xs text-muted-foreground">Entered: {u.requested_student_number}</span>
                                ) : null}
                              </span>
                            )}
                          </TableCell>
                        ) : null}
                        <TableCell>
                          {u.is_active ? <Badge className="bg-success/12 text-success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          {self ? null : (
                            <RowActions
                              name={displayName(u.full_name, u.role)}
                              viewHref={href}
                              active={u.is_active}
                              setActive={setUserActive.bind(null, u.id, !u.is_active)}
                              makeAdmin={!isStudents && u.role === "clinic_staff" ? updateUser.bind(null, u.id) : undefined}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableEmpty colSpan={isStudents ? 5 : 4}>{q || status ? "No accounts match these filters." : "No accounts yet."}</TableEmpty>
                )}
              </TableBody>
            </Table>
          )}
          {!error ? <Pagination path={cfg.path} sp={sp} page={page} total={count ?? 0} /> : null}
        </AutoListFilters>
      </RowActionStatus>
    </div>
  );
}
