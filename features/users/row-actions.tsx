"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState } from "react";
import { CircleCheck, MoreHorizontal, ShieldCheck, UserCheck, UserPen, UserX } from "lucide-react";

import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import { useActionRunner } from "@/components/app/use-action-runner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { initialFormState, type FormState } from "@/lib/forms";

// Result of the last row action, announced above the table.
const StatusContext = createContext<(s: FormState | null) => void>(() => {});

export function RowActionStatus({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<FormState | null>(null);
  return (
    <StatusContext.Provider value={setStatus}>
      <div role="status" aria-live="polite" className="empty:hidden">
        {status?.message ? (
          <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/8 px-3 py-2 text-sm text-success">
            <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
            {status.message}
          </p>
        ) : null}
      </div>
      {children}
    </StatusContext.Provider>
  );
}

type Confirm = { title: string; body: string; label: string; destructive?: boolean; success?: string; run: () => Promise<FormState> };

/**
 * Three-dot menu for one account row. Uses the existing, admin-checked server
 * actions (setUserActive, updateUser) bound to this account on the server.
 * Sensitive operations ask for confirmation in an accessible alert dialog.
 */
export function RowActions({
  name,
  viewHref,
  active,
  setActive,
  makeAdmin,
}: {
  name: string;
  viewHref: string;
  active: boolean;
  setActive: () => Promise<FormState>;
  // Present only for clinic personnel rows (updateUser bound to the account).
  makeAdmin?: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const router = useRouter();
  const announce = useContext(StatusContext);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const { state, pending, run: execute, isRunning, clear } = useActionRunner();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const open = (c: Confirm) => {
    if (isRunning()) return;
    clear();
    setConfirm(c);
  };

  const run = () => {
    if (!confirm) return;
    execute(confirm.run, (result) => {
      setConfirm(null);
      announce(confirm.success ? { ok: true, message: confirm.success } : result);
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} disabled={pending} variant="ghost" size="icon" aria-label={`Actions for ${name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="max-w-56 truncate">{name}</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={viewHref}>
              <UserPen />
              View / Edit Account
            </Link>
          </DropdownMenuItem>
          {makeAdmin ? (
            <DropdownMenuItem
              onSelect={() =>
                open({
                  title: "Change role to Administrator?",
                  body: `${name}: current role is Clinic Personnel; new role is Administrator. Access permissions will change to user management and aggregate reports. Clinic personnel access will be removed.`,
                  label: "Make Administrator",
                  success: `${name} is now an administrator.`,
                  run: () => {
                    const fd = new FormData();
                    fd.set("full_name", name);
                    fd.set("role", "admin");
                    return makeAdmin(initialFormState, fd);
                  },
                })
              }
            >
              <ShieldCheck />
              Change Role to Administrator
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={active ? "destructive" : "default"}
            onSelect={() =>
              open(
                active
                  ? {
                      title: "Deactivate Account?",
                      body: `${name} will no longer be able to access WUPCare until their account is reactivated. Records they created are kept.`,
                      label: "Deactivate Account",
                      destructive: true,
                      run: setActive,
                    }
                  : { title: "Reactivate Account?", body: `${name} will be able to sign in and use their existing role again.`, label: "Reactivate Account", run: setActive }
              )
            }
          >
            {active ? <UserX /> : <UserCheck />}
            {active ? "Deactivate Account" : "Reactivate Account"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {confirm ? <ConfirmationDialog
        confirmation={{ title: confirm.title, message: confirm.body, confirmLabel: confirm.label, destructive: confirm.destructive, cancelLabel: confirm.destructive ? "Keep Account" : "Cancel" }}
        state={state} pending={pending} returnFocusRef={triggerRef}
        onCancel={() => { if (!isRunning()) setConfirm(null); }} onConfirm={run}
      /> : null}
    </>
  );
}
