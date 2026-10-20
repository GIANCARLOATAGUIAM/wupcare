import type { Role } from "./roles";

const FALLBACK: Record<Role, string> = {
  admin: "Administrator",
  clinic_staff: "Nurse",
  student: "Student",
};

export function displayName(name: string | null | undefined, role: Role): string {
  return name?.trim() || FALLBACK[role];
}
