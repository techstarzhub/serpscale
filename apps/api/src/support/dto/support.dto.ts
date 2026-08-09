import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class AttachmentDto {
  @IsString() @MaxLength(512) key!: string;
  @IsString() @MaxLength(2048) url!: string;
  @IsString() @MaxLength(300) name!: string;
  @IsString() @MaxLength(150) contentType!: string;
  @IsOptional() @IsNumber() size?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() height?: number;
}

export class CreateTicketDto {
  // Optional — when omitted the title is derived from the first message.
  @IsOptional() @IsString() @MaxLength(160) subject?: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) message!: string;
  @IsOptional() @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"]) priority?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentDto) attachments?: AttachmentDto[];
}

export class PostMessageDto {
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentDto) attachments?: AttachmentDto[];
}

export class SetStatusDto {
  @IsIn(["OPEN", "PENDING", "CLOSED"]) status!: "OPEN" | "PENDING" | "CLOSED";
}
