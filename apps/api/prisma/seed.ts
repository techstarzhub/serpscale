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
  // ---- Plans (dynamic - super admin can edit prices, limits, features) ----
  const free = await prisma.plan.upsert({
    where: { slug: "free" },
    update: {},
    create: {
      name: "Free",
      slug: "free",
      priceCents: 0,
      sortOrder: 0,
      limits: { projects: 1, keywords: 50, crawlPagesPerMonth: 1000, rankChecksPerDay: 25, seats: 1 },
      features: { keywordResearch: true, rankTracker: true, siteAudit: true, backlinks: false },
    },
  });

  await prisma.plan.upsert({
    where: { slug: "pro" },
    update: {},
    create: {
      name: "Pro",
      slug: "pro",
      priceCents: 4900,
      sortOrder: 1,
      limits: { projects: 25, keywords: 5000, crawlPagesPerMonth: 100000, rankChecksPerDay: 2000, seats: 5 },
      features: { keywordResearch: true, rankTracker: true, siteAudit: true, backlinks: true },
    },
  });

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
    await prisma.subscription.upsert({
      where: { orgId: org.id },
      update: {},
      create: { orgId: org.id, planId: free.id, status: SubscriptionStatus.ACTIVE },
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
  await upsertSetting("branding", { productName: "SEO Platform", supportEmail: "" });
  await upsertSetting("signup", { enabled: true, defaultPlanSlug: "free", trialDays: 14 });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
