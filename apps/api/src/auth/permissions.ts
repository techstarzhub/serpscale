// -----------------------------------------------------------------------------
// Permission catalog — the single source of truth for RBAC.
// Everything (custom roles, permission-gated endpoints, the UI) reads from here.
// Adding a feature = add a permission here; nothing is hardcoded elsewhere.
// -----------------------------------------------------------------------------

export const PERMISSIONS = {
  // Projects / campaigns
  PROJECTS_VIEW: "projects.view", // view ALL campaigns in the org
  PROJECTS_VIEW_ASSIGNED: "projects.view_assigned", // view only the campaigns assigned to me
  PROJECTS_CREATE: "projects.create",
  PROJECTS_EDIT: "projects.edit",
  PROJECTS_DELETE: "projects.delete",

  // Clients (agency customers; some are white-label sub-agencies)
  CLIENTS_VIEW_ALL: "clients.view_all",
  CLIENTS_VIEW_ASSIGNED: "clients.view_assigned", // only clients of my assigned campaigns
  CLIENTS_CREATE: "clients.create",
  CLIENTS_EDIT: "clients.edit",
  CLIENTS_DELETE: "clients.delete",
  CLIENTS_ASSIGN_CAMPAIGNS: "clients.assign_campaigns",
  CLIENTS_SEND_REPORTS: "clients.send_reports",
  CLIENTS_MANAGE_AGENCY: "clients.manage_agency", // mark as agency client + its branding/members

  // Dashboard data tabs (view-level gates for the UI)
  OVERVIEW_VIEW: "overview.view",
  KEYWORDS_RESEARCH: "keywords.research",
  RANKS_VIEW: "ranks.view",
  COMPETITORS_VIEW: "competitors.view",
  TRAFFIC_VIEW: "traffic.view",
  BACKLINKS_VIEW: "backlinks.view",
  DOMAIN_VIEW: "domain.view",
  AI_VIEW: "ai.view",
  AI_COPILOT_VIEW: "copilot.view", // the AI SEO Copilot (chat + global widget)
  AUDIT_VIEW: "audit.view",
  AUDIT_RUN: "audit.run",
  REPORTS_GENERATE: "reports.generate",

  // Organization management (the purchasing admin)
  TEAM_VIEW: "team.view",
  TEAM_MANAGE: "team.manage", // invite / deactivate users
  ROLES_MANAGE: "roles.manage", // create custom roles + assign permissions
  BILLING_VIEW: "billing.view",
  BILLING_MANAGE: "billing.manage", // purchase / change plan
  SETTINGS_MANAGE: "settings.manage",
  INTEGRATIONS_MANAGE: "integrations.manage",

  // Platform level (SUPER ADMIN only)
  PLATFORM_ORGS_VIEW: "platform.orgs.view",
  PLATFORM_PLANS_MANAGE: "platform.plans.manage",
  PLATFORM_AUDIT_VIEW: "platform.audit.view",
  PLATFORM_TRANSACTIONS_VIEW: "platform.transactions.view",
  PLATFORM_GATEWAYS_MANAGE: "platform.gateways.manage",
  PLATFORM_SETTINGS_MANAGE: "platform.settings.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Grouped catalog for the "create custom role" UI (label + description per perm). */
export const PERMISSION_GROUPS: { group: string; items: { key: Permission; label: string }[] }[] = [
  {
    group: "Projects",
    items: [
      { key: PERMISSIONS.PROJECTS_VIEW, label: "View all projects" },
      { key: PERMISSIONS.PROJECTS_VIEW_ASSIGNED, label: "View assigned projects" },
      { key: PERMISSIONS.PROJECTS_CREATE, label: "Create projects" },
      { key: PERMISSIONS.PROJECTS_EDIT, label: "Edit projects" },
      { key: PERMISSIONS.PROJECTS_DELETE, label: "Delete projects" },
    ],
  },
  {
    group: "Clients",
    items: [
      { key: PERMISSIONS.CLIENTS_VIEW_ALL, label: "View all clients" },
      { key: PERMISSIONS.CLIENTS_VIEW_ASSIGNED, label: "View assigned clients" },
      { key: PERMISSIONS.CLIENTS_CREATE, label: "Add clients" },
      { key: PERMISSIONS.CLIENTS_EDIT, label: "Edit client details" },
      { key: PERMISSIONS.CLIENTS_DELETE, label: "Remove clients" },
      { key: PERMISSIONS.CLIENTS_ASSIGN_CAMPAIGNS, label: "Assign campaigns to clients" },
      { key: PERMISSIONS.CLIENTS_SEND_REPORTS, label: "Send campaign reports" },
      { key: PERMISSIONS.CLIENTS_MANAGE_AGENCY, label: "Manage agency clients & white-label" },
    ],
  },
  {
    group: "SEO data",
    items: [
      { key: PERMISSIONS.OVERVIEW_VIEW, label: "Overview dashboard" },
      { key: PERMISSIONS.KEYWORDS_RESEARCH, label: "Keyword research" },
      { key: PERMISSIONS.RANKS_VIEW, label: "Rank tracker" },
      { key: PERMISSIONS.COMPETITORS_VIEW, label: "Competitors" },
      { key: PERMISSIONS.TRAFFIC_VIEW, label: "Traffic (Analytics)" },
      { key: PERMISSIONS.BACKLINKS_VIEW, label: "Backlinks" },
      { key: PERMISSIONS.DOMAIN_VIEW, label: "Domain analytics" },
      { key: PERMISSIONS.AI_VIEW, label: "AI visibility" },
      { key: PERMISSIONS.AI_COPILOT_VIEW, label: "AI Copilot" },
      { key: PERMISSIONS.AUDIT_VIEW, label: "View site audit" },
      { key: PERMISSIONS.AUDIT_RUN, label: "Run site audit" },
      { key: PERMISSIONS.REPORTS_GENERATE, label: "Generate reports" },
    ],
  },
  {
    group: "Organization",
    items: [
      { key: PERMISSIONS.TEAM_VIEW, label: "View team" },
      { key: PERMISSIONS.TEAM_MANAGE, label: "Manage team (invite users)" },
      { key: PERMISSIONS.ROLES_MANAGE, label: "Manage roles & permissions" },
      { key: PERMISSIONS.BILLING_VIEW, label: "View billing" },
      { key: PERMISSIONS.BILLING_MANAGE, label: "Manage billing & plan" },
      { key: PERMISSIONS.INTEGRATIONS_MANAGE, label: "Manage integrations" },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: "Manage settings" },
    ],
  },
];

