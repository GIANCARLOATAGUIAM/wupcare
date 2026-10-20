import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  Clock,
  GraduationCap,
  HeartPulse,
  History,
  LayoutDashboard,
  Pill,
  Stethoscope,
  TriangleAlert,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/auth/roles";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  // Shows a waiting-items count next to the item.
  countKey?: "pendingAppointments";
  // Highlight only on this exact path (a dashboard whose sub-pages are other items).
  exact?: boolean;
  // Admin report links carry month/year/scope (and legacy date bookmarks).
  keepReportFilters?: boolean;
};

// A group of items, optionally under a small section label. A collapsible
// section's label is a toggle (expanded by default; the collapsed desktop
// rail always shows its icons).
export type NavSection = { label?: string; collapsible?: boolean; items: NavItem[] };

// SYSTEM_SPEC §6.2. The account page is reached from the profile card at the
// bottom of the sidebar. Pending student registrations are surfaced on the
// dashboard while the approval workflow remains (docs/NURSE_PORTAL.md).
const CLINIC_STAFF_NAV: NavSection[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  { label: "Student Management", items: [{ label: "Students", href: "/students", icon: GraduationCap }] },
  // Where an appointment goes: Pending -> Scheduled (approved) -> History
  // (completed, declined, cancelled). See features/appointments/categories.ts.
  {
    label: "Appointments",
    collapsible: true,
    items: [
      { label: "All Appointments", href: "/appointments", icon: CalendarDays },
      { label: "Pending", href: "/appointments/pending", icon: CalendarClock, countKey: "pendingAppointments" },
      { label: "Scheduled", href: "/appointments/scheduled", icon: CalendarCheck },
      { label: "History", href: "/appointments/history", icon: History },
    ],
  },
  {
    label: "Clinic Operations",
    items: [
      { label: "Clinic Visits", href: "/visits", icon: Stethoscope },
      { label: "Medications", href: "/medications", icon: Pill },
      { label: "Health Incidents", href: "/incidents", icon: TriangleAlert },
    ],
  },
  {
    label: "Reports & Settings",
    items: [
      { label: "Clinic Reports", href: "/reports", icon: ChartColumn },
      { label: "Clinic Hours", href: "/settings/clinic-hours", icon: Clock },
    ],
  },
];

// Administrator: accounts and aggregate reports only (no clinical records).
// The account page is reached from the profile card at the bottom of the sidebar.
const ADMIN_NAV: NavSection[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  {
    label: "User Management",
    items: [
      { label: "Clinic Personnel", href: "/admin/users/personnel", icon: UserCog },
      { label: "Student Accounts", href: "/admin/users/students", icon: GraduationCap },
    ],
  },
  {
    label: "Clinic Reports",
    items: [
      { label: "Clinic Visits", href: "/reports/visits", icon: Stethoscope, keepReportFilters: true },
      { label: "Health Concerns", href: "/reports/concerns", icon: HeartPulse, keepReportFilters: true },
      { label: "Medication Usage", href: "/reports/medications", icon: Pill, keepReportFilters: true },
      { label: "Health Incidents", href: "/reports/incidents", icon: TriangleAlert, keepReportFilters: true },
      { label: "Appointments", href: "/reports/appointments", icon: CalendarClock, keepReportFilters: true },
    ],
  },
];

// Student portal: appointments only (no clinical records, no staff modules).
// The account page is reached from the profile card.
const STUDENT_NAV: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/portal", icon: LayoutDashboard, exact: true },
      { label: "My Appointments", href: "/portal/appointments", icon: CalendarClock },
      { label: "Request Appointment", href: "/portal/request", icon: CalendarPlus },
    ],
  },
];

export function navForRole(role: Role): NavSection[] {
  if (role === "admin") return ADMIN_NAV;
  if (role === "clinic_staff") return CLINIC_STAFF_NAV;
  return STUDENT_NAV;
}

// Where the sidebar profile card leads.
export function accountHrefForRole(role: Role) {
  return role === "student" ? "/portal/account" : "/account";
}
