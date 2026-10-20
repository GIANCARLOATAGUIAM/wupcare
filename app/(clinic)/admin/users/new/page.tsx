import { redirect } from "next/navigation";

import { param } from "@/components/app/list-controls";
import { requireRole } from "@/lib/auth/dal";

// Account creation now starts from Clinic Personnel or Student Accounts.
export default async function NewUserRedirect({ searchParams }: PageProps<"/admin/users/new">) {
  await requireRole("admin");
  const sp = await searchParams;
  redirect(param(sp, "role") === "student" ? "/admin/users/students/new" : "/admin/users/personnel/new");
}
