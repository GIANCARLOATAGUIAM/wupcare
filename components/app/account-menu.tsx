"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The one profile trigger at the bottom of every role's sidebar. It opens a
 * small menu (upward) with My Account and Log Out. Log Out does not sign
 * out: it asks the shell to show the shared logout confirmation, which lives
 * outside this menu (and outside the mobile drawer) so nothing stacks.
 */
export function AccountMenu({
  user,
  accountHref,
  current,
  onNavigate,
  onLogout,
  triggerRef,
}: {
  user: { fullName: string; role: Role };
  accountHref: string;
  current: boolean;
  onNavigate?: () => void;
  onLogout: () => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  // Sign Out moves focus into the confirmation; the menu must not pull it back.
  const handedOff = useRef(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Account menu for ${user.fullName}, ${ROLE_LABELS[user.role]}`}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 motion-reduce:transition-none",
            // Collapsed desktop rail: avatar only (the aria-label keeps the full name).
            "rail-collapsed:justify-center rail-collapsed:px-0",
            "hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sidebar-ring",
            "data-[state=open]:bg-sidebar-accent",
            current && "bg-sidebar-accent"
          )}
        >
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user.fullName)}
          </span>
          <span className="grid min-w-0 flex-1 leading-tight rail-collapsed:hidden">
            <span className="truncate text-sm font-medium">{user.fullName}</span>
            <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground rail-collapsed:hidden" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className="w-(--radix-dropdown-menu-trigger-width) min-w-52"
        onCloseAutoFocus={(event) => {
          if (handedOff.current) {
            handedOff.current = false;
            event.preventDefault();
          }
        }}
      >
        <DropdownMenuItem asChild>
          <Link href={accountHref} aria-current={current ? "page" : undefined} onClick={onNavigate}>
            <UserRound />
            My Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            handedOff.current = true;
            onLogout();
          }}
        >
          <LogOut />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
