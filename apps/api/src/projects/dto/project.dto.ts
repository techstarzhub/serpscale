import { Transform } from "class-transformer";
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Length, MaxLength, Matches } from "class-validator";

// Dashboard tab keys that map to real tabs on the campaign detail page. Kept in
// sync with the client (web: lib/campaign-validation.ts) and ProjectsService.
export const VALID_TABS = [
  "overview", "copilot", "keywords", "content", "ranks",
  "competitors", "traffic", "backlinks", "domain", "ai", "audit",
] as const;

// A registrable public domain: one or more DNS labels + a 2+ letter TLD. The raw
// input is normalised first (protocol / path / case stripped), so
// "https://WWW.Example.com/pricing" validates as "www.example.com".
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;

const normalizeDomain = (v: unknown): unknown =>
  typeof v === "string"
    ? v.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/\/+$/, "").toLowerCase()
    : v;

const trimmed = (v: unknown): unknown => (typeof v === "string" ? v.trim() : v);

export class CreateProjectDto {
  @Transform(({ value }) => trimmed(value))
  @IsString()
  @IsNotEmpty({ message: "Campaign name is required." })
  @Length(2, 120, { message: "Campaign name must be 2–120 characters." })
  name!: string;

  @Transform(({ value }) => normalizeDomain(value))
  @IsString()
  @IsNotEmpty({ message: "Domain is required." })
  @MaxLength(253, { message: "Domain is too long." })
  @Matches(DOMAIN_RE, { message: "Enter a valid domain like example.com (no http:// or paths)." })
  domain!: string;

  // Dashboards active for this campaign (project detail tab keys). Empty = all.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(VALID_TABS as unknown as string[], { each: true, message: "Unknown dashboard selected." })
  enabledTabs?: string[];

  // Default connected Google account (email) to source GSC/GA4/GMB data from.
  // Empty/absent = auto-detect by domain across every connected account.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  googleAccountEmail?: string;

  // Per-service overrides of the default account. Empty/absent = use the default.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  gscAccountEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  gaAccountEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  gmbAccountEmail?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @Transform(({ value }) => trimmed(value))
  @IsString()
  @IsNotEmpty({ message: "Campaign name cannot be empty." })
  @Length(2, 120, { message: "Campaign name must be 2–120 characters." })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeDomain(value))
  @IsString()
  @IsNotEmpty({ message: "Domain cannot be empty." })
  @MaxLength(253, { message: "Domain is too long." })
  @Matches(DOMAIN_RE, { message: "Enter a valid domain like example.com (no http:// or paths)." })
  domain?: string;

  // Dashboards active for this campaign (project detail tab keys). Empty = all.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(VALID_TABS as unknown as string[], { each: true, message: "Unknown dashboard selected." })
  enabledTabs?: string[];

  // Default connected Google account (email). Empty string clears the choice
  // (back to auto-detect by domain).
  @IsOptional()
  @IsString()
  @MaxLength(255)
  googleAccountEmail?: string;

  // Per-service overrides. Empty string clears the override (back to the default).
  @IsOptional()
  @IsString()
  @MaxLength(255)
  gscAccountEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  gaAccountEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  gmbAccountEmail?: string;
}
