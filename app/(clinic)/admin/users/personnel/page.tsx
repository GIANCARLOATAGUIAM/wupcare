import type { Metadata } from "next";

import { UserList } from "@/features/users/user-list";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Clinic Personnel" };

export default async function Page({ searchParams }: PageProps<"/admin/users/personnel">) {
  const me = await requireRole("admin");
  return <UserList kind="personnel" sp={await searchParams} meId={me.id} />;
}
