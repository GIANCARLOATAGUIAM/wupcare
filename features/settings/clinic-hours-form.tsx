"use client";

import { useActionState } from "react";

import { TextField } from "@/components/app/fields";
import { FormAlert, SubmitButton } from "@/components/app/form-status";
import { initialFormState } from "@/lib/forms";

import { updateClinicHours } from "./actions";

const DAYS = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [7, "Sunday"],
] as const;

export function ClinicHoursForm({
  settings,
}: {
  settings: { open_days: number[]; open_time: string; close_time: string; max_days_ahead: number };
}) {
  const [state, formAction] = useActionState(updateClinicHours, initialFormState);
  const e = state.fieldErrors ?? {};
  // After a failed save, show what was submitted instead of the saved values.
  const sent = state.ok ? undefined : state.values;
  const days = sent ? sent.open_days.split(",").filter(Boolean).map(Number) : settings.open_days;

  return (
    <form action={formAction} noValidate className="@container grid min-w-0 gap-6">
      <FormAlert state={state} />
      <fieldset className="grid gap-2" aria-describedby={e.open_days ? "open_days-error" : undefined}>
        <legend className="mb-1 text-sm font-medium">Open days</legend>
        <div className="grid grid-cols-2 gap-2 @sm:grid-cols-3 @4xl:grid-cols-7">
          {DAYS.map(([n, label]) => (
            <label
              key={n}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-card px-2.5 text-sm transition-colors hover:bg-muted/50 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="checkbox"
                name="open_days"
                value={n}
                defaultChecked={days.includes(n)}
                className="size-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
        {e.open_days ? (
          <p id="open_days-error" className="text-xs text-destructive">
            {e.open_days}
          </p>
        ) : null}
      </fieldset>
      <div className="grid gap-4 @xl:grid-cols-3">
        <TextField name="open_time" label="Opens at" type="time" required defaultValue={sent?.open_time ?? settings.open_time.slice(0, 5)} error={e.open_time} />
        <TextField name="close_time" label="Closes at" type="time" required defaultValue={sent?.close_time ?? settings.close_time.slice(0, 5)} error={e.close_time} />
        <TextField
          name="max_days_ahead"
          label="Book up to (days ahead)"
          type="number"
          min={1}
          max={365}
          required
          defaultValue={sent?.max_days_ahead ?? settings.max_days_ahead}
          error={e.max_days_ahead}
        />
      </div>
      <div>
        <SubmitButton>Save clinic hours</SubmitButton>
      </div>
    </form>
  );
}
