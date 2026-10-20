import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Brand } from "@/components/app/brand";
import { Disclaimer } from "@/components/app/disclaimer";

// Shared frame for /login and /register: an ice-blue page with one rounded
// container split into a brand panel (left) and the form card (right).
// Presentational only; each page keeps its own auth logic.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-accent/60 px-3 py-3 sm:items-center sm:px-6 sm:py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border sm:rounded-[1.75rem] bg-card shadow-raised lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BrandPanel />
        <main className="flex items-center justify-center px-5 py-6 sm:px-10 sm:py-12 lg:px-12">
          <div className="w-full max-w-sm">
            {children}
            {/* SYSTEM_SPEC §2.4: the disclaimer sits in the brand panel on desktop, here on smaller screens. */}
            <Disclaimer className="mt-6 sm:mt-8 lg:hidden" />
          </div>
        </main>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="relative isolate flex flex-col gap-3 overflow-hidden border-b bg-secondary px-5 py-4 sm:gap-6 sm:px-10 sm:py-8 lg:min-h-[38rem] lg:justify-between lg:border-r lg:border-b-0 lg:p-12">
      <Shapes />

      <div className="flex items-center justify-between gap-4">
        <Brand className="h-10 sm:h-11" preload sizes="220px" />
        <Link
          href="/"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap text-secondary-foreground/90 transition-colors hover:text-primary motion-reduce:transition-none"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Home
        </Link>
      </div>

      <div className="grid gap-3 lg:max-w-sm">
        <p className="text-xl leading-tight font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-3xl lg:text-[2.5rem]">
          Your Health, <span className="text-primary">Our Priority.</span>
        </p>
        <p className="hidden text-base leading-relaxed text-secondary-foreground/90 sm:block">
          A smarter way to manage student appointments and campus clinic services.
        </p>
      </div>

      <div className="hidden gap-3 lg:grid">
        <p className="text-sm font-medium text-foreground">Wesleyan University-Philippines</p>
        <Disclaimer className="max-w-sm text-secondary-foreground" />
      </div>
    </aside>
  );
}

// Decorative layered curves in the brand blues. Hidden on small screens.
function Shapes() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 520 640"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-0 -z-10 hidden size-full lg:block"
    >
      <circle cx="470" cy="70" r="150" className="fill-card" opacity="0.55" />
      <circle cx="470" cy="70" r="92" className="fill-brand" opacity="0.08" />
      <path d="M0 470 C 140 400, 260 520, 520 430 L 520 640 L 0 640 Z" className="fill-brand" opacity="0.1" />
      <path d="M0 540 C 160 470, 300 600, 520 520 L 520 640 L 0 640 Z" className="fill-primary" opacity="0.12" />
      <path d="M0 600 C 180 560, 320 640, 520 590 L 520 640 L 0 640 Z" className="fill-card" opacity="0.6" />
    </svg>
  );
}

/** Card header used by both auth pages. */
export function AuthHeading({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
