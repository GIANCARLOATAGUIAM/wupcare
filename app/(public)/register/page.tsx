import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeading, AuthShell } from "@/features/auth/auth-shell";
import { getAuthState } from "@/lib/auth/dal";
import { ROLE_HOME } from "@/lib/auth/roles";
import { studentRegistrationEnabled } from "@/lib/features";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create student account" };

// SYSTEM_SPEC §8.10. Students only; staff and administrator accounts are
// created by the administrator.
export default async function RegisterPage() {
  if (!studentRegistrationEnabled()) notFound();
  const state = await getAuthState();
  if (state.status === "ok") redirect(ROLE_HOME[state.user.role]);

  return (
    <AuthShell>
      <div className="grid gap-7">
        <AuthHeading
          title="Create Student Account"
          description="Register to access WUPCare student services."
        />
        <p className="-mt-3 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">
          For enrolled students only. Use your own name and Student ID as they appear on your school records. The
          clinic may verify your details at your first visit.
        </p>
        <RegisterForm />
        <p className="border-t pt-5 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Login
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
