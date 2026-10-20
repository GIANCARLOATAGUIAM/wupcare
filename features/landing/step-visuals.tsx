import { ArrowRight, Check, Clock, LayoutDashboard, Stethoscope } from "lucide-react";

import { cn } from "@/lib/utils";

// Decorative mini UIs for the "How it works" step cards. Fictional sample
// content only; the card hides the visual from screen readers.

const PANEL = "w-full max-w-[14rem] rounded-lg border bg-card shadow-soft";

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="flex h-7 items-center gap-2 rounded-[5px] border bg-background px-2 text-[10px]">
      <span className="shrink-0 text-[9px] text-muted-foreground">{label}</span>
      <span className={cn("ml-auto truncate", mono && "tracking-[0.2em]")}>{value}</span>
    </span>
  );
}

// 1. One auth card for both paths: Sign Up / Login tabs (Login shown), then the portal it opens.
export function AuthStepVisual() {
  return (
    <div className={cn(PANEL, "overflow-hidden")}>
      <div className="grid grid-cols-2 border-b text-center text-[10px] font-medium">
        <span className="py-2 text-muted-foreground">Sign Up</span>
        <span className="relative py-2 text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary">
          Login
        </span>
      </div>
      <div className="grid gap-1.5 p-3">
        <Field label="Email" value="student@example.edu" />
        <Field label="Password" value="••••••••" mono />
        <span className="mt-0.5 flex h-7 items-center justify-center gap-1 rounded-[5px] bg-primary text-[10px] font-medium text-primary-foreground">
          Login
          <ArrowRight className="size-3" />
        </span>
      </div>
      <div className="flex items-center gap-2 border-t bg-accent/60 px-3 py-2">
        <LayoutDashboard className="size-3.5 shrink-0 text-primary" />
        <span className="grid leading-tight">
          <span className="text-[10px] font-medium">Student portal</span>
          <span className="text-[9px] text-muted-foreground">My appointments</span>
        </span>
      </div>
    </div>
  );
}

// 2. Booking: a short date row and time slots within clinic hours.
const DATES = [21, 22, 23, 24];
const SLOTS = ["8:30", "9:30", "10:30"];

export function RequestStepVisual() {
  return (
    <div className={cn(PANEL, "grid gap-2.5 p-3")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">Request appointment</span>
        <span className="text-[9px] text-muted-foreground">Oct</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {DATES.map((d) => (
          <span
            key={d}
            className={cn(
              "grid h-7 place-items-center rounded-[5px] border text-[10px] font-semibold tabular",
              d === 23 ? "border-primary bg-primary text-primary-foreground" : "bg-background"
            )}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {SLOTS.map((s) => (
          <span
            key={s}
            className={cn(
              "grid h-6 place-items-center rounded-full border text-[9px] font-medium tabular",
              s === "9:30" ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"
            )}
          >
            {s} AM
          </span>
        ))}
      </div>
      <span className="text-[9px] text-muted-foreground">Within clinic hours</span>
    </div>
  );
}

// 3. Status track ending at the clinic visit.
const TRACK = [
  { label: "Requested", state: "done" },
  { label: "Approved", state: "done" },
  { label: "Clinic visit · 9:30 AM", state: "next" },
] as const;

export function TrackStepVisual() {
  return (
    <div className={cn(PANEL, "grid gap-2 p-3")}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">Thu, 23 Oct</span>
        <span className="inline-flex h-4 items-center rounded-full bg-info/12 px-1.5 text-[9px] font-medium text-info">
          Approved
        </span>
      </div>
      <ol className="grid">
        {TRACK.map((s, i) => (
          <li key={s.label} className="relative flex items-center gap-2 pb-2 last:pb-0">
            {i < TRACK.length - 1 ? (
              <span className="absolute top-4 bottom-0 left-[7px] w-px bg-primary/40" />
            ) : null}
            <span
              className={cn(
                "relative grid size-[15px] shrink-0 place-items-center rounded-full",
                s.state === "done" ? "bg-primary text-primary-foreground" : "border border-input bg-card text-primary"
              )}
            >
              {s.state === "done" ? <Check className="size-2.5" strokeWidth={3.5} /> : <Clock className="size-2.5" />}
            </span>
            <span className={cn("text-[10px]", s.state === "done" ? "font-medium" : "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      <span className="flex items-center gap-1.5 rounded-[5px] bg-accent px-2 py-1 text-[9px] text-accent-foreground">
        <Stethoscope className="size-3" />
        WUP campus clinic
      </span>
    </div>
  );
}
