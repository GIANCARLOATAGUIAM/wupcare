import "server-only";

import { cache } from "react";

import { STUDENT_SEARCH_COLUMNS, ilikeEveryWord, searchTerm } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export const getStudent = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  return data;
});

export const getHealthRecord = cache(async (studentId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("health_records")
    .select("*, updater:profiles!health_records_updated_by_fkey(full_name)")
    .eq("student_id", studentId)
    .maybeSingle();
  return data;
});

// Short student list for pickers (visits, incidents, appointments, issuance).
export async function searchStudents(q: string, limit = 10) {
  const term = searchTerm(q);
  if (!term) return [];
  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select("id, student_number, first_name, middle_name, last_name, is_demo, status, college")
    .order("last_name")
    .order("id")
    .limit(limit);
  for (const words of ilikeEveryWord(STUDENT_SEARCH_COLUMNS, term)) query = query.or(words);
  const { data } = await query;
  return data ?? [];
}
