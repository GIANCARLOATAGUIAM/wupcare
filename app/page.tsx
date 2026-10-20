import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingPage } from "@/features/landing/landing-page";
import { getAuthState } from "@/lib/auth/dal";
import { ROLE_HOME } from "@/lib/auth/roles";
import { studentRegistrationEnabled } from "@/lib/features";

export const metadata: Metadata = {
  title: { absolute: "WUPCare · Student Health Records and Clinic Management" },
};

// Entry point. Signed-in users go to the home page for their role (the login
// action and /auth/confirm rely on this). Everyone else, including signed-in
// accounts that are blocked, sees the public landing page.
export default async function Home() {
  const state = await getAuthState();

  if (state.status === "ok") redirect(ROLE_HOME[state.user.role]);

  return <LandingPage registrationOpen={studentRegistrationEnabled()} />;
}
