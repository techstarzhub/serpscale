import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class SignupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
