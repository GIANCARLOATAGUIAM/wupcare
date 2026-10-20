import { z } from "zod";

import { YEAR_OPTIONS } from "@/features/students/schema";

// Department/College and Year Level (client revision 2026-10-21). Shared by
// registration, Complete Your Profile and Account Settings (client checks)
// and their server actions (authoritative). The database function
// private.clean_college applies the same rules.
//
// The official college list is not confirmed yet (SYSTEM_SPEC Q-D1), so the
// college is checked text. Year level uses the existing 1-6 list.

// Control, format, private-use, unassigned and separator characters, plus
// markup delimiters. None belong in a college name.
const INVALID = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Zl}\p{Zp}<>{}]/u;

export const YEAR_LEVEL_OPTIONS = YEAR_OPTIONS;
const YEAR_VALUES = ["1", "2", "3", "4", "5", "6"] as const;

export const collegeField = z
  .string({ error: "Department/College is required." })
  .transform((v) => v.normalize("NFC").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, { error: "Department/College is required." })
      .min(2, { error: "Enter at least 2 characters." })
      .max(120, { error: "Use 120 characters or fewer." })
      .refine((v) => !INVALID.test(v) && /\p{L}/u.test(v), { error: "Enter a valid department or college name." })
  );

export const yearLevelField = z.enum(YEAR_VALUES, { error: "Choose your year level." });

export const academicSchema = z.object({ college: collegeField, year_level: yearLevelField });

export type AcademicInput = z.infer<typeof academicSchema>;

export function isAcademicComplete(p: { college: string | null; year_level: number | null } | null | undefined) {
  return Boolean(p?.college?.trim()) && typeof p?.year_level === "number" && p.year_level >= 1 && p.year_level <= 6;
}
