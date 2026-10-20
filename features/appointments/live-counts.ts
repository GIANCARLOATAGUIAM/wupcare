"use server";

import { getAuthState } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

// Sidebar "Pending" badge for clinic personnel. The (clinic) layout renders
// only on a full load (layouts do not re-render on client navigation), so the
// shell asks for a fresh count after each navigation. Same filter as the
// Pending list and the dashboard; RLS applies. Other roles get null.
export async function pendingAppointmentCount(): Promise<number | null> {
  const state = await getAuthState();
  if (state.status !== "ok" || state.user.role !== "clinic_staff") return null;
  const supabase = await createClient();
  const { count, error } = await supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending");
  return error ? null : (count ?? 0);
}
