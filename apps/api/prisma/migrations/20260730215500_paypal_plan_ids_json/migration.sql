-- AlterTable: replace scalar PayPal plan-id columns with price-keyed JSON maps
-- (a plan with keyword tiers needs one PayPal plan per distinct price).
ALTER TABLE "Plan" ADD COLUMN     "paypalPlanIds" JSONB;
ALTER TABLE "Plan" ADD COLUMN     "paypalPlanIdsLive" JSONB;

-- Preserve already-cached sandbox plan ids under their base price key.
UPDATE "Plan"
SET "paypalPlanIds" = jsonb_build_object("priceCents"::text, "paypalPlanId")
WHERE "paypalPlanId" IS NOT NULL;

ALTER TABLE "Plan" DROP COLUMN "paypalPlanId";
ALTER TABLE "Plan" DROP COLUMN "paypalPlanIdLive";
