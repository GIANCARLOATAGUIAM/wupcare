import type { Metadata } from "next";

import { AppointmentList } from "@/features/appointments/components/appointment-list";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Pending Requests" };

export default async function PendingAppointmentsPage({ searchParams }: PageProps<"/appointments/pending">) {
  await requireRole("clinic_staff");
  return <AppointmentList category="pending" sp={await searchParams} />;
}
