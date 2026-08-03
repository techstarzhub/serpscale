import { IsArray, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  domain!: string;

  // Dashboards active for this campaign (project detail tab keys). Empty = all.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledTabs?: string[];

  // Connected Google account (email) to source GSC/GA4/GMB data from. Empty/absent
  // = auto-detect by domain across every connected account.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  googleAccountEmail?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  // Dashboards active for this campaign (project detail tab keys). Empty = all.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledTabs?: string[];

  // Connected Google account (email) to source GSC/GA4/GMB data from. Empty
  // string clears the choice (back to auto-detect by domain).
  @IsOptional()
  @IsString()
  @MaxLength(255)
  googleAccountEmail?: string;
}
