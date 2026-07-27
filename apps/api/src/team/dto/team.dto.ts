import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateRoleDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsArray() @IsString({ each: true }) permissions!: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}

export class InviteMemberDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() customRoleId?: string;
  // "ADMIN" makes the invitee a full org admin; otherwise they're a MEMBER.
  @IsOptional() @IsIn(["ADMIN", "MEMBER"]) role?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72) password?: string;
}

export class UpdateMemberDto {
  @IsOptional() @IsString() customRoleId?: string | null;
  @IsOptional() @IsIn(["ADMIN", "MEMBER"]) role?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignProjectsDto {
  @IsArray() @IsString({ each: true }) projectIds!: string[];
}
