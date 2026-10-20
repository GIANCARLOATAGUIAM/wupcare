import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { CreateUserForm } from "@/features/users/create-user-form";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add student account" };

export default async function NewStudentAccountPage() {
  await requireRole("admin");
  const supabase = await createClient();
  // Student number and name only, for records that have no account yet.
  const { data: students } = await supabase.rpc("students_without_account");

  return (
    <div className="grid gap-5">
      <PageHeader title="Add student account" description="Create a login account for a student and link it to their student record." />
      <CreateUserForm kind="students" students={students ?? []} />
    </div>
  );
}
