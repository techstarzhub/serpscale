import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class ContactDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;

  @IsEmail() @MaxLength(160)
  email!: string;

  @IsOptional() @IsString() @MaxLength(160)
  company?: string;

  @IsString() @IsNotEmpty() @MaxLength(5000)
  message!: string;

  // Captcha
  @IsString() @IsNotEmpty()
  captchaToken!: string;

  @IsString() @IsNotEmpty() @MaxLength(10)
  captchaAnswer!: string;

  // Honeypot — must stay empty (real users never see this field). Bounded so a
  // bot can't send an oversized payload through the silent-drop path.
  @IsOptional() @IsString() @MaxLength(200)
  website?: string;
}

// In-app support form. The user is authenticated, so name/email come from the
// session (no captcha, no honeypot) — only subject + message are submitted.
export class SupportDto {
  @IsOptional() @IsString() @MaxLength(160)
  subject?: string;

  @IsString() @IsNotEmpty() @MaxLength(5000)
  message!: string;
}

export class SubscribeDto {
  @IsEmail() @MaxLength(160)
  email!: string;

  @IsString() @IsNotEmpty()
  captchaToken!: string;

  @IsString() @IsNotEmpty() @MaxLength(10)
  captchaAnswer!: string;

  @IsOptional() @IsString()
  website?: string;
}
