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
}
