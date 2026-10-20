import { z } from "zod";

import { COLLEGES, PROGRAMS, programBelongsTo } from "@/features/academics/catalog";
import { YEAR_OPTIONS } from "@/features/students/schema";

// College, Program and Year Level from the official catalog. Shared by
// registration, Complete Your Profile and Account Settings (client checks)
// and their server actions (authoritative). The database checks the same
// rules again (migration 0014: catalog foreign keys, program-in-college).

export const YEAR_LEVEL_OPTIONS = YEAR_OPTIONS;
const YEAR_VALUES = ["1", "2", "3", "4", "5", "6"] as const;
const COLLEGE_IDS = COLLEGES.map((c) => c.id) as [string, ...string[]];
const PROGRAM_IDS = PROGRAMS.map((p) => p.id) as [string, ...string[]];

export const collegeIdField = z.enum(COLLEGE_IDS, { error: "Choose your college." });
export const programIdField = z.enum(PROGRAM_IDS, { error: "Choose your program." });
export const yearLevelField = z.enum(YEAR_VALUES, { error: "Choose your year level." });

// Adds the program-in-college check to any object schema with both ids.
export function withProgramInCollege<T extends z.ZodType<{ college_id: string; program_id: string }>>(schema: T) {
  return schema.refine((v) => programBelongsTo(v.program_id, v.college_id), {
    path: ["program_id"],
    error: "Choose a program from the selected college.",
  });
}

export const academicSchema = withProgramInCollege(
  z.object({ college_id: collegeIdField, program_id: programIdField, year_level: yearLevelField })
);

export type AcademicInput = z.infer<typeof academicSchema>;

export type AcademicValues = { college_id: string | null; program_id: string | null; year_level: number | null };

export function isAcademicComplete(p: AcademicValues | null | undefined) {
  return (
    Boolean(p?.college_id && p.program_id && programBelongsTo(p.program_id, p.college_id)) &&
    typeof p?.year_level === "number" &&
    p.year_level >= 1 &&
    p.year_level <= 6
  );
}
