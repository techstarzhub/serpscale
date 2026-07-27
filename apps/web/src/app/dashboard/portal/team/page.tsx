"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/components/providers/user-provider";
import { ClientMembers } from "@/components/clients/client-members";

// Client-owner self-service: manage the people in their own portal.
export default function PortalTeamPage() {
  const { user, loading } = useCurrentUser();

  if (loading) return null;
  if (!user || user.role !== "CLIENT" || !user.clientOwner || !user.clientId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          You don&apos;t have access to team management.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">My team</h2>
        <p className="text-sm text-muted-foreground">Invite people to view your reports. They get read-only access.</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>Everyone here sees the same campaigns and reports you do.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientMembers clientId={user.clientId} />
        </CardContent>
      </Card>
    </div>
  );
}
