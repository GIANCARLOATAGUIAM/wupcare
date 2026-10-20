"use client";

import { useActionState } from "react";

import { TextAreaField, TextField } from "@/components/app/fields";
import { FormAlert } from "@/components/app/form-status";
import { initialFormState, type FormState } from "@/lib/forms";
import type { Tables } from "@/types/database";

import { FormActions, Section } from "./student-form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function HealthRecordForm({
  action,
  record,
  cancelHref,
}: {
  action: Action;
  record: Tables<"health_records">;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = (key: keyof Tables<"health_records">) =>
    state.values?.[key] ?? (record[key] == null ? "" : String(record[key]));

  return (
    <form action={formAction} noValidate className="grid max-w-4xl gap-6">
      <FormAlert state={state} />

      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Health information</legend>
        <TextAreaField name="allergies" label="Allergies" defaultValue={v("allergies")} error={e.allergies} />
        <TextAreaField name="existing_conditions" label="Existing conditions" defaultValue={v("existing_conditions")} error={e.existing_conditions} />
        <TextAreaField name="medical_history" label="Medical history" defaultValue={v("medical_history")} error={e.medical_history} />
        <TextAreaField name="immunizations" label="Immunizations" defaultValue={v("immunizations")} error={e.immunizations} />
        <TextAreaField name="health_notes" label="Health notes" className="md:col-span-2" defaultValue={v("health_notes")} error={e.health_notes} />
      </fieldset>

      <Section title="Emergency contact">
        <TextField name="emergency_contact_name" label="Name" maxLength={120} defaultValue={v("emergency_contact_name")} error={e.emergency_contact_name} />
        <TextField name="emergency_contact_relationship" label="Relationship" maxLength={60} defaultValue={v("emergency_contact_relationship")} error={e.emergency_contact_relationship} />
        <TextField
          name="emergency_contact_number"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          placeholder="09XXXXXXXXX"
          defaultValue={v("emergency_contact_number")}
          error={e.emergency_contact_number}
        />
      </Section>

      <FormActions cancelHref={cancelHref} submitLabel="Save health record" />
    </form>
  );
}
