import "server-only";

import { redirect } from "next/navigation";

import type { createClient } from "@/lib/supabase/server";

import { isAcademicComplete } from "./academic-schema";

type Client = Awaited<ReturnType<typeof createClient>>;

export type AcademicProfile = {
  college_id: string | null;
  program_id: string | null;
  year_level: number | null;
  // Free text saved before the catalog (shown as a hint, never trusted).
  college: string | null;
  program: string | null;
  complete: boolean;
};

// The signed-in student's own College, Program and Year Level, read through
// my_academic_profile (migrations 0013/0014; students have no SELECT on
// students). Returns null when it cannot be read, so callers never block on
// an unknown state.
export async function myAcademicProfile(supabase: Client): Promise<AcademicProfile | null> {
  const { data, error } = await supabase.rpc("my_academic_profile");
  if (error) {
    console.error("[academic] profile read failed:", error.code);
    return null;
  }
  const row = data?.[0];
  const profile = {
    college_id: row?.college_id ?? null,
    program_id: row?.program_id ?? null,
    year_level: row?.year_level ?? null,
    college: row?.college ?? null,
    program: row?.program ?? null,
  };
  return { ...profile, complete: isAcademicComplete(profile) };
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
