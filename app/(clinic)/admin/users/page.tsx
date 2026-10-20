import { redirect } from "next/navigation";

import { hrefWith, param } from "@/components/app/list-controls";
import { requireRole } from "@/lib/auth/dal";

// The account list is split into Clinic Personnel and Student Accounts.
// Old links (for example /admin/users?role=student from the dashboard) land on the right one.
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireRole("admin");
  const sp = await searchParams;
  const role = param(sp, "role");
  if (role === "student") redirect(hrefWith("/admin/users/students", sp, { role: undefined }));
  redirect(hrefWith("/admin/users/personnel", sp, { role: role === "admin" || role === "clinic_staff" ? role : undefined }));
}
