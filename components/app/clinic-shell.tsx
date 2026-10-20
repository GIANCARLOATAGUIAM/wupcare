"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

import { AccountMenu } from "./account-menu";
import { Brand, BrandMark } from "./brand";
import { LogoutButton } from "./logout-button";
import { accountHrefForRole, navForRole, type NavItem } from "./nav";
import { setSidebarCollapsed, sidebarServerSnapshot, sidebarSnapshot, subscribeSidebar } from "./sidebar-preference";

type ShellUser = { fullName: string; email: string; role: Role };
type ShellCounts = { pendingAppointments?: number };

export function ClinicShell({
  user,
  counts = {},
  children,
}: {
  user: ShellUser;
  counts?: ShellCounts;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Sign Out (account menu) shows the one shared confirmation here, outside
  // the menu and the mobile drawer, so nothing stacks. Focus then returns to
  // the desktop profile trigger or, on mobile, the menu button.
  const [loggingOut, setLoggingOut] = useState<"desktop" | "mobile" | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLButtonElement>(null);
  // Desktop collapse preference. Styling follows html[data-sidebar] via CSS
  // (no flash); React only needs it for the toggle label and tooltips.
  const collapsed = useSyncExternalStore(subscribeSidebar, sidebarSnapshot, sidebarServerSnapshot);

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to main content
        </a>
        {/* Right corners rounded (12px). No overflow-hidden: menus, tooltips, and
          dialogs are portaled, and the toggle sits on the edge. */}
        <aside
          id="app-sidebar"
          data-desktop-sidebar
          className="sticky top-0 z-20 hidden h-dvh w-60 shrink-0 rounded-r-xl border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex md:flex-col print:hidden rail-collapsed:w-16"
        >
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-controls="app-sidebar"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute top-5 -right-3 z-10 grid size-6 place-items-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <PanelLeftClose className="size-3.5 rail-collapsed:hidden" aria-hidden="true" />
            <PanelLeftOpen className="hidden size-3.5 rail-collapsed:block" aria-hidden="true" />
          </button>
          <SidebarContents user={user} counts={counts} onLogout={() => setLoggingOut("desktop")} profileRef={profileRef} tooltips={collapsed} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-2 backdrop-blur-sm md:hidden print:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button ref={menuRef} variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-64 gap-0 rounded-r-xl bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SheetDescription className="sr-only">
                  WUPCare main menu
                </SheetDescription>
                <SidebarContents
                  user={user}
                  counts={counts}
                  onNavigate={() => setOpen(false)}
                  onLogout={() => {
                    setOpen(false);
                    setLoggingOut("mobile");
                  }}
                />
              </SheetContent>
            </Sheet>
            <Brand className="h-9 self-center" />
          </header>
          {loggingOut ? (
            <LogoutButton
              dialogOnly={{ onClose: () => setLoggingOut(null), returnFocusRef: loggingOut === "mobile" ? menuRef : profileRef }}
            />
          ) : null}

          {children}
        </div>
      </div>
    </TooltipProvider>
  );
}

