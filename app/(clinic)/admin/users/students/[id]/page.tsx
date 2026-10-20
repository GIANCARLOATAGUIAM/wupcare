import type { Metadata } from "next";

import { UserDetail } from "@/features/users/user-detail";
import { listReturnQuery } from "@/features/users/user-list";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Student Accounts" };

export default async function Page({ params, searchParams }: PageProps<"/admin/users/students/[id]">) {
  const me = await requireRole("admin");
  const { id } = await params;
  return <UserDetail id={id} kind="students" meId={me.id} backQuery={listReturnQuery(await searchParams)} />;
}
