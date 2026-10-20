"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/dal";
import { dbErrorMessage } from "@/lib/db-errors";
import { formValues, isoDate, optionalText, parseForm, positiveInt, requiredText, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const medicineSchema = z.object({
  name: requiredText("Medicine name", 120),
  unit: requiredText("Unit", 40),
  reorder_level: z.coerce
    .number({ error: "Enter a number." })
    .int({ error: "Enter a whole number." })
    .min(0, { error: "Cannot be negative." })
    .max(100000),
  expiration_date: isoDate("expiration date"),
});

const newMedicineSchema = medicineSchema.extend({
  starting_stock: z.coerce
    .number({ error: "Enter a number." })
    .int({ error: "Enter a whole number." })
    .min(0, { error: "Cannot be negative." })
    .max(100000),
});

// Another medicine with this name (any letter case) and expiry, among records
// of the same kind (real or demo). `exceptId` skips the medicine being edited.
async function findDuplicate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  medicine: { name: string; expiration_date: string },
  isDemo: boolean,
  exceptId?: string
) {
  let query = supabase
    .from("medicines")
    .select("id")
    .ilike("name", medicine.name.replace(/[%_\\]/g, (c) => `\\${c}`))
    .eq("expiration_date", medicine.expiration_date)
    .eq("is_demo", isDemo);
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query.limit(1).maybeSingle();
  return !!data;
}

function refresh(id?: string) {
  revalidatePath("/medications");
  if (id) revalidatePath(`/medications/${id}`);
  // Both dashboards show stock alerts.
  revalidatePath("/dashboard");
}

// Client revision 2026-10-21: Administrators manage the inventory (add, edit,
// deactivate, restock, adjust); clinic personnel only issue medicine. Each
// action checks the role here, and migration 0013 enforces the same split in
// RLS and the stock functions.

// FR-MED-1, DFD 5.1. New medicines start at 0; the starting stock is saved
// as a restock transaction so stock always equals the ledger.
export async function createMedicine(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const parsed = parseForm(newMedicineSchema, formData);
  if (parsed.state) return parsed.state;
  const { starting_stock, ...medicine } = parsed.data;

  const supabase = await createClient();

  // Same medicine, same expiry already in the inventory: add stock to that row
  // instead of creating a duplicate (FR-MED-9).
  if (await findDuplicate(supabase, medicine, false)) {
    return {
      error: "This medicine with the same expiration date is already in the inventory. Open it and use Restock instead.",
      fieldErrors: { name: "Already in the inventory with this expiration date." },
      values: formValues(formData),
    };
  }

  const { data, error } = await supabase.from("medicines").insert(medicine).select("id").single();
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };

  if (starting_stock > 0) {
    const { error: restockError } = await supabase.rpc("restock_medication", {
      p_medicine_id: data.id,
      p_quantity: starting_stock,
      p_notes: "Starting stock",
    });
    if (restockError) {
      // The medicine exists with 0 stock and an empty ledger, so inventory
      // stays consistent. Its page asks the user to finish the restock, with
      // the quantity already filled in.
      console.error("[medicines] starting stock failed", restockError.message);
      refresh(data.id);
      redirect(`/medications/${data.id}?notice=restock-failed&qty=${starting_stock}`);
    }
  }

  refresh(data.id);
  redirect(`/medications/${data.id}`);
}

export async function updateMedicine(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const parsed = parseForm(medicineSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const { data: current } = await supabase.from("medicines").select("is_demo").eq("id", id).maybeSingle();
  if (!current) return { error: "Medicine not found." };
  // Renaming or re-dating must not create a second copy of another medicine.
  if (await findDuplicate(supabase, parsed.data, current.is_demo, id)) {
    return {
      error: "Another medicine with this name and expiration date is already in the inventory.",
      fieldErrors: { name: "Already in the inventory with this expiration date." },
      values: formValues(formData),
    };
  }

  const { data, error } = await supabase.from("medicines").update(parsed.data).eq("id", id).select("id");
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };
  if (!data.length) return { error: "Medicine not found." };

  refresh(id);
  redirect(`/medications/${id}`);
}

// FR-MED-7: medicines are deactivated, never deleted.
export async function setMedicineActive(id: string, active: boolean): Promise<FormState> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("medicines").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data.length) return { error: "Medicine not found." };
  refresh(id);
  return { ok: true, message: active ? "Medicine reactivated." : "Medicine deactivated. It can no longer be issued." };
}

const restockSchema = z.object({ quantity: positiveInt("Quantity"), notes: optionalText(500) });

// DFD 5.2
export async function restockMedicine(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const parsed = parseForm(restockSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restock_medication", {
    p_medicine_id: id,
    p_quantity: parsed.data.quantity,
    p_notes: parsed.data.notes ?? undefined,
  });
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };
  refresh(id);
  return { ok: true, message: `Restocked. Stock is now ${data}.` };
}

const adjustSchema = z.object({
  quantity: z.coerce
    .number({ error: "Enter a number." })
    .int({ error: "Enter a whole number." })
    .min(-100000)
    .max(100000)
    .refine((n) => n !== 0, { error: "Adjustment cannot be zero." }),
  reason: requiredText("Reason", 500),
});

// FR-MED-4: correction with a required reason. Negative removes stock.
export async function adjustMedicine(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const parsed = parseForm(adjustSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_medication", {
    p_medicine_id: id,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };
  refresh(id);
  return { ok: true, message: `Adjusted. Stock is now ${data}.` };
}

const issueSchema = z.object({
  student_number: requiredText("Student number", 40),
  quantity: positiveInt("Quantity"),
  notes: optionalText(500),
});

// DFD 5.3-5.4: standalone issuance to a student from the medicine page.
export async function issueMedicine(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("clinic_staff");
  const parsed = parseForm(issueSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .eq("student_number", parsed.data.student_number)
    .maybeSingle();
  if (!student) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { student_number: "No student has this student number." },
      values: formValues(formData),
    };
  }

  const { error } = await supabase.rpc("issue_medication", {
    p_medicine_id: id,
    p_student_id: student.id,
    p_quantity: parsed.data.quantity,
    p_notes: parsed.data.notes ?? undefined,
  });
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };

  refresh(id);
  revalidatePath(`/students/${student.id}`);
  return { ok: true, message: `Issued ${parsed.data.quantity} to ${student.first_name} ${student.last_name}.` };
}
