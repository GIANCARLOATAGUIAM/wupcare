import { notFound, redirect } from "next/navigation";

import { isUuid, kindForRole } from "@/features/users/user-detail";
import { USER_KIND } from "@/features/users/user-list";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

// Kept so existing links (and createUser's redirect) still work: sends the
// account to its page under Clinic Personnel or Student Accounts.
export default async function UserRedirect({ params }: PageProps<"/admin/users/[id]">) {
  await requireRole("admin");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: u } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!u) notFound();
  redirect(`${USER_KIND[kindForRole(u.role)].path}/${id}`);
}
