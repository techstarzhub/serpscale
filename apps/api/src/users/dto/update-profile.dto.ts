import { IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

// Per-user dashboard theme: a map of CSS token -> raw value (all dynamic tokens,
// never hardcoded) plus the light/dark mode. Persisted so it follows the user
// across devices.
export class SaveThemeDto {
  @IsOptional()
  @IsObject()
  themeOverrides?: Record<string, string>;

  @IsOptional()
  @IsIn(["light", "dark"])
  mode?: "light" | "dark";
}

// First-login onboarding: sets the user's own password (no current password
// required — they are already authenticated with the temp one), name, avatar
// (uploaded separately) and initial theme, then marks onboarding complete.
export class CompleteOnboardingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;

  @IsOptional()
  @IsObject()
  themeOverrides?: Record<string, string>;

  @IsOptional()
  @IsIn(["light", "dark"])
  mode?: "light" | "dark";
}
