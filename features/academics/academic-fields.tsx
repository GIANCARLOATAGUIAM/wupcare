"use client";

import { useState } from "react";

import { SelectField } from "@/components/app/fields";
import { YEAR_OPTIONS } from "@/features/students/schema";

import { COLLEGES, collegeLabel, programBelongsTo, programLabel, programsForCollege } from "./catalog";

const COLLEGE_OPTIONS = COLLEGES.map((c) => ({ value: c.id, label: collegeLabel(c) }));

export type AcademicSelection = { college: string; program: string };

// Initial selection: a saved program is kept only if it belongs to the
// saved college.
export function initialSelection(collegeId?: string | null, programId?: string | null): AcademicSelection {
  return {
    college: collegeId ?? "",
    program: collegeId && programId && programBelongsTo(programId, collegeId) ? programId : "",
  };
}

// Choosing a college always clears the program (the old one belongs to the
// previous college, or must be chosen again).
export function selectCollege(_prev: AcademicSelection, collegeId: string): AcademicSelection {
  return { college: collegeId, program: "" };
}

export function selectProgram(prev: AcademicSelection, programId: string): AcademicSelection {
  return { ...prev, program: programId && programBelongsTo(programId, prev.college) ? programId : "" };
}

// College → Program → Year Level, the one academic picker used everywhere.
// Program lists only the selected college's programs and is cleared when the
// college changes. Field names: college_id, program_id, year_level.
// `legacy` shows a free-text value from before the catalog, so staff can see
// it while choosing the matching catalog entry; it is never auto-selected.
export function AcademicFields({
  defaults,
  errors = {},
  required = false,
  legacy,
  className,
}: {
  defaults: { college_id?: string | null; program_id?: string | null; year_level?: string | number | null };
  errors?: Record<string, string | undefined>;
  required?: boolean;
  legacy?: { college?: string | null; program?: string | null };
  className?: string;
}) {
  const [{ college, program }, setSelection] = useState(() => initialSelection(defaults.college_id, defaults.program_id));
  const programs = programsForCollege(college);
  const legacyText = [legacy?.college, legacy?.program].filter(Boolean).join(" · ");

  return (
    <div className={className ?? "grid gap-4 sm:grid-cols-2"}>
      <SelectField
        name="college_id"
        label="College / Department"
        required={required}
        value={college}
        onChange={(event) => {
          const value = event.target.value;
          setSelection((prev) => selectCollege(prev, value));
        }}
        placeholder={required ? "Choose a college" : "Not specified"}
        options={COLLEGE_OPTIONS}
        error={errors.college_id}
        hint={legacyText && !defaults.college_id ? `Previously entered: ${legacyText}. Choose the matching college.` : undefined}
      />
      <SelectField
        name="program_id"
        label="Program / Course"
        required={required}
        value={program}
        onChange={(event) => {
          const value = event.target.value;
          setSelection((prev) => selectProgram(prev, value));
        }}
        disabled={!college}
        placeholder={college ? "Choose a program" : "Choose a college first"}
        options={programs.map((p) => ({ value: p.id, label: programLabel(p) }))}
        error={errors.program_id}
      />
      <SelectField
        name="year_level"
        label="Year Level"
        required={required}
        defaultValue={defaults.year_level == null ? "" : String(defaults.year_level)}
        placeholder={required ? "Choose" : "Not specified"}
        options={YEAR_OPTIONS}
        error={errors.year_level}
      />
    </div>
  );
}