const ALL_PERMS = Object.values(PERMISSIONS) as Permission[];
const PLATFORM_PERMS = ALL_PERMS.filter((p) => p.startsWith("platform."));
const ORG_PERMS = ALL_PERMS.filter((p) => !p.startsWith("platform."));

// Client-portal users: read-only access to their own client's campaigns + reports.
// (Their campaigns are scoped by role in ProjectsService, not by projects.view.)
const CLIENT_PERMS: Permission[] = [
  PERMISSIONS.PROJECTS_VIEW,
  PERMISSIONS.OVERVIEW_VIEW,
  PERMISSIONS.RANKS_VIEW,
  PERMISSIONS.COMPETITORS_VIEW,
  PERMISSIONS.TRAFFIC_VIEW,
  PERMISSIONS.BACKLINKS_VIEW,
  PERMISSIONS.DOMAIN_VIEW,
  PERMISSIONS.AI_VIEW,
  PERMISSIONS.AUDIT_VIEW,
  PERMISSIONS.REPORTS_GENERATE,
];

// Built-in roles → their permission sets.
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // Platform owner — ONLY platform management. Deliberately NO campaign/project
  // permissions: the super admin runs the software, not customer campaigns.
  SUPER_ADMIN: PLATFORM_PERMS,
  // The purchasing customer admin — every org-level permission, no platform powers.
  ADMIN: ORG_PERMS,
  // Default member — safe view-only baseline until given a custom role.
  // Sees only campaigns explicitly assigned to them (not the whole org).
  MEMBER: [
    PERMISSIONS.PROJECTS_VIEW_ASSIGNED,
    PERMISSIONS.OVERVIEW_VIEW,
    PERMISSIONS.RANKS_VIEW,
    PERMISSIONS.TRAFFIC_VIEW,
    PERMISSIONS.BACKLINKS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  // Client-portal user — read-only, scoped to their client's campaigns.
  CLIENT: CLIENT_PERMS,
};

export { ALL_PERMS, PLATFORM_PERMS, ORG_PERMS, CLIENT_PERMS };
