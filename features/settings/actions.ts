"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/dal";
import { dbErrorMessage } from "@/lib/db-errors";
import { fieldErrors, formValues, isClockTime, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const time = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, { error: "Enter a valid time." })
  .refine((v) => isClockTime(v.slice(0, 5)), { error: "Enter a valid time." });

const clinicHoursSchema = z
  .object({
    open_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, { error: "Choose at least one open day." }),
    open_time: time,
    close_time: time,
    max_days_ahead: z.coerce
      .number({ error: "Enter a number of days." })
      .int({ error: "Enter a whole number." })
      .min(1, { error: "At least 1 day." })
      .max(365, { error: "At most 365 days." }),
  })
  .refine((v) => v.close_time.slice(0, 5) > v.open_time.slice(0, 5), {
    path: ["close_time"],
    error: "Closing time must be after opening time.",
  });

// FR-APT-8, spec §8.9. Clinic personnel only.
export async function updateClinicHours(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("clinic_staff");
  // Checkboxes repeat the same name; keep every checked day for re-rendering.
  const values = { ...formValues(formData), open_days: formData.getAll("open_days").join(",") };
  const result = clinicHoursSchema.safeParse({
    open_days: formData.getAll("open_days"),
    open_time: formData.get("open_time"),
    close_time: formData.get("close_time"),
    max_days_ahead: formData.get("max_days_ahead"),
  });
  if (!result.success) {
    return { error: "Please correct the highlighted fields.", fieldErrors: fieldErrors(result.error), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_settings")
    .update({ ...result.data, open_days: [...new Set(result.data.open_days)].sort() })
    .eq("id", 1)
    .select("id");
  if (error) return { error: dbErrorMessage(error), values };
  if (!data.length) return { error: "Clinic settings were not found.", values };

  revalidatePath("/settings/clinic-hours");
  revalidatePath("/portal/request");
  return { ok: true, message: "Clinic hours saved." };
}
