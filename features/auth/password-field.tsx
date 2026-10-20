"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Password input with an eye button on the right that toggles visibility.
 * Hidden by default. The button is type="button" so it never submits, and the
 * input keeps the same size in both states (fixed right padding; the icon
 * swap happens inside a fixed 44px button), so toggling causes no layout shift.
 *
 * `toggleLabel` names what is revealed: "password" gives "Show password" /
 * "Hide password". A second field on the same form (Confirm Password) passes
 * its own noun so screen-reader users can tell the two buttons apart.
 */
export function PasswordInput({
  id,
  toggleLabel = "password",
  className,
  disabled,
  ...props
}: { id: string; toggleLabel?: string } & Omit<React.ComponentProps<"input">, "type" | "id">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn("h-11 pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={`${visible ? "Hide" : "Show"} ${toggleLabel}`}
        aria-pressed={visible}
        aria-controls={id}
        disabled={disabled}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground transition-colors outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
      >
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

// Labeled PasswordInput with the same label / error / hint wiring as
// TextField (components/app/fields.tsx), so server-side validation messages
// stay attached via aria-describedby.
export function PasswordField({
  name,
  label,
  error,
  hint,
  required,
  className,
  ...props
}: {
  name: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<"input">, "name" | "type" | "id">) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={name}>
        {label}
        {required ? <span className="text-destructive" aria-hidden="true">*</span> : null}
      </Label>
      <PasswordInput
        id={name}
        name={name}
        toggleLabel={label.toLowerCase()}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
