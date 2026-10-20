import type { Metadata } from "next";

import { AppointmentList } from "@/features/appointments/components/appointment-list";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Appointment History" };

export default async function HistoryAppointmentsPage({ searchParams }: PageProps<"/appointments/history">) {
  await requireRole("clinic_staff");
  return <AppointmentList category="history" sp={await searchParams} />;
}
