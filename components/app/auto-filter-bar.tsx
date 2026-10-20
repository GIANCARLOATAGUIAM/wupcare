"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export const FILTER_DEBOUNCE_MS = 300;

type Field = HTMLInputElement | HTMLSelectElement;

// Builds the list URL from the form's named fields. Empty values are dropped
// and ?page is never carried, so every filter change starts at page one.
export function filterQuery(entries: Iterable<[string, FormDataEntryValue]>) {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (typeof value === "string" && value.trim()) params.set(key, value.trim());
  }
  return params.toString();
}

export function sameQuery(a: string, b: string) {
  const sorted = (qs: string) => { const p = new URLSearchParams(qs); p.sort(); return p.toString(); };
  return sorted(a) === sorted(b);
}

// Text-like inputs wait for a pause; selects and dates apply at once. A date
// applies only when complete and valid (a partly typed date reads as "" with
// badInput set) or when cleared.
export function filterTiming(field: Pick<Field, "tagName" | "type" | "validity">): "debounce" | "now" | "skip" {
  if (field.tagName === "SELECT") return "now";
  if (field.type === "date") return field.validity.badInput || !field.validity.valid ? "skip" : "now";
  if (field.type === "hidden" || field.type === "submit") return "skip";
  return "debounce";
}

/**
 * Filter form without an Apply button, for the clinic personnel lists. Fields
 * stay uncontrolled (server-rendered defaultValue). Each change replaces the
 * URL, so filters stay shareable and server-side pagination is unchanged.
 * URL changes made elsewhere (tabs, back button) are copied back into
 * fields the user is not editing.
 */
export function AutoFilterBar({ children, className, label = "Filters" }: { children: React.ReactNode; className?: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.toString();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const element of Array.from(form.elements)) {
      if (element === document.activeElement) continue;
      if (element instanceof HTMLInputElement && element.type !== "hidden" && element.value !== element.defaultValue) {
        element.value = element.defaultValue;
      } else if (element instanceof HTMLSelectElement) {
        const selected = Array.from(element.options).find((option) => option.defaultSelected) ?? element.options[0];
        if (selected && !selected.selected) selected.selected = true;
      }
    }
  }, [current]);

  function apply() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const form = formRef.current;
    if (!form) return;
    const qs = filterQuery(new FormData(form).entries());
    // Same filters as the current URL (ignoring ?page and order): no request.
    const now = new URLSearchParams(current);
    now.delete("page");
    if (sameQuery(qs, filterQuery(now.entries()))) return;
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function onChange(event: React.FormEvent<HTMLFormElement>) {
    const field = event.target as Field;
    if (field.tagName !== "INPUT" && field.tagName !== "SELECT") return;
    const timing = filterTiming(field);
    if (timing === "skip") return;
    if (timing === "now") return apply();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(apply, FILTER_DEBOUNCE_MS);
  }

  return (
    <form
      ref={formRef}
      role="search"
      aria-label={label}
      data-filter-pending={pending ? "" : undefined}
      className={cn("flex flex-wrap items-end gap-3 print:hidden", className)}
      onChange={onChange}
      onSubmit={(event) => { event.preventDefault(); apply(); }}
    >
      {children}
      {/* Always reserve a separate row: loading cannot resize or overlap controls. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="flex h-5 w-full shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {pending ? (
          <>
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Updating…
          </>
        ) : null}
      </p>
    </form>
  );
}
