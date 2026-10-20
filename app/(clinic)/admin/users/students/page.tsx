import type { Metadata } from "next";

import { UserList } from "@/features/users/user-list";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Student Accounts" };

export default async function Page({ searchParams }: PageProps<"/admin/users/students">) {
  const me = await requireRole("admin");
  return <UserList kind="students" sp={await searchParams} meId={me.id} />;
}
