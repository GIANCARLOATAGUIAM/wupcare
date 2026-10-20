import "server-only";

import { manilaDayStart, manilaToday } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// Student portal appointment views. RLS already limits students to their own
// rows (appointments_select: student_id = current_student_id()); every query
// here also filters by the linked student_id as defense in depth.

export const STUDENT_TABS = ["all", "pending", "upcoming", "completed", "closed"] as const;
export type StudentTab = (typeof STUDENT_TABS)[number];
export const STUDENT_TAB_LABELS: Record<StudentTab, string> = {
  all: "All",
  pending: "Pending Approval",
  upcoming: "Upcoming",
  completed: "Completed",
  closed: "Cancelled / Not Approved",
};

export function studentTab(value: string | undefined): StudentTab {
  return STUDENT_TABS.includes(value as StudentTab) ? (value as StudentTab) : "all";
}

export const STUDENT_APPOINTMENT_COLUMNS =
  "id, preferred_date, preferred_time, scheduled_at, status, reason, staff_remarks, reschedule_count, created_at";

// Linked student record of the signed-in account (null while unverified).
export async function linkedStudentId(supabase: Client, userId: string) {
  const { data } = await supabase.from("profiles").select("student_id").eq("id", userId).maybeSingle();
  return data?.student_id ?? null;
}

// "Upcoming" = approved and scheduled from the start of today (Asia/Manila).
// Approved appointments from earlier days stay visible under All.
export function upcomingFrom() {
  return manilaDayStart(manilaToday());
}
