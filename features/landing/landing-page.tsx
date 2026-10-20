import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";

import { BrandMark } from "@/components/app/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import aboutPhoto from "@/public/images/about-clinic-placeholder.jpg";

import {
  AppointmentVisual,
  HealthRecordVisual,
  IncidentVisual,
  InventoryVisual,
  ReportsVisual,
  VisitVisual,
} from "./feature-visuals";
import { HeroVisual } from "./hero-visual";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { AuthStepVisual, RequestStepVisual, TrackStepVisual } from "./step-visuals";

// Public landing page at "/" for signed-out visitors (signed-in users are
// redirected to their role's home before this renders). Copy stays within
// SYSTEM_SPEC: no health-outcome claims, no claim of official deployment.

// Order and copy per the Features brief. Each description names who uses the
// module, so no staff-only feature reads as available to students.
const FEATURES: { visual: () => React.ReactNode; title: string; body: string }[] = [
  {
    visual: HealthRecordVisual,
    title: "Student Health Records",
    body: "Clinic personnel keep each student's profile, medical history, and allergies in one organized record.",
  },
  {
    visual: AppointmentVisual,
    title: "Appointment Management",
    body: "Students request a preferred date and time. Clinic personnel approve, reschedule, or complete each request.",
  },
  {
    visual: VisitVisual,
    title: "Clinic Visits & Consultations",
    body: "Symptoms, assessment, treatment, and follow-up for every visit, linked to the student's record.",
  },
  {
    visual: InventoryVisual,
    title: "Medicine Inventory",
    body: "Track stock levels and medicines issued, with flags for items running low or expiring soon.",
  },
  {
    visual: IncidentVisual,
    title: "Health Incident Records",
    body: "Document injuries, illnesses, and other clinic-related incidents with their details and the action taken.",
  },
  {
    visual: ReportsVisual,
    title: "Reports & Statistics",
    body: "Summaries of visits, health concerns, and medicine use. Administrators see aggregate counts only.",
  },
];

const STEPS: { visual: () => React.ReactNode; title: string; body: string }[] = [
  {
    visual: AuthStepVisual,
    title: "Create Account or Login",
    body: "Register as a new student or log in using your existing WUPCare account.",
  },
  {
    visual: RequestStepVisual,
    title: "Request an Appointment",
    body: "Choose your preferred clinic schedule and submit an appointment request.",
  },
  {
    visual: TrackStepVisual,
    title: "Visit the Clinic & Track Status",
    body: "Monitor appointment updates and visit the clinic at the scheduled time.",
  },
];

export function LandingPage({ registrationOpen }: { registrationOpen: boolean }) {
  const year = new Date().getFullYear();

  return (
    <div data-landing className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader registrationOpen={registrationOpen} />

      <main id="main" className="flex-1">
        <Hero registrationOpen={registrationOpen} />
        <Features />
        <HowItWorks />
        <About />
      </main>

      <SiteFooter year={year} registrationOpen={registrationOpen} />
    </div>
  );
}

function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

// One heading scale for every section title (h2).
const SECTION_TITLE = "text-2xl font-semibold tracking-tight text-balance sm:text-3xl lg:text-[2.25rem] lg:leading-tight";

// Faint brand-cross field for the green panels (How it works, closing CTA).
function CrossPattern({ id }: { id: string }) {
  return (
    <svg aria-hidden="true" className="absolute inset-0 size-full text-primary-foreground/[0.06]">
      <defs>
        <pattern id={id} width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M12 8h4v4h4v4h-4v4h-4v-4H8v-4h4z" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

function RegistrationClosedNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-sm text-muted-foreground", className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>
        Student sign-up is temporarily unavailable. If you already have an account, sign in.
      </span>
    </p>
  );
}

function Hero({ registrationOpen }: { registrationOpen: boolean }) {
  return (
    <section id="top" aria-labelledby="hero-title" className="scroll-mt-20 border-b bg-sidebar">
      <Container className="grid items-center gap-10 py-14 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 lg:py-20">
        <div className="grid gap-6">
          <h1
            id="hero-title"
            className="text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl lg:text-[3.375rem] lg:leading-[1.05]"
          >
            Your Health, <span className="text-primary">Our Priority.</span>
          </h1>
          <p className="max-w-[34rem] text-base leading-relaxed text-muted-foreground sm:text-lg">
            A smarter way to manage student health records, clinic appointments, and healthcare services at{" "}
            <span className="whitespace-nowrap">Wesleyan University-Philippines.</span>
          </p>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-5 text-[15px]">
              <Link href={registrationOpen ? "/register" : "/login"}>
                Get Started
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 bg-card px-5 text-[15px]">
              <a href="#features">Explore Features</a>
            </Button>
          </div>

          {registrationOpen ? null : <RegistrationClosedNote />}

          <p className="flex items-center gap-2 border-t pt-5 text-xs text-muted-foreground">
            <BrandMark className="size-4" />
            Student health records and clinic management system for Wesleyan University-Philippines
          </p>
        </div>

        <HeroVisual className="rounded-2xl border bg-accent/60" />
      </Container>
    </section>
  );
}

