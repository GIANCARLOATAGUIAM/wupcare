"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { displayNameSchema } from "./schema";

import { getAuthState, requireRole } from "@/lib/auth/dal";
import { dbErrorMessage } from "@/lib/db-errors";
import { parseForm, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    current_password: z.string().min(1, { error: "Enter your current password." }),
    new_password: z.string().min(8, { error: "Use at least 8 characters." }).max(72, { error: "Use 72 characters or fewer." }),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, { path: ["confirm_password"], error: "Passwords do not match." })
  .refine((v) => v.new_password !== v.current_password, { path: ["new_password"], error: "Choose a new password." });

// FR-AUTH-7: any active user changes their own password. The current
// password is checked first.
export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const state = await getAuthState();
  if (state.status !== "ok") return { error: "Please sign in again." };

  const parsed = parseForm(schema, formData);
  if (parsed.state) return { ...parsed.state, values: {} };

  const supabase = await createClient();
  const { error: checkError } = await supabase.auth.signInWithPassword({
    email: state.user.email,
    password: parsed.data.current_password,
  });
  if (checkError) {
    return { error: "Please correct the highlighted fields.", fieldErrors: { current_password: "Current password is incorrect." } };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.new_password });
  if (error) {
    console.error("[account] password change failed:", error.message);
    return { error: /password/i.test(error.message) ? error.message : "Could not change the password. Try again." };
  }
  return { ok: true, message: "Password changed." };
}

// Account name only. Never accept a target ID or write Auth/student records.
// Non-admins use the scoped RPC proposed in docs/sql/update-own-display-name.sql
// (requires approval before installation); existing RLS stays unchanged.
export async function updateDisplayName(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("admin", "clinic_staff", "student");
  const parsed = parseForm(displayNameSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const values = { full_name: parsed.data.full_name };
  if (me.role === "admin") {
    const { data, error } = await supabase.from("profiles").update(values).eq("id", me.id).select("id");
    if (error) return { error: dbErrorMessage(error), values };
    if (!data?.length) return { error: "Could not update your display name. Try again.", values };
  } else {
    const { error } = await supabase.rpc("update_own_display_name", { p_full_name: parsed.data.full_name });
    if (error) return {
      error: error.code === "PGRST202"
        ? "Display-name editing is awaiting a database update. Please contact your administrator."
        : dbErrorMessage(error),
      values,
    };
  }

  // The sidebar profile card is rendered by the layout.
  revalidatePath("/", "layout");
  return { ok: true, message: "Display name saved.", values: { full_name: parsed.data.full_name } };
}
