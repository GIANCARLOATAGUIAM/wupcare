import { Check, Clock, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

// The hero composition: a student's appointment request as the portal shows
// it, with its status track. Fictional sample data, labeled as such.
const TRACK = [
  { label: "Request sent", meta: "Mon, 20 Oct · 8:12 AM", state: "done" },
  { label: "Approved by the clinic", meta: "Mon, 20 Oct · 10:40 AM", state: "current" },
  { label: "Visit the clinic", meta: "Thu, 23 Oct · 9:30 AM", state: "next" },
] as const;

export function HeroVisual({ className }: { className?: string }) {
  return (
    <figure className={cn("relative", className)}>
      {/* Brand-cross field behind the slip, drawn from the WUPCare mark. */}
      <svg aria-hidden="true" className="absolute inset-0 size-full rounded-2xl text-primary/[0.09]">
        <defs>
          <pattern id="wup-cross" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M12 8h4v4h4v4h-4v4h-4v-4H8v-4h4z" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wup-cross)" />
      </svg>

      <div aria-hidden="true" className="relative px-4 py-8 sm:px-10 sm:py-12">
        <div className="mx-auto max-w-sm rounded-xl border bg-card shadow-raised">
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div>
              <p className="text-xs text-muted-foreground">Student portal</p>
              <p className="text-[15px] font-semibold tracking-tight">Appointment request</p>
            </div>
            <span className="mt-0.5 inline-flex h-5 items-center rounded-4xl bg-info/12 px-2 text-xs font-medium text-info">
              Approved
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Date</dt>
              <dd className="font-medium">Thu, 23 Oct</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Time</dt>
              <dd className="font-medium tabular">9:30 AM</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Reason</dt>
              <dd className="font-medium">Follow-up consultation</dd>
            </div>
            <div className="col-span-2 rounded-md bg-muted px-3 py-2">
              <dt className="text-xs text-muted-foreground">Clinic remarks</dt>
              <dd>Please bring your student ID.</dd>
            </div>
          </dl>

          <ol className="grid gap-0 border-t px-5 py-4">
            {TRACK.map((step, i) => (
              <li key={step.label} className="relative flex gap-3 pb-3 last:pb-0">
                {i < TRACK.length - 1 ? (
                  <span
                    className={cn(
                      "absolute top-5 bottom-0 left-[9px] w-px",
                      step.state === "done" ? "bg-primary/50" : "bg-border"
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative grid size-[19px] shrink-0 place-items-center rounded-full",
                    step.state === "done" && "bg-primary text-primary-foreground",
                    step.state === "current" && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                    step.state === "next" && "border border-input bg-card text-muted-foreground"
                  )}
                >
                  {step.state === "next" ? <Clock className="size-3" /> : <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="grid leading-tight">
                  <span className={cn("text-sm", step.state === "next" ? "text-muted-foreground" : "font-medium")}>
                    {step.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular">{step.meta}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="relative mx-auto mt-4 flex w-fit max-w-sm items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-soft">
          <ShieldCheck className="size-3.5 shrink-0 text-primary" />
          Visible only to the student and clinic personnel
        </p>
      </div>

      <figcaption className="relative px-4 pb-3 text-right text-[11px] text-muted-foreground sm:px-5">
        <span className="sr-only">
          Illustration of a student&apos;s appointment request in WUPCare: approved by the clinic, with the visit
          scheduled.{" "}
        </span>
        Illustration · sample data
      </figcaption>
    </figure>
  );
}
