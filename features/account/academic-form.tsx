"use client";

import { useActionState, useRef } from "react";

import { FormAlert, SubmitButton } from "@/components/app/form-status";
import { AcademicFields } from "@/features/academics/academic-fields";
import { initialFormState, parseForm, type FormState } from "@/lib/forms";

import { saveAcademicProfile } from "./academic-actions";
import { academicSchema } from "./academic-schema";

// College, Program and Year Level. "complete" continues to the page the
// student was going to; "settings" stays on Account Settings.
export function AcademicProfileForm({
  current,
  flow,
  next,
}: {
  current: { college_id: string | null; program_id: string | null; year_level: number | null; college?: string | null; program?: string | null };
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
  const defaults = {
    college_id: state.values?.college_id ?? current.college_id,
    program_id: state.values?.program_id ?? current.program_id,
    year_level: state.values?.year_level ?? current.year_level,
  };

  return (
    <form
      action={formAction}
      noValidate
      aria-busy={pending}
      className="grid min-w-0 max-w-3xl gap-4"
      onSubmit={(event) => {
        if (submitting.current || pending) event.preventDefault();
        else submitting.current = true;
      }}
    >
      <FormAlert state={state} />
      <input type="hidden" name="flow" value={flow} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <AcademicFields
        // Remount after a server response so the selections match it.
        key={`${defaults.college_id}-${defaults.program_id}-${defaults.year_level}`}
        defaults={defaults}
        errors={state.fieldErrors}
        required
        legacy={{ college: current.college, program: current.program }}
        className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]"
      />
      <div>
        <SubmitButton pendingLabel="Saving…">{flow === "complete" ? "Save and continue" : "Save details"}</SubmitButton>
      </div>
    </form>
  );
}
