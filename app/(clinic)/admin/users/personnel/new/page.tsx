import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { CreateUserForm } from "@/features/users/create-user-form";
import { requireRole } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Add account" };

export default async function NewPersonnelPage() {
  await requireRole("admin");
  return (
    <div className="grid gap-5">
      <PageHeader title="Add account" description="Create an account for clinic personnel or an administrator." />
      <CreateUserForm kind="personnel" students={[]} />
    </div>
  );
}
