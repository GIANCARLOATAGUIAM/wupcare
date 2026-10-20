"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

import { confirmationFor, type Confirmation, type ConfirmationRule } from "./confirmation";
import { ConfirmationDialog } from "./confirmation-dialog";
import { FormAlert } from "./form-status";
import { useActionRunner } from "./use-action-runner";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

// Typed values stay in the form on errors. Confirmation snapshots the submitted
// values; Cancel does not dispatch anything. Ordinary actions still submit once.
export function ActionForm({ action, submitLabel, pendingLabel = "Saving…", variant = "default", confirm, className, children }: {
  action: Action;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  confirm?: ConfirmationRule;
  className?: string;
  children?: React.ReactNode;
}) {
  const { state, pending, run, isRunning, clear } = useActionRunner();
  const [request, setRequest] = useState<{ confirmation: Confirmation; data: FormData } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fieldErrors = Object.values(state.fieldErrors ?? {});
  const shown = fieldErrors.length ? { error: fieldErrors.join(" ") } : state;
  const submit = (data: FormData) => run(() => action(state, data), () => {
    setRequest(null);
    formRef.current?.reset();
  });

  return (
    <form ref={formRef} noValidate className={cn("grid gap-3", className)} onSubmit={(event) => {
      event.preventDefault();
      if (isRunning() || request) return;
      const data = new FormData(event.currentTarget);
      const confirmation = confirmationFor(confirm, data);
      if (confirmation) { clear(); setRequest({ confirmation, data }); }
      else submit(data);
    }}>
      <FormAlert state={shown} />
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      <div><Button ref={triggerRef} type="submit" variant={variant} disabled={pending}>{pending ? pendingLabel : submitLabel}</Button></div>
      {request ? <ConfirmationDialog
        confirmation={request.confirmation} pending={pending} state={state} returnFocusRef={triggerRef}
        onCancel={() => { if (!isRunning()) setRequest(null); }}
        onConfirm={() => submit(request.data)}
      /> : null}
    </form>
  );
}
