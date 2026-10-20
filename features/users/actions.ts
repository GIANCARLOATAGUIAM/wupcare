"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/dal";
import { dbErrorMessage } from "@/lib/db-errors";
import { formValues, parseForm, requiredText, type FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const password = z
  .string()
  .min(8, { error: "Use at least 8 characters." })
  .max(72, { error: "Use 72 characters or fewer." });

const email = z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." }));

const createUserSchema = z
  .object({
    full_name: requiredText("Full name", 120),
    email,
    role: z.enum(["clinic_staff", "admin", "student"], { error: "Choose a role." }),
    student_id: z.string().optional(),
    password,
  })
  .refine((v) => v.role !== "student" || z.uuid().safeParse(v.student_id).success, {
    path: ["student_id"],
    error: "Choose the student record for this account.",
  });

// FR-USR-1, spec §8.8. The service-role key is used only here, after the
// admin check. The profile is created by the database trigger from
// app_metadata, which users can never set themselves.
export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const parsed = parseForm(createUserSchema, formData);
  if (parsed.state) return { ...parsed.state, values: { ...parsed.state.values, password: "" } };
  const { full_name, role, student_id } = parsed.data;
  const values = { ...formValues(formData), password: "" };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { wupcare_role: role, full_name, ...(role === "student" ? { student_id } : {}) },
  });

  if (error || !data.user) {
    const msg = error?.message ?? "";
    if (/already (been )?registered|already exists/i.test(msg)) {
      return { error: "Please correct the highlighted fields.", fieldErrors: { email: "An account with this email already exists." }, values };
    }
    if (/password/i.test(msg)) {
      return { error: "Please correct the highlighted fields.", fieldErrors: { password: msg }, values };
    }
    console.error("[users] createUser failed:", msg);
    return {
      error:
        role === "student"
          ? "Could not create the account. The student record may already have an account."
          : "Could not create the account. Please try again.",
      values,
    };
  }

  // Covers the split lists and detail pages (/admin/users/personnel|students/...).
  revalidatePath("/admin/users", "layout");
  redirect(`/admin/users/${data.user.id}`);
}

const updateSchema = z.object({
  full_name: requiredText("Full name", 120),
  role: z.enum(["clinic_staff", "admin"], { error: "Choose a role." }).optional(),
});

// FR-USR-3. Runs with the admin's own session, so RLS and the profile guard
// (no self-demotion, admin only) apply.
export async function updateUser(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  const parsed = parseForm(updateSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target) return { error: "User not found." };

  const change: { full_name: string; role?: "clinic_staff" | "admin" } = { full_name: parsed.data.full_name };
  // Student accounts stay students; staff and admin can switch between each other.
  if (target.role !== "student" && parsed.data.role && id !== me.id) change.role = parsed.data.role;

  const { data, error } = await supabase.from("profiles").update(change).eq("id", id).select("id");
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };
  if (!data.length) return { error: "User not found." };

  // Covers the split lists and detail pages (/admin/users/personnel|students/...).
  revalidatePath("/admin/users", "layout");
  revalidatePath(`/admin/users/${id}`);
  return { ok: true, message: "Account saved." };
}

// FR-USR-3, FR-AUTH-6. Deactivation blocks data access at once (RLS) and
// blocks sign-in (Auth ban). An admin cannot deactivate their own account.
export async function setUserActive(id: string, active: boolean): Promise<FormState> {
  const me = await requireRole("admin");
  if (id === me.id) return { error: "You cannot deactivate your own account." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data.length) return { error: "User not found." };

  const { error: banError } = await createAdminClient().auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : "876000h",
  });
  // Covers the split lists and detail pages (/admin/users/personnel|students/...).
  revalidatePath("/admin/users", "layout");
  revalidatePath(`/admin/users/${id}`);
  if (banError) {
    console.error("[users] ban update failed:", banError.message);
    return {
      error: active
        ? "Access restored, but sign-in could not be re-enabled. Try again."
        : "Access removed, but sign-in could not be blocked. Try again.",
    };
  }
  return { ok: true, message: active ? "Account reactivated." : "Account deactivated. The user can no longer sign in." };
}

const tempPasswordSchema = z.object({ password });

export async function setTemporaryPassword(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  if (id === me.id) return { error: "Change your own password on the Account page." };
  const parsed = parseForm(tempPasswordSchema, formData);
  if (parsed.state) return { ...parsed.state, values: {} };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
  if (!target) return { error: "User not found." };

  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: parsed.data.password });
  if (error) {
    console.error("[users] set password failed:", error.message);
    return { error: /password/i.test(error.message) ? error.message : "Could not set the password. Try again." };
  }
  return { ok: true, message: "Temporary password set. Share it with the user privately." };
}
