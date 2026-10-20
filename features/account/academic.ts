import "server-only";

import { redirect } from "next/navigation";

import type { createClient } from "@/lib/supabase/server";

import { isAcademicComplete } from "./academic-schema";

type Client = Awaited<ReturnType<typeof createClient>>;

export type AcademicProfile = { college: string | null; year_level: number | null; complete: boolean };

// The signed-in student's own Department/College and Year Level, read through
// my_academic_profile (migration 0013; students have no SELECT on students).
// Returns null when it cannot be read (for example before 0013 is applied),
// so callers never block on an unknown state.
export async function myAcademicProfile(supabase: Client): Promise<AcademicProfile | null> {
  const { data, error } = await supabase.rpc("my_academic_profile");
  if (error) {
    console.error("[academic] profile read failed:", error.code);
    return null;
  }
  const row = data?.[0] ?? { college: null, year_level: null };
  return { college: row.college, year_level: row.year_level, complete: isAcademicComplete(row) };
}

// Only portal paths are accepted as the page to return to after completing
// the profile.
export function safePortalNext(value: unknown) {
  return typeof value === "string" && /^\/portal(\/[\w-]+)*(\?[\w%.~*+=&-]*)?$/.test(value) && !value.startsWith("/portal/complete-profile")
    ? value
    : "/portal";
}

// Linked students missing either field go to Complete Your Profile first.
export async function requireCompleteProfile(supabase: Client, next: string) {
  const profile = await myAcademicProfile(supabase);
  if (profile && !profile.complete) redirect(`/portal/complete-profile?${new URLSearchParams({ next: safePortalNext(next) })}`);
  return profile;
}
