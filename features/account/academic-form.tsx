"use client";

import { useActionState, useRef } from "react";

import { SelectField, TextField } from "@/components/app/fields";
import { FormAlert, SubmitButton } from "@/components/app/form-status";
import { initialFormState, parseForm, type FormState } from "@/lib/forms";

import { saveAcademicProfile } from "./academic-actions";
import { YEAR_LEVEL_OPTIONS, academicSchema } from "./academic-schema";

// Department/College and Year Level. "complete" continues to the page the
// student was going to; "settings" stays on Account Settings.
export function AcademicProfileForm({
  current,
  flow,
  next,
}: {
  current: { college: string | null; year_level: number | null };
  flow: "complete" | "settings";
  next?: string;
}) {
  const submitting = useRef(false);
  const [state, formAction, pending] = useActionState(async (previous: FormState, data: FormData): Promise<FormState> => {
    try {
      // Same schema as the server, which validates again.
      const parsed = parseForm(academicSchema, data);
      if (parsed.state) return parsed.state;
      return await saveAcademicProfile(previous, data);
    } finally {
      submitting.current = false;
    }
  }, initialFormState);
  const e = state.fieldErrors ?? {};
  const college = state.values?.college ?? current.college ?? "";
  const year = state.values?.year_level ?? (current.year_level ? String(current.year_level) : "");

  return (
    <form
      action={formAction}
      noValidate
      aria-busy={pending}
      className="grid min-w-0 max-w-xl gap-4"
      onSubmit={(event) => {
        if (submitting.current || pending) event.preventDefault();
        else submitting.current = true;
      }}
    >
      <FormAlert state={state} />
      <input type="hidden" name="flow" value={flow} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <TextField
          key={`college-${college}`}
          name="college"
          label="Department/College"
          required
          maxLength={120}
          autoComplete="organization"
          defaultValue={college}
          error={e.college}
          hint="For example: College of Nursing"
        />
        <SelectField
          key={`year-${year}`}
          name="year_level"
          label="Year Level"
          required
          defaultValue={year}
          placeholder="Choose"
          options={YEAR_LEVEL_OPTIONS}
          error={e.year_level}
        />
      </div>
      <div>
        <SubmitButton pendingLabel="Saving…">{flow === "complete" ? "Save and continue" : "Save details"}</SubmitButton>
      </div>
    </form>
  );
}
