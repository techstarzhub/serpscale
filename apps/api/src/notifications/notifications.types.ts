export interface NotifTypeDef {
  key: string;
  group: string;
  label: string;
  description: string;
  defaults: { inApp: boolean; email: boolean };
  // When set, only users holding this permission see (and can toggle) the type —
  // so admin-only notifications never appear on a member/client's side.
  permission?: string;
}

// The catalog of notification types users can toggle. Adding a type here makes it
// appear in the preferences UI automatically (single source of truth).
export const NOTIFICATION_TYPES: NotifTypeDef[] = [
  { key: "audit_complete", group: "SEO", label: "Site audit finished", description: "When a crawl / audit you started completes.", defaults: { inApp: true, email: false } },
  { key: "rank_change", group: "SEO", label: "Significant ranking changes", description: "When a tracked keyword moves up or down a lot.", defaults: { inApp: true, email: false } },
  { key: "report_sent", group: "SEO", label: "Client report sent", description: "When a report is emailed to a client.", defaults: { inApp: true, email: false }, permission: "clients.send_reports" },
  { key: "team", group: "Account", label: "Team & access", description: "Invites, role changes and campaign assignments.", defaults: { inApp: true, email: true } },
  { key: "billing", group: "Account", label: "Billing & subscription", description: "Payments, renewals and plan changes.", defaults: { inApp: true, email: true }, permission: "billing.view" },
  { key: "system", group: "Account", label: "Product & account updates", description: "Important account and product notices.", defaults: { inApp: true, email: false } },
];

export type NotifType = (typeof NOTIFICATION_TYPES)[number]["key"];
