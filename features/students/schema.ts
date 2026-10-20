import { z } from "zod";

import { optionalText, phMobile, requiredText } from "@/lib/forms";
import { manilaToday } from "@/lib/format";

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.email({ error: "Enter a valid email address." }).nullable());

// SYSTEM_SPEC §7 and §9.3.
export const studentSchema = z.object({
  student_number: requiredText("Student number", 40),
  first_name: requiredText("First name", 80),
  middle_name: optionalText(80),
  last_name: requiredText("Last name", 80),
  sex: z
    .enum(["", "male", "female"], { error: "Choose male or female." })
    .optional()
    .transform((v) => (v ? v : null)),
  birth_date: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    // A real calendar date (2001-02-30 fails here, not in the database).
    .refine((v) => v === null || (z.iso.date().safeParse(v).success && v >= "1900-01-01" && v < manilaToday()), {
      error: "Enter a birth date in the past.",
    }),
  college: optionalText(120),
  program: optionalText(120),
  year_level: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1).max(6, { error: "Year level is 1 to 6." }).nullable()),
  contact_number: phMobile,
  email: optionalEmail,
  address: optionalText(300),
  guardian_name: optionalText(120),
  guardian_relationship: optionalText(60),
  guardian_contact: phMobile,
  status: z.enum(["active", "inactive", "graduated"], { error: "Choose a status." }),
});

export const healthRecordSchema = z.object({
  medical_history: optionalText(2000),
  allergies: optionalText(2000),
  existing_conditions: optionalText(2000),
  immunizations: optionalText(2000),
  health_notes: optionalText(2000),
  emergency_contact_name: optionalText(120),
  emergency_contact_relationship: optionalText(60),
  emergency_contact_number: phMobile,
});

export const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "graduated", label: "Graduated" },
];

export const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6].map((y) => ({ value: String(y), label: `Year ${y}` }));
