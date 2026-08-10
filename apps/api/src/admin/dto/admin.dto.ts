import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreatePlanDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(60) slug?: string;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() interval?: string;
  @IsOptional() @IsObject() limits?: Record<string, unknown>;
  @IsOptional() @IsArray() features?: string[];
  @IsOptional() @IsArray() pricingTiers?: { keywords: number; priceCents: number }[];
  @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() interval?: string;
  @IsOptional() @IsObject() limits?: Record<string, unknown>;
  @IsOptional() @IsArray() features?: string[];
  @IsOptional() @IsArray() pricingTiers?: { keywords: number; priceCents: number }[];
  @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class RecordTransactionDto {
  @IsString() @MinLength(1) orgId!: string;
  @IsOptional() @IsString() planId?: string;
  @IsInt() @Min(0) amountCents!: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() gateway?: string;
  @IsOptional() @IsString() gatewayRef?: string;
}

export class SetActiveDto {
  @IsBoolean() isActive!: boolean;
}

// Update an org from the admin panel: suspend/activate, and/or assign a plan
// (with optional per-tenant limit overrides + status). All fields optional.
export class UpdateOrgDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() planId?: string; // "" / null clears the subscription
  @IsOptional() @IsIn(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"]) status?: string;
  @IsOptional() @IsObject() limitOverrides?: Record<string, unknown>;
}

// Grant an org a time-boxed trial of any plan (no payment). The subscription is
// set TRIALING with currentPeriodEnd = now + days; access is revoked automatically
// once that date passes (EntitlementsService), so the org must then subscribe.
export class GrantTrialDto {
  @IsString() @MinLength(1) planId!: string;
  @IsInt() @Min(1) @Max(365) days!: number;
  // Chosen keyword tier (from the plan's pricingTiers) → stored as a per-tenant
  // limitOverrides.keywords. Omit for fixed-price plans (falls back to plan limit).
  @IsOptional() @IsInt() @Min(1) keywords?: number;
}

// Create a brand-new org + its first admin from the platform panel, optionally
// on a plan (as a paid assignment or an N-day trial). The admin is emailed a
// sign-in link + temp credentials, exactly like a team invite.
export class CreateOrgDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEmail() adminEmail!: string;
  @IsOptional() @IsString() @MaxLength(80) adminName?: string;
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @IsBoolean() trial?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(365) trialDays?: number;
  // Chosen keyword tier for the plan (from pricingTiers). Optional.
  @IsOptional() @IsInt() @Min(1) keywords?: number;
}

// Free-form settings blobs (super-admin only) — validated as objects, whitelisted.
export class SettingsBlobDto {
  [key: string]: unknown;
}
