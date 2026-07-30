import { IsEmail, IsIn, IsString, Length, MinLength } from "class-validator";

export class VerifyOtpDto {
  @IsIn(["SIGNUP", "LOGIN"]) purpose!: "SIGNUP" | "LOGIN";
  @IsEmail() email!: string;
  @IsString() @Length(4, 8) code!: string;
}

export class ResendOtpDto {
  @IsIn(["SIGNUP", "LOGIN"]) purpose!: "SIGNUP" | "LOGIN";
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(10) token!: string;
  @IsString() @MinLength(8) password!: string;
}
