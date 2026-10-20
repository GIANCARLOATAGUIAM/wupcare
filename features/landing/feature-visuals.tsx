import { Check, ChevronLeft, ChevronRight, Pill, ShieldAlert, Stethoscope, TrendingUp, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

// Decorative mini UIs for the landing Features cards. Each mirrors a real
// WUPCare screen with fictional sample data. Hidden from screen readers by the
// card (aria-hidden on the visual area); nothing here is interactive.

const PANEL =
  "w-full max-w-[16.5rem] rounded-lg border bg-card shadow-panel";

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-3 py-[7px] text-[11px]", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function Pillbox({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 text-[10px] font-medium", className)}>
      {children}
    </span>
  );
}

// 1. Student health profile.
export function HealthRecordVisual() {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-primary">
          <UserRound className="size-4" />
        </span>
        <span className="grid min-w-0 leading-tight">
          <span className="truncate text-xs font-semibold">Sample Student</span>
          <span className="text-[10px] text-muted-foreground tabular">DEMO-0007 · BS Nursing</span>
        </span>
        <Pillbox className="ml-auto bg-success/12 text-success">
          <span className="size-1.5 rounded-full bg-success" />
          Updated
        </Pillbox>
      </div>
      <div className="divide-y">
        <Row label="Blood type" value="O+" />
        <Row label="Allergies" value="None recorded" />
        <Row label="Emergency contact" value="On file" />
      </div>
    </div>
  );
}

// 2. Scheduling: a week strip with the selected date and an approved slot.
const DAYS = [
  ["M", 20],
  ["T", 21],
  ["W", 22],
  ["T", 23],
  ["F", 24],
] as const;

export function AppointmentVisual() {
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">October</span>
        <span className="flex gap-1 text-muted-foreground">
          <ChevronLeft className="size-3.5" />
          <ChevronRight className="size-3.5" />
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1 px-3 pt-2.5 pb-2 text-center">
        {DAYS.map(([d, n]) => (
          <span
            key={n}
            className={cn(
              "grid gap-0.5 rounded-md py-1 text-[10px] leading-none",
              n === 23 ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            <span>{d}</span>
            <span className={cn("text-xs font-semibold tabular", n !== 23 && "text-foreground")}>{n}</span>
          </span>
        ))}
      </div>
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
        <span className="h-7 w-0.5 rounded-full bg-info/70" />
        <span className="grid leading-tight">
          <span className="text-[11px] font-medium tabular">9:30 AM · Thu, 23 Oct</span>
          <span className="text-[10px] text-muted-foreground">Follow-up consultation</span>
        </span>
        <Pillbox className="ml-auto bg-info/12 text-info">Approved</Pillbox>
      </div>
    </div>
  );
}

// 3. Consultation record: symptoms, assessment, treatment.
const VISIT_STEPS = [
  ["Symptoms", "Headache, mild fever"],
  ["Assessment", "Rest and fluids advised"],
  ["Treatment", "Medicine issued"],
] as const;

export function VisitVisual() {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Stethoscope className="size-3.5 text-primary" />
        <span className="text-xs font-semibold">Consultation</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular">20 Oct · 10:15 AM</span>
      </div>
      <ul className="grid gap-2 px-3 py-2.5">
        {VISIT_STEPS.map(([label, value]) => (
          <li key={label} className="flex items-start gap-2">
            <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-2.5" strokeWidth={3.5} />
            </span>
            <span className="grid leading-tight">
              <span className="text-[10px] text-muted-foreground">{label}</span>
              <span className="text-[11px] font-medium">{value}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        Follow-up <span className="font-medium text-foreground tabular">27 Oct</span>
      </div>
    </div>
  );
}

// 4. Stock list with levels and flags.
const STOCK = [
  { name: "Paracetamol 500 mg", qty: 240, pct: 82, flag: null },
  { name: "Cetirizine 10 mg", qty: 18, pct: 16, flag: "Low stock" },
  { name: "Antiseptic solution", qty: 35, pct: 48, flag: "Expiring soon" },
] as const;

export function InventoryVisual() {
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">Medicine stock</span>
        <span className="text-[10px] text-muted-foreground">3 of 12 items</span>
      </div>
      <ul className="grid gap-2.5 px-3 py-2.5">
        {STOCK.map((m) => (
          <li key={m.name} className="grid gap-1">
            <div className="flex items-center gap-1.5 text-[11px]">
              <Pill className={cn("size-3 shrink-0", m.flag ? "text-warning-foreground" : "text-primary")} />
              <span className="truncate font-medium">{m.name}</span>
              <span className="ml-auto text-muted-foreground tabular">{m.qty}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("block h-full rounded-full", m.flag ? "bg-warning" : "bg-primary")}
                  style={{ width: `${m.pct}%` }}
                />
              </span>
              {m.flag ? (
                <Pillbox className="h-4 bg-warning/25 px-1.5 text-[9px] text-warning-foreground">{m.flag}</Pillbox>
              ) : (
                <Pillbox className="h-4 bg-success/12 px-1.5 text-[9px] text-success">In stock</Pillbox>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 5. Incident report.
export function IncidentVisual() {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
          <ShieldAlert className="size-4" />
        </span>
        <span className="grid leading-tight">
          <span className="text-xs font-semibold">Incident report</span>
          <span className="text-[10px] text-muted-foreground tabular">IR-0042 · 18 Oct</span>
        </span>
        <Pillbox className="ml-auto bg-secondary text-secondary-foreground">Recorded</Pillbox>
      </div>
      <div className="divide-y">
        <Row label="Type" value="Minor injury" />
        <Row label="Location" value="Gymnasium" />
        <Row label="Action taken" value="First aid given" />
      </div>
    </div>
  );
}

// 6. Reports: two summary metrics over a monthly bar chart.
const BARS = [
  ["Jun", 46],
  ["Jul", 58],
  ["Aug", 72],
  ["Sep", 64],
  ["Oct", 88],
] as const;

export function ReportsVisual() {
  return (
    <div className={cn(PANEL, "p-3")}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-background px-2.5 py-1.5 ring-1 ring-border">
          <span className="block text-[10px] text-muted-foreground">Clinic visits</span>
          <span className="flex items-baseline gap-1">
            <span className="text-sm font-semibold tabular">128</span>
            <TrendingUp className="size-3 text-success" />
          </span>
        </div>
        <div className="rounded-md bg-background px-2.5 py-1.5 ring-1 ring-border">
          <span className="block text-[10px] text-muted-foreground">Medicines issued</span>
          <span className="text-sm font-semibold tabular">212</span>
        </div>
      </div>
      <div className="mt-3 flex h-[4.5rem] items-end gap-2 border-b pb-px">
        {BARS.map(([m, v], i) => (
          <span
            key={m}
            className={cn("flex-1 rounded-t-[3px]", i === BARS.length - 1 ? "bg-primary" : "bg-primary/25")}
            style={{ height: `${v}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-center text-[9px] text-muted-foreground">
        {BARS.map(([m]) => (
          <span key={m} className="flex-1">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
