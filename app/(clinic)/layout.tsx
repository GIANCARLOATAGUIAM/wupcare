import { ClinicShell } from "@/components/app/clinic-shell";
import { Disclaimer } from "@/components/app/disclaimer";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

// Shell for administrators and clinic personnel. Layouts do not re-run on
// client navigation, so every page under this group must call requireRole()
// itself. This check only loads the user for the sidebar.
export default async function ClinicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("admin", "clinic_staff");

  let pendingAppointments: number | undefined;
  if (user.role === "clinic_staff") {
    const supabase = await createClient();
    const appointments = await supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending");
    pendingAppointments = appointments.count ?? undefined;
  }

  // Both roles use the full main-content width; narrow forms cap their own width.
  return (
    <ClinicShell user={{ fullName: user.fullName, email: user.email, role: user.role }} counts={{ pendingAppointments }}>
      <div className="flex flex-1 flex-col">
        <main id="main" className="w-full min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 print:max-w-none print:p-0">
          {children}
        </main>
        <footer className="w-full px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8 print:hidden">
          <Disclaimer className="border-t pt-3 sm:pt-4" />
        </footer>
      </div>
    </ClinicShell>
  );
}
