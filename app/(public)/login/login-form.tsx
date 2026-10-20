"use client";

import { useActionState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/features/auth/actions";
import { PasswordField } from "@/features/auth/password-field";
import type { LoginFormState } from "@/features/auth/schema";

const initialState: LoginFormState = {};

export function LoginForm({ disabled = false }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="grid gap-5">
      {state.error ? (
        <Alert variant="destructive" aria-live="polite">
          <CircleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="name@example.com"
          defaultValue={state.email}
          required
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className="h-11"
        />
        {fieldErrors.email ? (
          <p id="email-error" className="text-xs text-destructive">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <PasswordField
        name="password"
        label="Password"
        autoComplete="current-password"
        disabled={disabled}
        error={fieldErrors.password}
      />

      <Button type="submit" size="lg" disabled={disabled || pending} className="mt-1 h-11 w-full text-[15px]">
        {pending ? (
          <>
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
            Logging in…
          </>
        ) : (
          "Login"
        )}
      </Button>
    </form>
  );
}
