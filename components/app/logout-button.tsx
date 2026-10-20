"use client";

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirmedLogout } from "@/features/auth/actions";

import type { Confirmation } from "./confirmation";
import { ConfirmationDialog } from "./confirmation-dialog";
import { useActionRunner } from "./use-action-runner";

export const LOGOUT_CONFIRMATION: Confirmation = {
  title: "Log out of WUPCare?",
  message: "You'll need to log in again to access your account.",
  confirmLabel: "Log Out",
  pendingLabel: "Logging out…",
};

// Shared Sign out for every role's sidebar. Sign-out itself stays in the
// server action; a successful sign-out redirects, which the runner rethrows
// to Next.js.
// - Default: a trigger that opens its own confirmation.
// - dialogOnly: the confirmation alone, already open. The shell renders this
//   when Sign Out is chosen in the account menu (desktop and mobile drawer).
export function LogoutButton({ className, size, label = "Log out", dialogOnly }: {
  className?: string;
  size?: "default" | "sm";
  label?: string;
  dialogOnly?: { onClose: () => void; returnFocusRef: React.RefObject<HTMLButtonElement | null> };
}) {
  const { state, pending, run, isRunning, clear } = useActionRunner();
  const [open, setOpen] = useState(Boolean(dialogOnly));
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Stays set once the redirect is in progress, so the dialog cannot re-submit.
  const leavingRef = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const busy = pending || leaving;

  return (
    <>
      {dialogOnly ? null : (
        <Button ref={triggerRef} type="button" variant="ghost" size={size} className={className}
          disabled={busy} onClick={() => {
            if (isRunning() || leavingRef.current) return;
            clear();
            setOpen(true);
          }}>
          <LogOut className="size-4" />
          {label}
        </Button>
      )}
      {open ? <ConfirmationDialog
        confirmation={LOGOUT_CONFIRMATION} pending={busy} state={state} returnFocusRef={dialogOnly?.returnFocusRef ?? triggerRef}
        onCancel={() => { if (!isRunning() && !leavingRef.current) { setOpen(false); dialogOnly?.onClose(); } }}
        onConfirm={() => {
          if (leavingRef.current) return;
          run(async () => {
            try { return await confirmedLogout(); }
            catch (error) { leavingRef.current = true; setLeaving(true); throw error; }
          });
        }}
      /> : null}
    </>
  );
}
