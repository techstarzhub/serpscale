import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class InviteStaffDto {
  @IsEmail() @MaxLength(160) email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsString() @MaxLength(200) password?: string;
}

export class UpdateStaffDto {
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
