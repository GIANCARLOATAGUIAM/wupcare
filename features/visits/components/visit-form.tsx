"use client";

import { useActionState } from "react";

import { SelectField, TextAreaField, TextField } from "@/components/app/fields";
import { FormAlert } from "@/components/app/form-status";
import { FormActions } from "@/features/students/components/student-form";
import { MedicationRows } from "@/features/medications/components/medication-rows";
import type { IssuableMedicine } from "@/features/medications/queries";
import { initialFormState, type FormState } from "@/lib/forms";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type VisitDefaults = {
  visit_at: string;
  reason?: string;
  symptoms?: string | null;
  concern_category_id?: string;
  assessment?: string | null;
  treatment?: string | null;
  follow_up_instructions?: string | null;
};

export function VisitForm({
  action,
  defaults,
  categories,
  medicines,
  hidden = {},
  cancelHref,
  submitLabel,
}: {
  action: Action;
  defaults: VisitDefaults;
  categories: { id: string; name: string }[];
  // Medication rows are shown only when creating a visit.
  medicines?: IssuableMedicine[];
  hidden?: Record<string, string>;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = (key: keyof VisitDefaults) => state.values?.[key] ?? (defaults[key] ?? "");

  return (
    <form action={formAction} noValidate className="grid max-w-4xl gap-5">
      <FormAlert state={state} />
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}

      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Consultation</legend>
        <TextField name="visit_at" label="Date and time" type="datetime-local" required defaultValue={v("visit_at")} error={e.visit_at} />
        <SelectField
          name="concern_category_id"
          label="Health concern"
          required
          defaultValue={v("concern_category_id")}
          placeholder="Choose…"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          error={e.concern_category_id}
        />
        <TextAreaField name="reason" label="Reason for visit" required rows={2} className="md:col-span-2" defaultValue={v("reason")} error={e.reason} />
        <TextAreaField name="symptoms" label="Symptoms" defaultValue={v("symptoms")} error={e.symptoms} />
        <TextAreaField name="assessment" label="Assessment" defaultValue={v("assessment")} error={e.assessment} />
        <TextAreaField name="treatment" label="Treatment" defaultValue={v("treatment")} error={e.treatment} />
        <TextAreaField name="follow_up_instructions" label="Follow-up instructions" defaultValue={v("follow_up_instructions")} error={e.follow_up_instructions} />
      </fieldset>

      {medicines ? <MedicationRows medicines={medicines} /> : null}

      <FormActions cancelHref={cancelHref} submitLabel={submitLabel} />
    </form>
  );
}
