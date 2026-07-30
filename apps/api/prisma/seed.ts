import "dotenv/config";
import { PrismaClient, Role, SubscriptionStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

// Seeds starting data. Everything here is editable later by the super admin -
// this only sets sensible initial values. Account credentials come from the
// environment (apps/api/.env), never hardcoded in source.
const prisma = new PrismaClient();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key}. Set it in apps/api/.env before seeding.`);
  return v;
}

async function upsertSetting(key: string, value: unknown) {
  await prisma.platformSetting.upsert({
    where: { key },
    update: { value: value as object },
    create: { key, value: value as object },
  });
}

async function main() {
  // ---- Plans (dynamic — super admin can edit prices, keyword tiers, features) ----
  // pricingTiers power the keyword dropdown on the marketing pricing page: the
  // lowest tier is the plan's default price; picking more keywords raises it.
  // Starter has no tiers (fixed price, no dropdown).
  // Features are stored as MODULE_CATALOG keys (see src/entitlements/
  // entitlements.catalog.ts) — the single source of truth that also drives the
  // admin plan-editor checkboxes and the dashboard gating. Display labels are
  // derived from the catalog, so nothing here is a hardcoded human string.
  // All paid plans include the FULL set; Starter omits the agency/AI modules.
  const ALL_FEATURES = [
    "keywords", "content", "ranks", "competitors", "traffic",
    "backlinks", "domain", "ai", "audit", "copilot",
    "white_label", "client_dashboards",
  ];
  // Starter (solo entry plan) omits: AI Copilot, content generator, and — since
  // it can't add clients — white-label reports and dedicated client dashboards.
  const STARTER_EXCLUDED = ["copilot", "content", "white_label", "client_dashboards"];
  const STARTER = ALL_FEATURES.filter((f) => !STARTER_EXCLUDED.includes(f));
  // Rule: team members (seats) and clients each equal the campaign count. Keyword
  // tiers are sized ~7 keywords per $1 so daily tracking keeps ≥80% margin. All of
  // this is DATA — the super admin can retune every number in the dashboard.
  const PLANS = [
    {
      name: "Starter", slug: "starter", priceCents: 500, sortOrder: 0,
      // Solo plan: 1 user (the owner), no team members and no clients to add.
      limits: { projects: 1, seats: 1, clients: 0, keywords: 35 },
      features: STARTER,
      pricingTiers: [] as { keywords: number; priceCents: number }[],
      trialDays: 7, // Starter offers a 7-day free trial.
    },
    {
      name: "Freelancer", slug: "freelancer", priceCents: 3500, sortOrder: 1,
      limits: { projects: 10, seats: 10, clients: 10, keywords: 250 },
      features: ALL_FEATURES,
      pricingTiers: [ { keywords: 250, priceCents: 3500 }, { keywords: 400, priceCents: 5500 }, { keywords: 600, priceCents: 8500 } ],
    },
    {
      // Agency and up get UNLIMITED campaigns / seats / clients — only keyword
      // tracking is metered. Omitting a limit key means "unlimited".
      name: "Agency", slug: "agency", priceCents: 12500, sortOrder: 2,
      limits: { keywords: 800 },
      features: ALL_FEATURES,
      pricingTiers: [ { keywords: 800, priceCents: 12500 }, { keywords: 1400, priceCents: 20000 }, { keywords: 2000, priceCents: 30000 } ],
    },
    {
      name: "Agency Plus", slug: "agency-plus", priceCents: 19500, sortOrder: 3,
      limits: { keywords: 1200 },
      features: ALL_FEATURES,
      pricingTiers: [ { keywords: 1200, priceCents: 19500 }, { keywords: 2400, priceCents: 35000 }, { keywords: 3600, priceCents: 55000 } ],
    },
    {
      name: "Enterprise", slug: "enterprise", priceCents: 70000, sortOrder: 4,
      limits: { keywords: 4500 },
      features: ALL_FEATURES,
      pricingTiers: [ { keywords: 4500, priceCents: 70000 }, { keywords: 8000, priceCents: 130000 }, { keywords: 13000, priceCents: 200000 } ],
    },
  ];
  let starterId = "";
  for (const p of PLANS) {
    const row = await prisma.plan.upsert({
      where: { slug: p.slug },
      update: { name: p.name, priceCents: p.priceCents, sortOrder: p.sortOrder, limits: p.limits, features: p.features, pricingTiers: p.pricingTiers, trialDays: (p as any).trialDays ?? null, isActive: true, isPublic: true },
      create: { name: p.name, slug: p.slug, priceCents: p.priceCents, sortOrder: p.sortOrder, limits: p.limits, features: p.features, pricingTiers: p.pricingTiers, trialDays: (p as any).trialDays ?? null },
    });
    if (p.slug === "starter") starterId = row.id;
  }
  // Retire any earlier default plans so they don't appear on the new pricing page.
  await prisma.plan.updateMany({ where: { slug: { in: ["free", "pro"] } }, data: { isActive: false, isPublic: false } });

  // ---- Super admin (platform owner) ----
  const superEmail = requireEnv("SEED_SUPERADMIN_EMAIL").toLowerCase();
  const superPassword = requireEnv("SEED_SUPERADMIN_PASSWORD");
  await prisma.user.upsert({
    where: { email: superEmail },
    update: { role: Role.SUPER_ADMIN, isActive: true },
    create: {
      email: superEmail,
      name: "Super Admin",
      passwordHash: await bcrypt.hash(superPassword, 12),
      role: Role.SUPER_ADMIN,
    },
  });

  // ---- Demo customer: an organization with an admin user on the Free plan ----
  const demoEmail = process.env.SEED_DEMO_EMAIL?.toLowerCase();
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (demoEmail && demoPassword) {
    const org = await prisma.organization.upsert({
      where: { slug: "demo" },
      update: {},
      create: { name: "Demo Workspace", slug: "demo" },
    });
    // Only set a plan on first creation — never override a plan the super admin
    // later assigned (so re-seeding won't reset a customer's subscription).
    await prisma.subscription.upsert({
      where: { orgId: org.id },
      update: {},
      create: { orgId: org.id, planId: starterId, status: SubscriptionStatus.ACTIVE },
    });
    await prisma.user.upsert({
      where: { email: demoEmail },
      update: { orgId: org.id },
      create: {
        email: demoEmail,
        name: "Demo User",
        passwordHash: await bcrypt.hash(demoPassword, 12),
        role: Role.ADMIN,
        orgId: org.id,
      },
    });
  }

  // ---- Platform settings (dynamic global config) ----
  await upsertSetting("branding", { productName: "SerpScale", supportEmail: "billing@serpscale.com" });
  await upsertSetting("signup", { enabled: true, defaultPlanSlug: "starter", trialDays: 14 });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
