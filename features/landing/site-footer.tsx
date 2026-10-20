import Link from "next/link";

import { Brand } from "@/components/app/brand";
import { cn } from "@/lib/utils";

// Landing footer: brand block and two link groups on top, an oversized
// "WUPCare" wordmark, then a quiet bottom bar. Only real routes and anchors.

const EXPLORE = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#about", label: "About Us" },
] as const;

const LINK =
  "inline-flex min-h-8 items-center rounded-sm text-[15px] text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none";

function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

// Each group spans two rows of the parent grid and adopts them via subgrid, so
// both headings share one row track and both lists share the next: aligned by
// structure, not by offsets.
function LinkGroup({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <nav aria-labelledby={id} className="row-span-2 grid grid-rows-subgrid gap-y-3">
      <h2 id={id} className="text-xs leading-5 font-semibold tracking-[0.12em] text-foreground uppercase">
        {title}
      </h2>
      <ul className="grid content-start gap-1">{children}</ul>
    </nav>
  );
}

export function SiteFooter({ year, registrationOpen }: { year: number; registrationOpen: boolean }) {
  return (
    <footer className="border-t bg-card">
      <Container className="grid gap-12 pt-14 pb-8 sm:pt-16 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
        <div className="grid max-w-sm content-start gap-4">
          <Brand className="h-12" sizes="240px" />
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            A smarter way to organize campus clinic services, student health records, and appointments.
          </p>
          <p className="text-sm font-medium text-foreground">Wesleyan University-Philippines</p>
        </div>

        <div className="grid grid-cols-2 grid-rows-[auto_auto] items-start gap-x-12 gap-y-3 sm:gap-x-20">
          <LinkGroup id="footer-explore" title="Explore">
            {EXPLORE.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={LINK}>
                  {l.label}
                </a>
              </li>
            ))}
          </LinkGroup>

          <LinkGroup id="footer-account" title="Account">
            <li>
              <Link href="/login" className={LINK}>
                Login
              </Link>
            </li>
            <li>
              {registrationOpen ? (
                <Link href="/register" className={LINK}>
                  Student Sign Up
                </Link>
              ) : (
                // Not a link while the STUDENT_REGISTRATION flag is off.
                <span aria-disabled="true" className="inline-flex min-h-8 flex-wrap items-center gap-x-2 text-[15px] text-muted-foreground">
                  Student Sign Up
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">Unavailable</span>
                </span>
              )}
            </li>
          </LinkGroup>
        </div>
      </Container>

      {/* Oversized wordmark. Decorative: the logo above already names the product. Sized in container-query
          units so it spans the content width at every breakpoint without overflowing.
          Editorial crop: this box alone clips. Measured Geist Bold metrics at line-height 0.82: cap top
          ~0.038em, baseline ~0.764em, letter height ~0.726em. Pulling the text up 0.028em and cutting the box
          at 0.665em trims the space above and hides ~12% of the letters' lower edge. All in em, so it scales. */}
      <Container className="@container">
        <div aria-hidden="true" className="h-[0.665em] overflow-hidden text-[22.7cqw] select-none">
          <p className="-mt-[0.028em] leading-[0.82] font-bold tracking-[-0.055em] whitespace-nowrap text-primary">
            WUPCare
          </p>
        </div>
      </Container>

      <div className="border-t">
        <Container className="grid gap-3 py-6 text-xs text-muted-foreground">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <p>© {year} WUPCare. Academic project.</p>
            <p>Wesleyan University-Philippines</p>
          </div>
          <p className="max-w-2xl leading-relaxed">
            WUPCare is a clinic management and recordkeeping tool, not a substitute for professional medical care.
          </p>
        </Container>
      </div>
    </footer>
  );
}
