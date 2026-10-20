import { z } from "zod";

import { collegeIdField, programIdField, yearLevelField } from "@/features/account/academic-schema";
import { programBelongsTo } from "@/features/academics/catalog";

// Shared by the registration form (client checks) and registerStudent
// (authoritative server checks). The database trigger in
// docs/sql/student-self-registration.draft.sql applies the same Student ID
// allowlist and a superset of these name rules, so a direct Auth signup that
// skips this app is rejected too.

// Invisible, format (bidi, zero-width, Arabic number signs, tags), separator,
// private-use, unassigned and filler characters. None belong in a name or ID.
const INVISIBLE =
  /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Zl}\p{Zp}͏ᅟᅠ឴឵᠋-᠏⠀ㅤ︀-️ﾠ\u{E0100}-\u{E01EF}]/u;

// Letters (any script) and combining accents, with single spaces, periods,
// commas, apostrophes and hyphens between them: "María José", "O'Brien",
// "Ma. Cristina", "Dela Cruz-Santos", "Jr.".
const NAME = /^[\p{L}\p{M}](?:[\p{L}\p{M}'’., -]*[\p{L}\p{M}.])?$/u;

// Canonical Student ID: trimmed, upper-case ASCII letters and digits, with
// ". / _ -" after the first character. Matches the SQL allowlist exactly.
export const STUDENT_ID_PATTERN = /^[A-Z0-9][A-Z0-9./_-]{0,39}$/;

export function canonicalStudentId(value: string) {
  return value.trim().toUpperCase();
}

const name = (label: string) =>
  z
    .string()
    .transform((v) => v.normalize("NFC").trim().replace(/ {2,}/g, " "))
    .pipe(
      z
        .string()
        .min(1, { error: `${label} is required.` })
        .max(80, { error: `${label} must be 80 characters or fewer.` })
        .refine((v) => !INVISIBLE.test(v) && NAME.test(v), {
          error: `Use letters, spaces, periods, apostrophes or hyphens in your ${label.toLowerCase()}.`,
        })
    );

export const registrationSchema = z
  .object({
    first_name: name("First name"),
    middle_name: z
      .string()
      .optional()
      .transform((v) => (v ?? "").trim())
      .pipe(z.union([z.literal(""), name("Middle name")]).transform((v) => v || null)),
    last_name: name("Last name"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, { error: "Use 254 characters or fewer." })
      .pipe(z.email({ error: "Enter a valid email address." })),
    student_number: z
      .string()
      .transform(canonicalStudentId)
      .pipe(
        z
          .string()
          .min(1, { error: "Student ID is required." })
          .max(40, { error: "Student ID must be 40 characters or fewer." })
          .refine((v) => !INVISIBLE.test(v) && STUDENT_ID_PATTERN.test(v), {
            error: "Use letters, numbers and . / _ - only, starting with a letter or number.",
          })
          .refine((v) => !v.startsWith("DEMO-"), { error: "Enter your own Student ID." })
      ),
    // Required for every new registration (client revision 2026-10-21).
    college_id: collegeIdField,
    program_id: programIdField,
    year_level: yearLevelField,
    password: z
      .string()
      .min(8, { error: "Use at least 8 characters." })
      .max(72, { error: "Use 72 characters or fewer." }),
    confirm_password: z.string(),
  })
  .refine((v) => programBelongsTo(v.program_id, v.college_id), {
    path: ["program_id"],
    error: "Choose a program from the selected college.",
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ["confirm_password"],
    error: "Passwords do not match.",
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;

// Field names in form order (first invalid field gets focus).
export const REGISTRATION_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "email",
  "student_number",
  "college_id",
  "program_id",
  "year_level",
  "password",
  "confirm_password",
] as const;
