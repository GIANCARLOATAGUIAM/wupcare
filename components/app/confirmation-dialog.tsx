"use client";

import { useRef } from "react";
import { LoaderCircle } from "lucide-react";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

import type { Confirmation } from "./confirmation";
import { FormAlert } from "./form-status";

export function ConfirmationDialog({ confirmation, pending, state, onCancel, onConfirm, returnFocusRef }: {
  confirmation: Confirmation;
  pending: boolean;
  state: FormState;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const fieldErrors = Object.values(state.fieldErrors ?? {});
  const shown = fieldErrors.length ? { error: fieldErrors.join(" ") } : state;

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <AlertDialogContent
        aria-busy={pending}
        onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
        onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocusRef.current?.isConnected && !returnFocusRef.current.disabled) {
            returnFocusRef.current.focus();
            return;
          }
          // A successful action may remove the row or leave its trigger busy.
          const main = document.getElementById("main");
          if (main) {
            const previous = main.getAttribute("tabindex");
            main.setAttribute("tabindex", "-1");
            main.focus();
            if (previous === null) main.removeAttribute("tabindex");
            else main.setAttribute("tabindex", previous);
          }
        }}
      >
        <div className="grid min-w-0 gap-2 break-words">
          <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation.message}</AlertDialogDescription>
        </div>
        <FormAlert state={shown} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel asChild>
            <Button ref={cancelRef} type="button" variant="outline" disabled={pending}>{confirmation.cancelLabel ?? "Cancel"}</Button>
          </AlertDialogCancel>
          <Button type="button" variant={confirmation.destructive ? "destructive" : "default"} disabled={pending} onClick={onConfirm}>
            {pending ? <><LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{confirmation.pendingLabel ?? "Working…"}</>: confirmation.confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
