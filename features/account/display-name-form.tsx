"use client";

import { useActionState, useRef } from "react";

import { TextField } from "@/components/app/fields";
import { FormAlert, SubmitButton } from "@/components/app/form-status";
import { initialFormState, parseForm, type FormState } from "@/lib/forms";

import { updateDisplayName } from "./actions";
import { displayNameSchema } from "./schema";

export function DisplayNameForm({ current }: { current: string }) {
  const submitting = useRef(false);
  const [state, formAction, pending] = useActionState(async (previous: FormState, data: FormData): Promise<FormState> => {
    try {
      const parsed = parseForm(displayNameSchema, data);
      if (parsed.state) return parsed.state;
      return await updateDisplayName(previous, data);
    } catch {
      return { error: "Could not save your display name. Try again.", values: { full_name: String(data.get("full_name") ?? "") } };
    } finally {
      submitting.current = false;
    }
  }, initialFormState);
  const value = state.values?.full_name ?? current;

  return (
    <form action={formAction} noValidate aria-busy={pending} className="grid min-w-0 max-w-sm gap-4"
      onSubmit={(event) => {
        if (submitting.current || pending) event.preventDefault();
        else submitting.current = true;
      }}>
      <FormAlert state={state} />
      <TextField
        key={value}
        name="full_name"
        label="Display name"
        required
        maxLength={120}
        autoComplete="name"
        defaultValue={value}
        error={state.fieldErrors?.full_name}
        hint="Your account display name only. Your clinic record name stays unchanged."
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save name</SubmitButton>
      </div>
    </form>
  );
}
