"use client";

import { useCurrentUser } from "@/components/providers/user-provider";
import { OnboardingWizard } from "./onboarding-wizard";

/**
 * Shows the first-login onboarding wizard (over the dashboard) until the user
 * completes it. Applies to agency staff AND client-portal users — both render
 * inside the dashboard layout. Existing users and self-signup owners already
 * have `onboardedAt` set, so they never see it.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const needsOnboarding = !!user && !user.onboardedAt;
  return (
    <>
      {children}
      {!loading && needsOnboarding && <OnboardingWizard />}
    </>
  );
}
