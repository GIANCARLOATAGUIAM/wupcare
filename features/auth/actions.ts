"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/lib/forms";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { loginSchema, type LoginFormState } from "./schema";

export async function login(
  _prev: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "");

  if (!isSupabaseConfigured()) {
    return { error: "Sign-in is not available: Supabase is not configured.", email };
  }

  const parsed = loginSchema.safeParse({
    email,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: LoginFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === "email" || field === "password") && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { fieldErrors, email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Same message for every auth failure, so the form does not reveal
    // which emails have accounts.
    return { error: "Incorrect email or password.", email };
  }

  revalidatePath("/", "layout");
  // "/" sends the user to the home page for their role.
  redirect("/");
}

export async function logout() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/login");
}

// Same sign-out as `logout`, for the confirmed Log Out dialog: a failed
// sign-out is reported instead of redirecting with the session still active.
export async function confirmedLogout(): Promise<FormState> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) return { error: "Could not log out. Check your connection and try again." };
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
