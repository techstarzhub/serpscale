import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class SignupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Signup intent from the pricing page: which plan they picked, the keyword tier,
  // and whether they chose the free trial vs a paid subscription.
  @IsOptional() @IsString() plan?: string;
  @IsOptional() @IsInt() keywords?: number;
  @IsOptional() @IsBoolean() trial?: boolean;
}
