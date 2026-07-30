import { cookies } from "next/headers";
import { UserProvider } from "@/components/providers/user-provider";
import { ProjectsProvider } from "@/components/providers/projects-provider";
import { AuthGuard } from "@/components/providers/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { CopilotWidget } from "@/components/copilot/copilot-widget";
import { ThemeSync } from "@/components/theme/theme-sync";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Read the sidebar preference on the SERVER so the first paint already has the
  // correct width — no client flash / layout shift on reload.
  const collapsed = (await cookies()).get("sidebar-collapsed")?.value === "1";
  return (
    <UserProvider>
      <ThemeSync />
      <AuthGuard>
        <ConfirmProvider>
          <OnboardingGate>
            <ProjectsProvider>
              <AppShell initialCollapsed={collapsed}>{children}</AppShell>
              <CopilotWidget />
            </ProjectsProvider>
          </OnboardingGate>
        </ConfirmProvider>
      </AuthGuard>
    </UserProvider>
  );
}
