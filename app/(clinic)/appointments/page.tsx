import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { hrefWith, param } from "@/components/app/list-controls";
import { AppointmentList } from "@/features/appointments/components/appointment-list";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "All Appointments" };

// Old ?view= tabs (bookmarks, earlier dashboard links) -> the category pages.
const LEGACY_VIEWS: Record<string, [string, Record<string, string>?]> = {
  pending: ["/appointments/pending"],
  today: ["/appointments/scheduled", { when: "today" }],
  approved: ["/appointments/scheduled"],
  completed: ["/appointments/history", { status: "completed" }],
  declined: ["/appointments/history", { status: "declined" }],
  cancelled: ["/appointments/history", { status: "cancelled" }],
  all: ["/appointments"],
};

export default async function AppointmentsPage({ searchParams }: PageProps<"/appointments">) {
  await requireRole("clinic_staff");
  const sp = await searchParams;
  const view = param(sp, "view");
  if (view !== undefined) {
    const [path, extra] = (view && Object.hasOwn(LEGACY_VIEWS, view) ? LEGACY_VIEWS[view] : null) ?? ["/appointments"];
    redirect(hrefWith(path, sp, { view: undefined, page: undefined, ...extra }));
  }
  return <AppointmentList category="all" sp={sp} />;
}
