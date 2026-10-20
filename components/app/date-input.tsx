"use client";

import { useRef, useState } from "react";
import { CalendarClock, CalendarDays, Clock, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DateInputType = "date" | "datetime-local" | "time";

const ICONS = { date: CalendarDays, "datetime-local": CalendarClock, time: Clock } as const;

// Sets an uncontrolled input's value the way typing would, so React onChange
// (and the automatic filter bar) see the change.
export function setNativeValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * The one date/time control used across WUPCare. It keeps the browser's native
 * date, date-time, and time pickers (the appointment form's calendar). Those
 * give month/year navigation, keyboard entry, min/max, and a popup the browser
 * keeps on screen. Values stay plain "YYYY-MM-DD" / local strings, so no
 * timezone conversion happens here; Manila handling stays on the server.
 * Adds: a consistent leading icon, click-anywhere to open, and a Clear button
 * for optional fields.
 */
export function DateInput({
  type = "date",
  clearable = false,
  clearLabel = "Clear date",
  className,
  defaultValue,
  onInput,
  onClick,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { type?: DateInputType; clearable?: boolean; clearLabel?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const initial = String(defaultValue ?? props.value ?? "");
  const [hasValue, setHasValue] = useState(Boolean(initial));
  // Follow a new server-rendered default (for example after a URL change).
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    setHasValue(Boolean(initial));
  }
  const Icon = ICONS[type];
  const showClear = clearable && hasValue && !props.disabled && !props.readOnly;

  return (
    // min-w-0: native date inputs have a wide intrinsic size that would push
    // a grid/flex cell past narrow (360px) screens.
    <div className="relative min-w-0">
      <Icon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        type={type}
        defaultValue={defaultValue}
        className={cn(
          "relative pl-8 tabular",
          // The native indicator stays clickable, invisibly covering the icon.
          "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-y-0 [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-8 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
          showClear && "pr-8",
          className
        )}
        onInput={(event) => {
          setHasValue(Boolean(event.currentTarget.value) || event.currentTarget.validity.badInput);
          onInput?.(event);
        }}
        onClick={(event) => {
          onClick?.(event);
          const input = event.currentTarget;
          if (event.defaultPrevented || input.disabled || input.readOnly) return;
          try {
            input.showPicker?.();
          } catch {
            // Not allowed here (for example inside a cross-origin frame): typing still works.
          }
        }}
        {...props}
      />
      {showClear ? (
        <button
          type="button"
          aria-label={clearLabel}
          className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 pointer-coarse:size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => {
            const input = ref.current;
            if (!input) return;
            setNativeValue(input, "");
            setHasValue(false);
            input.focus();
          }}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
