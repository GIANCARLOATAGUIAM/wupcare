import { ledgerTotal } from "@/features/medications/ledger-total";
import { redirect } from "next/navigation";
import { PAGE_SIZE, pageOutOfRange, pageRange } from "@/lib/pagination";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { ActionForm } from "@/components/app/action-form";
import { DemoBadge, StockFlags, stockState } from "@/components/app/badges";
import { DetailItem, TextAreaField, TextField } from "@/components/app/fields";
import { Pagination, pageParam, hrefWith, TableEmpty, param } from "@/components/app/list-controls";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adjustMedicine, issueMedicine, restockMedicine, setMedicineActive } from "@/features/medications/actions";
import { expirySoonDate } from "@/features/medications/queries";
import { requireRole } from "@/lib/auth/dal";
import { formatDate, formatDateTime, manilaToday, studentName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Medicine" };

const TYPE_LABEL = { issuance: "Issued", restock: "Restock", adjustment: "Adjustment" } as const;

type Txn = {
  id: string;
  type: keyof typeof TYPE_LABEL;
  quantity: number;
  notes: string | null;
  created_at: string;
  performer: string | null;
  student?: { id: string; student_number: string; first_name: string; middle_name: string | null; last_name: string } | null;
  clinic_visit_id?: string | null;
  incident_id?: string | null;
};

// One medicine. Client revision 2026-10-21:
//   Administrator    edit, restock, adjust, deactivate; stock history without
//                    student identity (medicine_stock_history, migration 0013)
//   Clinic personnel issue to a student; full ledger with student, visit and
//                    incident links. No catalog or stock changes.
// The server actions and the database enforce the same split.
export default async function MedicinePage({ params, searchParams }: PageProps<"/medications/[id]">) {
  const user = await requireRole("admin", "clinic_staff");
  const isAdmin = user.role === "admin";
  const { id } = await params;
  const sp = await searchParams;
  const page = pageParam(sp);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: m } = await supabase.from("medicines").select("*, updater:profiles!medicines_updated_by_fkey(full_name)").eq("id", id).maybeSingle();
  if (!m) notFound();

  let txns: Txn[] = [];
  let count: number | null = null;
  let failed = false;
  let total: number | null = null;
  if (isAdmin) {
    const { data, error } = await supabase.rpc("medicine_stock_history", { p_medicine_id: id, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
    failed = Boolean(error);
    txns = (data ?? []).map((t) => ({ id: t.id, type: t.type, quantity: t.quantity, notes: t.notes, created_at: t.created_at, performer: t.performed_by }));
    count = data?.length ? data[0].total_count : page > 1 ? null : 0;
    total = data?.length ? data[0].ledger_total : null;
    if (!failed && page > 1 && !data?.length) redirect(hrefWith("/medications/" + id, sp, { page: undefined }));
  } else {
    const { data, count: c, error } = await supabase
      .from("medication_transactions")
      .select(
        "id, type, quantity, notes, created_at, clinic_visit_id, incident_id, performer:profiles!medication_transactions_performed_by_fkey(full_name), student:students(id, student_number, first_name, middle_name, last_name)",
        { count: "exact" }
      )
      .eq("medicine_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .range(...pageRange(page));
    if (pageOutOfRange(page, c, error)) redirect(hrefWith("/medications/" + id, sp, { page: undefined }));
    failed = Boolean(error);
    count = c;
    txns = (data ?? []).map((t) => ({ ...t, performer: t.performer?.full_name ?? null }));
    total = await ledgerTotal(supabase, id);
  }
  const state = stockState(m, manilaToday(), expirySoonDate());

  return (
    <div className="grid gap-5">
      <PageHeader
        title={m.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {m.is_demo ? <DemoBadge /> : null}
            <StockFlags state={state} inactive={!m.is_active} />
          </span>
        }
        actions={
          isAdmin ? (
            <Button variant="outline" asChild>
              <Link href={`/medications/${id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          ) : null
        }
      />

      {isAdmin && param(sp, "notice") === "restock-failed" ? (
        <Alert variant="destructive">
          <AlertDescription>
            The medicine was added, but its starting stock was not recorded, so stock is 0. Use Restock below to add it. The quantity is filled in.
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-4 rounded-lg border bg-card p-4 grid-cols-2 sm:grid-cols-4">
        <DetailItem label="Stock">
          <span className="text-lg font-semibold tabular">{m.stock_quantity}</span> {m.unit}
        </DetailItem>
        <DetailItem label="Reorder level">{`${m.reorder_level} ${m.unit}`}</DetailItem>
        <DetailItem label="Expires">{formatDate(m.expiration_date)}</DetailItem>
        <DetailItem label="Status">{m.is_active ? "Active" : "Inactive"}</DetailItem>
      </dl>

      {isAdmin ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Restock">
            <ActionForm action={restockMedicine.bind(null, id)} submitLabel="Add stock" variant="outline">
              <TextField
                id="restock-quantity"
                name="quantity"
                label={`Quantity received (${m.unit})`}
                type="number"
                min={1}
                required
                defaultValue={/^\d+$/.test(param(sp, "qty") ?? "") ? param(sp, "qty") : undefined}
              />
              <TextField id="restock-notes" name="notes" label="Notes (optional)" maxLength={500} placeholder="Supplier, delivery reference" />
            </ActionForm>
          </Panel>
          <Panel title="Adjust stock">
            <ActionForm action={adjustMedicine.bind(null, id)} submitLabel="Save adjustment" variant="outline" confirm={{ title: "Adjust Medicine Stock?", message: "This changes the stock balance and adds a permanent transaction with your reason. Check the quantity and sign before continuing.", confirmLabel: "Save Adjustment", cancelLabel: "Keep Stock" }}>
              <TextField id="adjust-quantity" name="quantity" label="Change (use − to remove)" type="number" required placeholder="-2" />
              <TextAreaField id="adjust-reason" name="reason" label="Reason" required rows={2} placeholder="Damaged, count correction, disposal of expired stock" />
            </ActionForm>
          </Panel>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Issue to a student">
            {m.is_active && !state.expired && m.stock_quantity > 0 ? (
              <ActionForm action={issueMedicine.bind(null, id)} submitLabel="Issue">
                <TextField id="issue-student_number" name="student_number" label="Student number" required />
                <TextField id="issue-quantity" name="quantity" label={`Quantity (${m.unit})`} type="number" min={1} max={m.stock_quantity} required defaultValue="1" />
                <TextField id="issue-notes" name="notes" label="Notes (optional)" maxLength={500} />
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">
                {!m.is_active ? "Inactive medicines cannot be issued." : state.expired ? "Expired medicine cannot be issued." : "Out of stock."}
              </p>
            )}
          </Panel>
          <p className="self-start text-xs text-muted-foreground lg:pt-4">
            Medicine can also be issued while recording a clinic visit or health incident. Restocking, stock adjustments and medicine details are
            managed by the administrator.
          </p>
        </div>
      )}

      <section className="grid gap-2">
        <h2 className="text-sm font-medium">{isAdmin ? "Stock history" : "Transaction history"}</h2>
        {failed ? (
          <p className="text-sm text-destructive">
            {isAdmin ? "Could not load stock history. It needs database update 0013." : "Could not load transaction history. Please reload the page."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="hidden md:table-cell">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.length ? (
                txns.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(t.created_at)}</TableCell>
                    <TableCell>{TYPE_LABEL[t.type]}</TableCell>
                    <TableCell className="text-right tabular">{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</TableCell>
                    <TableCell className="max-w-80">
                      {t.student ? (
                        <Link href={`/students/${t.student.id}`} className="hover:underline">
                          {studentName(t.student)}
                        </Link>
                      ) : null}
                      {t.clinic_visit_id ? (
                        <Link href={`/visits/${t.clinic_visit_id}`} className="ml-2 text-xs text-primary hover:underline">
                          visit
                        </Link>
                      ) : null}
                      {t.incident_id ? (
                        <Link href={`/incidents/${t.incident_id}`} className="ml-2 text-xs text-primary hover:underline">
                          incident
                        </Link>
                      ) : null}
                      {isAdmin && t.type === "issuance" ? <span className="text-muted-foreground">Issued to a student</span> : null}
                      {t.notes ? <span className="block truncate text-xs text-muted-foreground">{t.notes}</span> : null}
                      <span className="block text-xs text-muted-foreground md:hidden">{t.performer}</span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{t.performer}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmpty colSpan={5}>No transactions yet.</TableEmpty>
              )}
            </TableBody>
          </Table>
        )}
        {!failed ? <Pagination path={"/medications/" + id} sp={sp} page={page} total={count ?? 0} /> : null}
        {total !== null && total !== m.stock_quantity ? (
          <p className="text-xs text-destructive">
            Ledger total ({total}) does not match stock ({m.stock_quantity}). {isAdmin ? "Review the stock history." : "Report this to the administrator."}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        {isAdmin ? (
          <ActionForm
            action={setMedicineActive.bind(null, id, !m.is_active)}
            submitLabel={m.is_active ? "Deactivate medicine" : "Reactivate medicine"}
            variant={m.is_active ? "destructive" : "outline"}
            confirm={m.is_active ? { title: "Deactivate Medicine?", message: "This medicine can no longer be issued until reactivated. Its stock and transaction history are kept.", confirmLabel: "Deactivate Medicine", cancelLabel: "Keep Active", destructive: true } : undefined}
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {m.updater ? `Last edited by ${m.updater.full_name}, ${formatDateTime(m.updated_at)}. ` : ""}Medicines are never deleted.
        </p>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}
