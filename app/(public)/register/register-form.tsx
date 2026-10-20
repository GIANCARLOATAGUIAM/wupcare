"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { SelectField, TextField } from "@/components/app/fields";
import { YEAR_LEVEL_OPTIONS } from "@/features/account/academic-schema";
import { FormAlert, SubmitButton } from "@/components/app/form-status";
import { PasswordField } from "@/features/auth/password-field";
import { registerStudent } from "@/features/registration/actions";
import { REGISTRATION_FIELDS, registrationSchema } from "@/features/registration/schema";
import { fieldErrors, formValues, initialFormState } from "@/lib/forms";

export function RegisterForm() {
  const [state, formAction] = useActionState(registerStudent, initialFormState);
  // Client checks use the same schema as the server; the server re-validates.
  const [clientErrors, setClientErrors] = useState<{ errors: Record<string, string>; for: typeof state } | null>(null);
  const e = clientErrors?.for === state ? clientErrors.errors : (state.fieldErrors ?? {});
  const v = (k: string) => state.values?.[k] ?? "";

  function validate(event: React.FormEvent<HTMLFormElement>) {
    const result = registrationSchema.safeParse(formValues(new FormData(event.currentTarget)));
    if (result.success) {
      setClientErrors(null);
      return;
    }
    event.preventDefault();
    const errors = fieldErrors(result.error);
    setClientErrors({ errors, for: state });
    const first = REGISTRATION_FIELDS.find((name) => errors[name]);
    if (first) event.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  }

  if (state.ok) {
    return (
      <div className="grid gap-4">
        <FormAlert state={state} />
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Go to login
        </Link>
      </div>
    );
  }

  const shownState = clientErrors?.for === state ? { error: "Please correct the highlighted fields." } : state;

  return (
    <form action={formAction} onSubmit={validate} noValidate className="grid gap-5">
      <FormAlert state={shownState} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="first_name"
          label="First Name"
          autoComplete="given-name"
          required
          maxLength={80}
          defaultValue={v("first_name")}
          error={e.first_name}
          className="[&_input]:h-11"
        />
        <TextField
          name="last_name"
          label="Last Name"
          autoComplete="family-name"
          required
          maxLength={80}
          defaultValue={v("last_name")}
          error={e.last_name}
          className="[&_input]:h-11"
        />
      </div>
      <TextField
        name="middle_name"
        label="Middle Name (optional)"
        autoComplete="additional-name"
        maxLength={80}
        defaultValue={v("middle_name")}
        error={e.middle_name}
        className="[&_input]:h-11"
      />
      <TextField
        name="email"
        label="Email Address"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="name@example.com"
        required
        defaultValue={v("email")}
        error={e.email}
        className="[&_input]:h-11"
      />
      <TextField
        name="student_number"
        label="Student ID"
        required
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={40}
        defaultValue={v("student_number")}
        error={e.student_number}
        hint="As shown on your school ID. Each Student ID can register only once."
        className="[&_input]:h-11"
      />
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <TextField
          name="college"
          label="Department/College"
          required
          maxLength={120}
          autoComplete="organization"
          defaultValue={v("college")}
          error={e.college}
          hint="For example: College of Nursing"
          className="[&_input]:h-11"
        />
        <SelectField
          name="year_level"
          label="Year Level"
          required
          defaultValue={v("year_level")}
          placeholder="Choose"
          options={YEAR_LEVEL_OPTIONS}
          error={e.year_level}
          className="[&_select]:h-11"
        />
      </div>
      {/* Requirements mirror registrationSchema: 8 to 72 characters. */}
      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        error={e.password}
        hint="8 to 72 characters."
      />
      <PasswordField
        name="confirm_password"
        label="Confirm Password"
        autoComplete="new-password"
        required
        error={e.confirm_password}
      />
      <SubmitButton size="lg" className="mt-1 h-11 w-full text-[15px]" pendingLabel="Creating account…">
        Create Account
      </SubmitButton>
    </form>
  );
}
