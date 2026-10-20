import type { Metadata } from "next";

import { AppointmentList } from "@/features/appointments/components/appointment-list";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Scheduled Appointments" };

export default async function ScheduledAppointmentsPage({ searchParams }: PageProps<"/appointments/scheduled">) {
  await requireRole("clinic_staff");
  return <AppointmentList category="scheduled" sp={await searchParams} />;
}