function SidebarContents({
  user,
  counts,
  onNavigate,
  onLogout,
  profileRef,
  tooltips = false,
}: {
  user: ShellUser;
  counts: ShellCounts;
  onNavigate?: () => void;
  onLogout: () => void;
  profileRef?: React.Ref<HTMLButtonElement>;
  // Collapsed desktop rail only: show each item's name on hover/focus.
  tooltips?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sections = navForRole(user.role);
  const accountHref = accountHrefForRole(user.role);
  const items = sections.flatMap((s) => s.items);
  // Collapsible sections the user has closed (this sidebar instance only).
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSection = (label: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(label)) next.add(label);
      return next;
    });

  // Admin report links keep month/year/scope, including legacy date bookmarks.
  const reportQuery = (() => {
    if (!pathname.startsWith("/reports/")) return "";
    const keep = new URLSearchParams();
    for (const k of ["month", "year", "scope", "from", "to"]) {
      const v = searchParams.get(k);
      if (v) keep.set(k, v);
    }
    const qs = keep.toString();
    return qs ? `?${qs}` : "";
  })();

  // An appointment opened from a list highlights that list (?back is set by
  // the list rows and validated again on the server).
  const back = searchParams.get("back")?.split("?")[0];
  const current = /^\/appointments\/[0-9a-f-]{36}$/i.test(pathname) && back && items.some((o) => o.href === back) ? back : pathname;

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    // A more specific item (Students > Registrations) takes the highlight.
    const active =
      current === item.href ||
      (!item.exact &&
        current.startsWith(`${item.href}/`) &&
        !items.some((o) => o.href !== item.href && o.href.startsWith(`${item.href}/`) && current.startsWith(o.href)));

    const count = item.countKey ? counts[item.countKey] : undefined;

    const link = (
      <Link
        href={item.keepReportFilters ? `${item.href}${reportQuery}` : item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-150",
          "rail-collapsed:justify-center rail-collapsed:px-0",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sidebar-ring",
          active &&
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground forced-colors:underline forced-colors:outline forced-colors:outline-1 forced-colors:outline-[Highlight]"
        )}
      >
        <Icon
          className={cn("size-4 shrink-0", active && "text-sidebar-primary")}
        />
        {/* Visually hidden when collapsed; it stays the link's accessible name. */}
        <span className="truncate rail-collapsed:sr-only">{item.label}</span>
        {count ? (
          <span className="ml-auto rounded-full bg-warning/30 px-1.5 text-[11px] font-medium tabular text-warning-foreground rail-collapsed:absolute rail-collapsed:top-0.5 rail-collapsed:right-1.5 rail-collapsed:size-2 rail-collapsed:bg-warning rail-collapsed:p-0 rail-collapsed:text-[0px]">
            <span className="sr-only">, </span>
            {count}
            <span className="sr-only"> waiting</span>
          </span>
        ) : null}
      </Link>
    );

    return (
      <li key={item.href}>
        {tooltips ? (
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ) : (
          link
        )}
      </li>
    );
  };

  return (
    <>
      {/* 64px brand row: ~14px above and below the 36px logo, vertically centered.
          The collapse toggle (top-5, on the aside edge) centers on this row. */}
      <div className="flex h-16 shrink-0 items-center px-5 rail-collapsed:justify-center rail-collapsed:px-0">
        <Brand className="h-9 self-center rail-collapsed:hidden" />
        {/* Icon-only logo for the collapsed desktop rail (original asset). */}
        <BrandMark className="hidden size-8 rail-collapsed:inline-block" label="WUPCare" />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-2">
        {sections.length === 1 && !sections[0].label ? (
          <ul className="grid gap-0.5">{sections[0].items.map(renderItem)}</ul>
        ) : (
          <div className="grid gap-4">
            {sections.map((section, i) => {
              const id = section.label ? `nav-${section.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined;
              const open = !(section.collapsible && section.label && closed.has(section.label));
              return (
                <div key={section.label ?? i} className={cn("grid gap-1", i > 0 && "rail-collapsed:border-t rail-collapsed:border-sidebar-border rail-collapsed:pt-3")}>
                  {section.collapsible && section.label ? (
                    // The collapsed rail hides this toggle and always shows the icons.
                    <button
                      type="button"
                      onClick={() => toggleSection(section.label!)}
                      aria-expanded={open}
                      aria-controls={`${id}-items`}
                      className="flex w-full items-center justify-between gap-2 rounded-sm px-2.5 pt-1 text-left text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sidebar-ring rail-collapsed:hidden pointer-coarse:min-h-8"
                    >
                      <span id={id} className="min-w-0 truncate whitespace-nowrap">{section.label}</span>
                      <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none", !open && "-rotate-90")} aria-hidden="true" />
                    </button>
                  ) : section.label ? (
                    <p id={id} className="px-2.5 pt-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase rail-collapsed:sr-only">
                      {section.label}
                    </p>
                  ) : null}
                  <ul id={id ? `${id}-items` : undefined} aria-labelledby={id} className={cn("grid gap-0.5", !open && "hidden rail-collapsed:grid")}>
                    {section.items.map(renderItem)}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        {/* Every role: one profile trigger with My Account and Log Out. */}
        <AccountMenu
          user={user}
          accountHref={accountHref}
          current={pathname === accountHref}
          onNavigate={onNavigate}
          onLogout={onLogout}
          triggerRef={profileRef}
        />
      </div>
    </>
  );
}

