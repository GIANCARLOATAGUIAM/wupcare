"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Lock, Menu, X } from "lucide-react";

import { Brand, BrandMark } from "@/components/app/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { LANDING_SECTIONS } from "./sections";

// The logo links to "/", so the header omits the Home anchor (the footer keeps it).
const HEADER_SECTIONS = LANDING_SECTIONS.filter((s) => s.href !== "#top");

const SIGN_UP_UNAVAILABLE = "Student sign-up is temporarily unavailable.";

// Shared shape for the Login / Sign Up pair so both read as one set.
const AUTH_BUTTON = "h-10 rounded-lg px-4 text-sm font-medium";

// Highlights the header link for the section currently under the header.
function useActiveSection() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = HEADER_SECTIONS.map((s) => document.querySelector(s.href)).filter(
      (el): el is Element => el !== null
    );
    if (targets.length === 0) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(`#${e.target.id}`, e.isIntersecting);
        const first = HEADER_SECTIONS.find((s) => visible.get(s.href));
        setActive(first ? first.href : null);
      },
      // A band just below the 64px sticky header.
      { rootMargin: "-65px 0px -55% 0px" }
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return active;
}

// Sticky landing header. Below lg the section links and account actions
// move into a disclosure panel (not a modal) under the header bar.
export function SiteHeader({ registrationOpen }: { registrationOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const active = useActiveSection();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    // Close if the viewport grows past the breakpoint where the panel is hidden.
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => wide.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 supports-[backdrop-filter]:bg-background/90">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="WUPCare home"
          onClick={(e) => {
            setOpen(false);
            // Already on "/": a same-page link would keep the scroll position,
            // so drop any #hash and scroll to the top (smooth unless reduced
            // motion, via the html scroll-behavior rule). Modified clicks
            // (new tab, etc.) keep the default.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            if (window.location.hash) window.history.pushState(null, "", "/");
            window.scrollTo({ top: 0 });
          }}
          className="-mx-1 flex min-h-11 items-center rounded-md px-1"
        >
          {/* Official full logo where there is room; the square icon on phones. */}
          <Brand label="" preload sizes="210px" className="hidden h-11 sm:block" />
          <BrandMark className="size-10 sm:hidden" />
        </Link>

        <nav aria-label="Page sections" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {HEADER_SECTIONS.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  aria-current={active === s.href ? "location" : undefined}
                  className={cn(
                    "inline-flex h-10 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    "aria-[current=location]:font-medium aria-[current=location]:text-primary"
                  )}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-4 lg:border-l lg:pl-5">
          <SignInButton className="hidden sm:inline-flex" />
          <HeaderSignUp registrationOpen={registrationOpen} className="hidden lg:inline-flex" />
          <Button
            ref={toggleRef}
            type="button"
            variant="ghost"
            className="size-11 lg:hidden"
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </Button>
        </div>
      </div>

      <div id="landing-mobile-nav" hidden={!open} className="border-t bg-background lg:hidden">
        <nav aria-label="Page sections" className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
          <ul className="grid">
            {HEADER_SECTIONS.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  onClick={() => setOpen(false)}
                  aria-current={active === s.href ? "location" : undefined}
                  className="flex h-11 items-center rounded-md px-2 text-[15px] hover:bg-muted aria-[current=location]:font-medium aria-[current=location]:text-primary"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-2 border-t pt-4 sm:grid-cols-2">
            <SignInButton className="h-11 w-full" onNavigate={() => setOpen(false)} />
            <HeaderSignUp
              registrationOpen={registrationOpen}
              className="h-11 w-full"
              onNavigate={() => setOpen(false)}
              inlineHint
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Clinic personnel and administrator accounts are created by the clinic administrator.
          </p>
        </nav>
      </div>
    </header>
  );
}

function SignInButton({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  return (
    <Button
      asChild
      variant="outline"
      className={cn(
        AUTH_BUTTON,
        "border-primary/35 bg-card text-primary hover:border-primary/60 hover:bg-accent hover:text-primary",
        className
      )}
    >
      <Link href="/login" onClick={onNavigate}>
        Login
      </Link>
    </Button>
  );
}

// Header Sign Up. Open: a solid link to /register. Closed: the same shape in a
// muted, dashed style with a lock. It stays focusable (aria-disabled, not
// disabled) so keyboard and screen-reader users reach the explanation.
function HeaderSignUp({
  registrationOpen,
  className,
  onNavigate,
  inlineHint = false,
}: {
  registrationOpen: boolean;
  className?: string;
  onNavigate?: () => void;
  inlineHint?: boolean;
}) {
  const hintId = useId();

  if (registrationOpen) {
    return (
      <Button asChild className={cn(AUTH_BUTTON, "border-primary hover:border-primary-hover hover:bg-primary-hover", className)}>
        <Link href="/register" onClick={onNavigate}>
          Sign Up
        </Link>
      </Button>
    );
  }

  const button = (
    <Button
      type="button"
      variant="outline"
      aria-disabled="true"
      aria-describedby={hintId}
      onClick={(e) => e.preventDefault()}
      className={cn(
        AUTH_BUTTON,
        "cursor-not-allowed border-dashed border-primary/40 bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground active:translate-y-0",
        className
      )}
    >
      <Lock aria-hidden="true" className="size-3.5" />
      Sign Up
    </Button>
  );

  if (inlineHint) {
    return (
      <div className="grid gap-1.5">
        {button}
        <p id={hintId} className="text-xs text-muted-foreground">
          {SIGN_UP_UNAVAILABLE}
        </p>
      </div>
    );
  }

  // Desktop: the explanation appears on hover or keyboard focus.
  return (
    <span className={cn("group relative", className)}>
      {button}
      <span
        id={hintId}
        role="tooltip"
        className="pointer-events-none invisible absolute top-full right-0 z-50 mt-2 w-max max-w-60 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground opacity-0 shadow-popover transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 motion-reduce:transition-none"
      >
        {SIGN_UP_UNAVAILABLE}
      </span>
    </span>
  );
}
