import "server-only";

import { PAGE_SIZE } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

// PostgREST cannot compare stock_quantity with another column. Without adding
// a database function/view, scan only stock metadata in bounded requests and
// retain only the requested page's IDs. Full medicine rows stay paginated.
export async function lowStockPage(supabase: Awaited<ReturnType<typeof createClient>>, page: number, filters: { q: string; active: string; scope: string }) {
  const ids: string[] = [];
  let total = 0;
  let cursor: string | undefined;
  for (;;) {
    let query = supabase.from("medicines").select("id, stock_quantity, reorder_level").order("id").limit(500);
    if (cursor) query = query.gt("id", cursor);
    if (filters.q) query = query.ilike("name", `%${filters.q}%`);
    if (filters.active === "active" || filters.active === "inactive") query = query.eq("is_active", filters.active === "active");
    if (filters.scope !== "all") query = query.eq("is_demo", filters.scope === "demo");
    const { data, error } = await query;
    if (error) return { ids, total, error };
    // The low-stock view uses ID order, matching its final row fetch.
    for (const row of data ?? []) {
      if (row.stock_quantity <= row.reorder_level) {
        if (total >= (page - 1) * PAGE_SIZE && ids.length < PAGE_SIZE) ids.push(row.id);
        total++;
      }
    }
    if (!data?.length) return { ids, total, error: null };
    cursor = data[data.length - 1].id;
  }
}
