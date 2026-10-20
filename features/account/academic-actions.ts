"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/dal";
import { dbErrorMessage } from "@/lib/db-errors";
import { formValues, parseForm, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

import { safePortalNext } from "./academic";
import { academicSchema } from "./academic-schema";

// Students save ONLY their own College, Program and Year Level, through
// update_my_academic_profile (migration 0014). The function finds the record
// from the session; no record ID, Student ID or role is sent from the browser.
// Only catalog IDs are sent; the database checks the program's college.
export async function saveAcademicProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("student");
  const parsed = parseForm(academicSchema, formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_academic_profile", {
    p_college_id: parsed.data.college_id,
    p_program_id: parsed.data.program_id,
    p_year_level: Number(parsed.data.year_level),
  });
  if (error) {
    console.error("[academic] save failed:", error.code);
    return { error: dbErrorMessage(error, "Could not save your details. Please try again."), values: formValues(formData) };
  }

  revalidatePath("/portal", "layout");
  // Complete Your Profile continues to the page the student was going to.
  if (formData.get("flow") === "complete") redirect(safePortalNext(formData.get("next")));
  return { ok: true, message: "Academic details saved.", values: { college_id: parsed.data.college_id, program_id: parsed.data.program_id, year_level: parsed.data.year_level } };
}
