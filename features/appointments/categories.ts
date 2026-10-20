import type { Database } from "@/types/database";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

// Nurse appointment management: four views over the existing statuses
// (no new database statuses). Every status belongs to exactly one category
// besides "All".
export const APPOINTMENT_CATEGORIES = {
  all: { label: "All Appointments", href: "/appointments" },
  pending: { label: "Pending Requests", href: "/appointments/pending" },
  scheduled: { label: "Scheduled Appointments", href: "/appointments/scheduled" },
  history: { label: "Appointment History", href: "/appointments/history" },
} as const;

export type AppointmentCategory = keyof typeof APPOINTMENT_CATEGORIES;
export const CATEGORY_KEYS = Object.keys(APPOINTMENT_CATEGORIES) as AppointmentCategory[];

export const HISTORY_STATUSES = ["completed", "declined", "cancelled"] as const satisfies AppointmentStatus[];

export function categoryForStatus(status: AppointmentStatus): Exclude<AppointmentCategory, "all"> {
  if (status === "pending") return "pending";
  if (status === "approved") return "scheduled";
  return "history";
}

// Approved, and its confirmed time has passed without being completed.
export function isOverdue(a: { status: AppointmentStatus; scheduled_at: string | null }, now = Date.now()) {
  return a.status === "approved" && !!a.scheduled_at && new Date(a.scheduled_at).getTime() < now;
}

// "Back to list" links only ever lead to one of the appointment lists.
export function safeBackHref(value: unknown) {
  return typeof value === "string" && /^\/appointments(\/(pending|scheduled|history))?(\?[\w%.~*+=&-]*)?$/.test(value) ? value : undefined;
}

// Shown on the detail page after a change, so the nurse knows where the
// record went. Keys are the ?done= values written by the server actions.
export const DONE_MESSAGES = {
  approve: { text: "Appointment approved.", category: "scheduled" },
  reschedule: { text: "Appointment rescheduled.", category: "scheduled" },
  book: { text: "Appointment booked.", category: "scheduled" },
  decline: { text: "Request declined.", category: "history" },
  cancel: { text: "Appointment cancelled.", category: "history" },
  complete: { text: "Marked as completed.", category: "history" },
} as const satisfies Record<string, { text: string; category: AppointmentCategory }>;

export type DoneKey = keyof typeof DONE_MESSAGES;

export function doneMessage(value: unknown) {
  return typeof value === "string" && Object.hasOwn(DONE_MESSAGES, value) ? DONE_MESSAGES[value as DoneKey] : undefined;
}

// Detail page URL after an action: the outcome plus the list to return to.
export function detailHref(id: string, done: DoneKey, back?: string) {
  const params = new URLSearchParams({ done });
  if (back) params.set("back", back);
  return `/appointments/${id}?${params}`;
}