function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-16 py-16 sm:py-24">
      <Container className="grid gap-10 sm:gap-12">
        <div className="grid max-w-2xl gap-3">
          <h2 id="features-title" className={SECTION_TITLE}>
            Everything Your Campus Clinic Needs, In One Place.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Manage student health records, appointments, clinic visits, incidents, and medicine inventory through one
            organized platform.
          </p>
        </div>

        <div className="grid gap-3">
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ visual: Visual, title, body }) => (
              <li
                key={title}
                className="flex flex-col overflow-hidden rounded-2xl border bg-card transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-float motion-reduce:transition-none"
              >
                <div
                  aria-hidden="true"
                  className="flex h-52 items-center justify-center border-b bg-accent/70 px-5 sm:px-6"
                >
                  <Visual />
                </div>
                <div className="grid gap-1.5 p-5 sm:p-6">
                  <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-right text-[11px] text-muted-foreground">Illustrations use fictional sample data.</p>
        </div>
      </Container>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="scroll-mt-16 border-y bg-sidebar py-16 sm:py-24"
    >
      <Container>
        <div>
          {/* Green band behind the heading; the step cards rise out of it. */}
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 pt-12 pb-28 text-center text-primary-foreground sm:px-10 sm:pt-14 lg:pb-32">
            <CrossPattern id="wup-cross-band" />
            <div className="relative mx-auto grid max-w-2xl gap-3">
              <p className="text-xs font-semibold tracking-[0.14em] text-primary-foreground/90 uppercase">
                How it works
              </p>
              <h2 id="how-title" className={SECTION_TITLE}>
                How WUPCare Works for Students
              </h2>
              <p className="text-base leading-relaxed text-pretty text-primary-foreground/90">
                WUPCare makes it easier for students to access clinic services—from creating an account to requesting
                appointments and tracking their status.
              </p>
            </div>
          </div>

          <ol className="relative mx-auto -mt-20 grid max-w-5xl gap-x-5 gap-y-10 px-3 sm:grid-cols-2 sm:px-6 lg:-mt-24 lg:grid-cols-3 lg:gap-x-8">
            {STEPS.map(({ visual: Visual, title, body }, i) => (
              <li
                key={title}
                className="relative flex flex-col rounded-2xl border bg-card shadow-raised sm:last:col-span-2 sm:last:w-[calc(50%-0.625rem)] sm:last:justify-self-center lg:last:col-span-1 lg:last:w-auto lg:last:justify-self-stretch"
              >
                <span className="absolute -top-5 left-1/2 z-10 grid size-10 -translate-x-1/2 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground ring-4 ring-card tabular">
                  <span className="sr-only">Step </span>
                  {i + 1}
                </span>
                <div
                  aria-hidden="true"
                  className="flex h-[13.5rem] items-center justify-center rounded-t-2xl border-b bg-accent/70 px-5 pt-5"
                >
                  <Visual />
                </div>
                <div className="grid gap-1.5 p-5">
                  <h3 className="text-[15px] font-semibold leading-snug tracking-tight">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

// Placeholder photo until an approved photo of the WUP clinic is supplied:
// "Empty hospital corridor with benches and doors" by Tasha Kostyuk, Unsplash
// (unsplash.com/photos/Pk-KuizxQv8), free under the Unsplash License. It is a
// generic clinic, not WUP; the banner says so. Replace
// public/images/about-clinic-placeholder.jpg and ABOUT_PHOTO_ALT to swap it.
const ABOUT_PHOTO_ALT = "A bright, empty clinic corridor with waiting benches and consultation room doors";

function About() {
  return (
    <section id="about" aria-labelledby="about-title" className="scroll-mt-16 py-16 sm:py-24">
      <Container className="grid gap-10 sm:gap-14">
        <div className="relative isolate aspect-[4/3] overflow-hidden rounded-3xl bg-[oklch(var(--shadow-tint))] sm:aspect-[16/9] lg:aspect-[3/1]">
          <Image
            src={aboutPhoto}
            alt={ABOUT_PHOTO_ALT}
            fill
            placeholder="blur"
            sizes="(min-width: 1152px) 1104px, calc(100vw - 2rem)"
            className="-z-10 object-cover object-[50%_58%]"
          />
          {/* Navy wash where the title sits (white text keeps >= 4:1); the right side stays clear on desktop.
              The banner itself is navy too, so the title stays readable if the photo fails to load. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,oklch(var(--shadow-tint)/0.78),oklch(var(--shadow-tint)/0.62))] lg:bg-[linear-gradient(90deg,oklch(var(--shadow-tint)/0.78)_0%,oklch(var(--shadow-tint)/0.62)_60%,oklch(var(--shadow-tint)/0.08)_92%)]"
          />
          <div className="flex h-full items-center px-6 sm:px-10 lg:px-14">
            <h2
              id="about-title"
              className="text-[clamp(3rem,10vw,6rem)] leading-[0.92] font-bold tracking-[-0.035em] text-white uppercase"
            >
              About Us
            </h2>
          </div>
          <p className="absolute right-3 bottom-3 rounded-full bg-[oklch(var(--shadow-tint)/0.72)] px-2.5 py-1 text-[11px] text-white sm:right-4 sm:bottom-4">
            Stock photo, not the WUP clinic
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
          <h3 className="text-[2.5rem] leading-[1.02] font-bold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.75rem]">
            Better Care.
            <br />
            <span className="text-primary">Smarter Clinic.</span>
          </h3>
          <div className="grid max-w-[62ch] gap-4 text-base leading-relaxed sm:text-[17px]">
            <p className="text-foreground/85">
              WUPCare is a web-based student health records and clinic management system designed for Wesleyan
              University-Philippines. It brings student records, clinic visits, appointments, and medicine management
              into one organized digital platform.
            </p>
            <p className="text-muted-foreground">
              The system helps authorized clinic personnel manage daily operations, allows administrators to oversee
              user accounts and summary reports, and gives students a convenient way to request and monitor clinic
              appointments.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
