import "server-only";

import { collectRows } from "@/lib/collect-rows";
import { createClient } from "@/lib/supabase/server";

export async function ledgerTotal(supabase: Awaited<ReturnType<typeof createClient>>, medicineId: string) {
  const { data, error } = await collectRows((from, to) => supabase.from("medication_transactions")
    .select("id, quantity").eq("medicine_id", medicineId).order("id").range(from, to));
  return error ? null : (data ?? []).reduce((total, row) => total + row.quantity, 0);
}
