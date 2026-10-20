"use client";

import { useActionState, useEffect, useRef } from "react";

import { FormAlert, SubmitButton } from "@/components/app/form-status";
import { PasswordField } from "@/features/auth/password-field";
import { initialFormState } from "@/lib/forms";

import { changePassword } from "./actions";

export function PasswordForm() {
  const [state, formAction] = useActionState(changePassword, initialFormState);
  const ref = useRef<HTMLFormElement>(null);
  const e = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} noValidate className="grid max-w-sm gap-4">
      <FormAlert state={state} />
      <PasswordField name="current_password" label="Current password" autoComplete="current-password" required error={e.current_password} />
      <PasswordField
        name="new_password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        error={e.new_password}
        hint="8 to 72 characters."
      />
      <PasswordField name="confirm_password" label="Confirm new password" autoComplete="new-password" required error={e.confirm_password} />
      <div>
        <SubmitButton>Change password</SubmitButton>
      </div>
    </form>
  );
}
