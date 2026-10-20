import type { Metadata } from "next";

import { UserDetail } from "@/features/users/user-detail";
import { listReturnQuery } from "@/features/users/user-list";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Clinic Personnel" };

export default async function Page({ params, searchParams }: PageProps<"/admin/users/personnel/[id]">) {
  const me = await requireRole("admin");
  const { id } = await params;
  return <UserDetail id={id} kind="personnel" meId={me.id} backQuery={listReturnQuery(await searchParams)} />;
}
