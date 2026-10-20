"use client";

import { useActionState } from "react";

import { SelectField, TextAreaField, TextField } from "@/components/app/fields";
import { FormAlert } from "@/components/app/form-status";
import { MedicationRows } from "@/features/medications/components/medication-rows";
import type { IssuableMedicine } from "@/features/medications/queries";
import { FormActions } from "@/features/students/components/student-form";
import { initialFormState, type FormState } from "@/lib/forms";

import { INCIDENT_TYPES } from "../constants";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type IncidentDefaults = {
  occurred_at: string;
  type?: string;
  location?: string | null;
  description?: string;
  action_taken?: string;
  clinic_visit_id?: string | null;
};

export function IncidentForm({
  action,
  defaults,
  visits,
  medicines,
  hidden = {},
  cancelHref,
  submitLabel,
}: {
  action: Action;
  defaults: IncidentDefaults;
  // The student's recent visits, for the optional link.
  visits: { id: string; label: string }[];
  medicines?: IssuableMedicine[];
  hidden?: Record<string, string>;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = (k: keyof IncidentDefaults) => state.values?.[k] ?? (defaults[k] ?? "");

  return (
    <form action={formAction} noValidate className="grid max-w-4xl gap-5">
      <FormAlert state={state} />
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Incident</legend>
        <TextField name="occurred_at" label="Date and time" type="datetime-local" required defaultValue={v("occurred_at")} error={e.occurred_at} />
        <SelectField name="type" label="Type" required defaultValue={v("type")} placeholder="Choose…" options={[...INCIDENT_TYPES]} error={e.type} />
        <TextField name="location" label="Location" maxLength={200} placeholder="e.g. Gymnasium, Room 204" defaultValue={v("location")} error={e.location} />
        <SelectField
          name="clinic_visit_id"
          label="Related clinic visit"
          defaultValue={v("clinic_visit_id")}
          placeholder="None"
          options={visits.map((x) => ({ value: x.id, label: x.label }))}
          error={e.clinic_visit_id}
        />
        <TextAreaField name="description" label="What happened" required className="md:col-span-2" defaultValue={v("description")} error={e.description} />
        <TextAreaField name="action_taken" label="Action taken" required className="md:col-span-2" defaultValue={v("action_taken")} error={e.action_taken} />
      </fieldset>
      {medicines ? <MedicationRows medicines={medicines} /> : null}
      <FormActions cancelHref={cancelHref} submitLabel={submitLabel} />
    </form>
  );
}
