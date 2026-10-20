"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/dal";
import { dbErrorMessage, isUniqueViolation } from "@/lib/db-errors";
import { fromManilaInput } from "@/lib/format";
import { clockTime, formValues, isoDate, localDateTime, optionalText, parseForm, requiredText, uuid, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

import { detailHref, safeBackHref } from "./categories";

const ONE_PENDING = "appointments_one_pending_per_student";

const requestSchema = z.object({
  preferred_date: isoDate("date"),
  preferred_time: clockTime(),
  reason: requiredText("Reason", 2000),
});

function refresh(id?: string) {
  // The clinic sidebar shows the pending count, so refresh the layouts too.
  revalidatePath("/", "layout");
  if (id) revalidatePath(`/appointments/${id}`);
}

// ---------------------------------------------------------------- student

// FR-APT-1, spec §8.4. The database checks clinic hours, the one-pending
// limit, and that the student requests only for their own record.
export async function requestAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("student");
  const parsed = parseForm(requestSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("student_id").eq("id", user.id).maybeSingle();
  if (!profile?.student_id) {
    return { error: "Your account is not linked to a student record yet. Please visit the clinic.", values: formValues(formData) };
  }

  const { error } = await supabase.from("appointments").insert({ ...parsed.data, student_id: profile.student_id });
  if (error) {
    if (isUniqueViolation(error, ONE_PENDING)) {
      return { error: "You already have a pending request. Wait for the clinic to respond, or cancel it first.", values: formValues(formData) };
    }
    return { error: dbErrorMessage(error, "Could not send the request. Please try again."), values: formValues(formData) };
  }

  refresh();
  redirect("/portal");
}

// FR-APT-7: a student may cancel only their own pending request (RLS + trigger).
export async function cancelMyAppointment(id: string): Promise<FormState> {
  await requireRole("student");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data.length) return { error: "This request can no longer be cancelled." };
  refresh();
  return { ok: true, message: "Request cancelled." };
}

// ---------------------------------------------------------------- clinic staff

const bookSchema = z.object({
  student_id: uuid("student"),
  preferred_date: isoDate("date"),
  preferred_time: clockTime(),
  reason: requiredText("Reason", 2000),
  staff_remarks: optionalText(2000),
});

// FR-APT-2: staff book an appointment for a student (for example by phone).
// It is created as approved, scheduled at the chosen date and time.
export async function bookAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("clinic_staff");
  const parsed = parseForm(bookSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      ...parsed.data,
      status: "approved",
      scheduled_at: fromManilaInput(`${parsed.data.preferred_date}T${parsed.data.preferred_time}`),
    })
    .select("id")
    .single();
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };

  refresh();
  redirect(detailHref(data.id, "book"));
}

const scheduleSchema = z.object({ scheduled_at: localDateTime("date and time"), staff_remarks: optionalText(2000) });
const remarkRequired = z.object({ staff_remarks: requiredText("A remark for the student", 2000) });
const rescheduleSchema = z.object({ scheduled_at: localDateTime("new date and time"), staff_remarks: requiredText("A remark for the student", 2000) });
const remarkOptional = z.object({ staff_remarks: optionalText(2000) });

type Update = { status?: "approved" | "declined" | "cancelled" | "completed"; scheduled_at?: string; staff_remarks?: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// FR-APT-3..5, DFD 4.2-4.4. The database enforces the allowed status
// changes, counts reschedules, and records who handled the appointment.
// On success it reopens the detail page with the outcome (which list now
// holds the record) and the list the nurse came from (?back, validated).
export async function updateAppointmentStatus(
  id: string,
  intent: "approve" | "decline" | "reschedule" | "cancel" | "complete",
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireRole("clinic_staff");
  if (!UUID.test(id)) return { error: "Appointment not found." };

  let update: Update;
  if (intent === "approve") {
    const p = parseForm(scheduleSchema, formData);
    if (p.state) return p.state;
    update = { status: "approved", scheduled_at: fromManilaInput(p.data.scheduled_at), ...(p.data.staff_remarks ? { staff_remarks: p.data.staff_remarks } : {}) };
  } else if (intent === "decline") {
    const p = parseForm(remarkRequired, formData);
    if (p.state) return p.state;
    update = { status: "declined", staff_remarks: p.data.staff_remarks };
  } else if (intent === "reschedule") {
    const p = parseForm(rescheduleSchema, formData);
    if (p.state) return p.state;
    update = { scheduled_at: fromManilaInput(p.data.scheduled_at), staff_remarks: p.data.staff_remarks };
  } else if (intent === "cancel") {
    const p = parseForm(remarkOptional, formData);
    if (p.state) return p.state;
    update = { status: "cancelled", ...(p.data.staff_remarks ? { staff_remarks: p.data.staff_remarks } : {}) };
  } else {
    update = { status: "completed" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments").update(update).eq("id", id).select("id");
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };
  if (!data.length) return { error: "Appointment not found." };

  refresh(id);
  redirect(detailHref(id, intent, safeBackHref(formData.get("back"))));
}
