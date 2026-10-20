import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, Settings2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { AuthHeading, AuthShell } from "@/features/auth/auth-shell";
import { getAuthState, type AccountProblem } from "@/lib/auth/dal";
import { ROLE_HOME } from "@/lib/auth/roles";
import { studentRegistrationEnabled } from "@/lib/features";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login" };

const PROBLEM_COPY: Record<AccountProblem, { title: string; body: string }> = {
  no_profile: {
    title: "Your account is not set up yet",
    body: "You are signed in, but this account has no WUPCare role assigned. Ask the clinic administrator to finish setting up your account.",
  },
  inactive: {
    title: "This account is deactivated",
    body: "Ask the clinic administrator to reactivate it if you still need access.",
  },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const confirmFailed = sp.error === "confirm";
  const registration = studentRegistrationEnabled();
  const state = await getAuthState();
  if (state.status === "ok") redirect(ROLE_HOME[state.user.role]);

  const configured = isSupabaseConfigured();

  return (
    <AuthShell>
      <div className="grid gap-7">
        {state.status === "blocked" ? (
          <BlockedAccount problem={state.problem} email={state.email} />
        ) : (
          <>
            <AuthHeading title="Welcome Back" description="Login to access your WUPCare account." />

            {!configured ? (
              <Alert>
                <Settings2 />
                <AlertTitle>Supabase is not configured</AlertTitle>
                <AlertDescription>
                  Copy <code className="font-mono text-xs">.env.example</code>{" "}
                  to <code className="font-mono text-xs">.env.local</code> and
                  add the project URL and publishable key, then restart the
                  dev server.
                </AlertDescription>
              </Alert>
            ) : null}

            {confirmFailed ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>
                  The confirmation link is invalid or has expired. Log in if you already confirmed, or register again.
                </AlertDescription>
              </Alert>
            ) : null}

            <LoginForm disabled={!configured} />

            <div className="grid gap-1.5 border-t pt-5 text-sm">
              {registration ? (
                <p className="text-muted-foreground">
                  New student?{" "}
                  <Link href="/register" className="font-medium text-primary hover:underline">
                    Create an account
                  </Link>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  New student? Student sign-up is temporarily unavailable.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Clinic personnel and administrator accounts are created by the clinic administrator.
              </p>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}

function BlockedAccount({
  problem,
  email,
}: {
  problem: AccountProblem;
  email: string;
}) {
  const copy = PROBLEM_COPY[problem];

  return (
    <div className="grid gap-5">
      <Alert>
        <CircleAlert />
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription>{copy.body}</AlertDescription>
      </Alert>
      {email ? (
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{email}</span>
        </p>
      ) : null}
      <form action={logout}>
        <Button type="submit" variant="outline" size="lg" className="h-11 w-full">
          Log out
        </Button>
      </form>
    </div>
  );
}
