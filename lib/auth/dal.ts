import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { displayName } from "./display-name";
import { isRole, ROLE_HOME, type Role } from "./roles";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};

// Why a signed-in user cannot use the app yet. Shown on /login.
export type AccountProblem = "no_profile" | "inactive";

export type AuthState =
  | { status: "signed_out" }
  | { status: "blocked"; problem: AccountProblem; email: string }
  | { status: "ok"; user: CurrentUser };

// Postgres / PostgREST codes for "table does not exist". Expected until the
// Phase 2 migrations create public.profiles.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/**
 * Resolves the signed-in user and their WUPCare profile.
 *
 * The session JWT is verified with getClaims(). The role is read from
 * public.profiles, never from user_metadata (which users can edit).
 * Any failure resolves to a non-"ok" state: access is denied by default.
 *
 * Memoized per render pass with React cache().
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  // Auth is per request. Never let a page that checks it be prerendered,
  // even when Supabase env vars are missing at build time.
  await connection();

  if (!isSupabaseConfigured()) return { status: "signed_out" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claimsError || !claims?.sub) return { status: "signed_out" };

  const email = typeof claims.email === "string" ? claims.email : "";

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", claims.sub)
    .maybeSingle();

  if (error) {
    if (MISSING_TABLE_CODES.has(error.code)) {
      console.warn(
        "[auth] public.profiles does not exist yet. Role checks stay blocked until the Phase 2 migrations are applied."
      );
    } else {
      console.error("[auth] Failed to load profile:", error.message);
    }
    return { status: "blocked", problem: "no_profile", email };
  }

  if (!profile || !isRole(profile.role)) {
    return { status: "blocked", problem: "no_profile", email };
  }

  if (profile.is_active !== true) {
    return { status: "blocked", problem: "inactive", email };
  }

  return {
    status: "ok",
    user: {
      id: profile.id,
      email,
      fullName: displayName(profile.full_name, profile.role),
      role: profile.role,
    },
  };
});

/**
 * Server-side authorization guard. Call it at the top of every protected
 * page, layout, and server action before reading or writing data.
 *
 * - Signed out, no profile, or inactive: redirect to /login.
 * - Signed in with another role: redirect to that role's home page.
 */
export async function requireRole(...allowed: Role[]): Promise<CurrentUser> {
  const state = await getAuthState();

  if (state.status !== "ok") redirect("/login");

  if (!allowed.includes(state.user.role)) {
    redirect(ROLE_HOME[state.user.role]);
  }

  return state.user;
}
