import { ClinicShell } from "@/components/app/clinic-shell";
import { Disclaimer } from "@/components/app/disclaimer";
import { requireRole } from "@/lib/auth/dal";

// Student portal shell: the same sidebar, mobile drawer, profile card, and
// confirmed Sign out as the staff portals, with student-only navigation.
// Every page under this group must still call requireRole("student") itself,
// because layouts do not re-run on navigation.
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("student");

  return (
    <ClinicShell user={{ fullName: user.fullName, email: user.email, role: user.role }}>
      <div className="flex flex-1 flex-col">
        <main id="main" className="w-full min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
        <footer className="w-full px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8">
          <Disclaimer className="border-t pt-3 sm:pt-4" />
        </footer>
      </div>
    </ClinicShell>
  );
}
