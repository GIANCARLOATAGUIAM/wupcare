"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/dal";
import { dbErrorMessage } from "@/lib/db-errors";
import { studentRegistrationEnabled } from "@/lib/features";
import { formValues, parseForm, requiredText, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

import { registrationSchema } from "./schema";

// Payload version understood by private.handle_new_auth_user(). It selects a
// payload shape only; it grants nothing and is never trusted for identity.
// ("use server" modules may export only async functions.)
const REGISTRATION_VERSION = "new_student_v1";

const ID_TAKEN = "This Student ID is already registered. If it is yours, contact the clinic for help.";
const UNAVAILABLE = "Student registration is temporarily unavailable. Please try again later.";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Availability = "available" | "taken" | "invalid" | "unavailable";

// Boolean-only lookup (no record IDs, names or health data). It is a
// friendly preflight; the database unique index is the real guard. A missing
// RPC means the migration is not applied: fail closed, so the old trigger
// never turns a v1 payload into a pending account.
async function studentIdAvailability(supabase: Supabase, studentNumber: string): Promise<Availability> {
  const { data, error } = await supabase.rpc("registration_student_id_available", { p_student_number: studentNumber });
  if (error) {
    if (error.code === "22023") return "invalid";
    console.error("[register] Student ID check failed:", error.code);
    return "unavailable";
  }
  return data === true ? "available" : data === false ? "taken" : "unavailable";
}

// The account counts as ready only when the trigger linked it to its new
// student record (read through the student's own RLS-scoped profile row).
async function linkedStudentReady(supabase: Supabase, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, student_id, is_active")
    .eq("id", userId)
    .maybeSingle();
  return !error && data?.role === "student" && data.is_active === true && Boolean(data.student_id);
}

function finishSignedIn(): never {
  revalidatePath("/", "layout");
  redirect("/portal");
}

// SYSTEM_SPEC §8.10, docs/STUDENT_REGISTRATION_PLAN.md. The submitted names
// and Student ID go into user_metadata, which grants nothing: inside the Auth
// signup transaction the database creates a NEW student record, its empty
// health record and the linked Student profile, or fails the whole signup.
// An existing Student ID is rejected; it can never claim an existing record.
export async function registerStudent(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!studentRegistrationEnabled()) return { error: "Student registration is not open." };

  // Passwords are never echoed back to the browser.
  const values = { ...formValues(formData), password: "", confirm_password: "" };
  const parsed = parseForm(registrationSchema, formData);
  if (parsed.state) return { ...parsed.state, values };
  const input = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.sub) {
    return { error: "You are already signed in. Sign out before creating a new student account.", values };
  }

  const availability = await studentIdAvailability(supabase, input.student_number);
  if (availability === "invalid") {
    return { error: "Please correct the highlighted fields.", fieldErrors: { student_number: "Enter a valid Student ID." }, values };
  }
  if (availability === "taken") {
    return { error: "Please correct the highlighted fields.", fieldErrors: { student_number: ID_TAKEN }, values };
  }
  if (availability === "unavailable") return { error: UNAVAILABLE, values };

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        wupcare_registration: REGISTRATION_VERSION,
        student_number: input.student_number,
        first_name: input.first_name,
        ...(input.middle_name ? { middle_name: input.middle_name } : {}),
        last_name: input.last_name,
        // Catalog IDs, stored on the new student record by the 0014 trigger
        // (which checks that the program belongs to the college).
        college_id: input.college_id,
        program_id: input.program_id,
        year_level: input.year_level,
      },
      // Used only while Supabase "Confirm email" is still on.
      emailRedirectTo: `${origin}/auth/confirm?next=/portal`,
    },
  });

  if (error) {
    const code = error.code ?? "";
    if (code === "user_already_exists" || code === "email_exists" || /already registered|already exists/i.test(error.message)) {
      return { error: "This email cannot be used to register. If you already have an account, sign in instead.", values };
    }
    if (code === "weak_password" || /password/i.test(error.message)) {
      return { error: "Please correct the highlighted fields.", fieldErrors: { password: error.message }, values };
    }
    if (code === "signup_disabled" || /signups? not allowed|disabled/i.test(error.message)) {
      return { error: "Student registration is not open yet.", values };
    }
    if (code.startsWith("over_") || error.status === 429) {
      return { error: "Too many attempts. Please wait a few minutes and try again.", values };
    }

    console.error("[register] signUp failed:", code || error.status);
    // Supabase Auth commits the user (and, through the trigger, the student
    // record and profile) BEFORE it issues the session. If only the session
    // step failed, the account is complete: recover by signing in.
    const login = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (!login.error && login.data.user && (await linkedStudentReady(supabase, login.data.user.id))) {
      finishSignedIn();
    }
    if (!login.error) await supabase.auth.signOut();
    // Auth masks the trigger's message. A lost race for the same Student ID
    // is reported as such; nothing about the existing record is revealed.
    if ((await studentIdAvailability(supabase, input.student_number)) === "taken") {
      return { error: "Please correct the highlighted fields.", fieldErrors: { student_number: ID_TAKEN }, values };
    }
    return { error: "Could not create the account. Please try again later.", values };
  }

  if (data.session && data.user) {
    if (await linkedStudentReady(supabase, data.user.id)) finishSignedIn();
    // Signed in but not linked: the database is not running the v1 trigger.
    console.error("[register] account created without a linked student record");
    await supabase.auth.signOut();
    return {
      ok: true,
      message: "Your account was created, but the clinic still needs to finish setting it up. Sign in later to check its status.",
    };
  }

  // "Confirm email" is still on. The student record is created when the
  // address is confirmed. Same message for a reused email (no enumeration).
  return {
    ok: true,
    message: "Check your email and open the confirmation link to finish creating your account. Then sign in.",
  };
}

const approveSchema = z.object({ student_number: requiredText("Student number", 40) });

// Clinic staff link a pending self-registered account to an existing student
// record after checking the student's identity (approve_student_link).
export async function approveRegistration(profileId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("clinic_staff");
  const parsed = parseForm(approveSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("student_number", parsed.data.student_number)
    .maybeSingle();
  if (!student) {
    return { error: "No student record has this student number. Add the student first.", values: formValues(formData) };
  }

  const { error } = await supabase.rpc("approve_student_link", { p_profile_id: profileId, p_student_id: student.id });
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };

  revalidatePath("/", "layout");
  return { ok: true, message: "Account approved and linked." };
}
