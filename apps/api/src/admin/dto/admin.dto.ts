import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class CreatePlanDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(60) slug?: string;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() interval?: string;
  @IsOptional() @IsObject() limits?: Record<string, unknown>;
  @IsOptional() @IsArray() features?: string[];
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

// Free-form settings blobs (super-admin only) — validated as objects, whitelisted.
export class SettingsBlobDto {
  [key: string]: unknown;
}
