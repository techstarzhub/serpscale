import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { randomBytes } from "crypto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { StorageService } from "../storage/storage.service";
import { SupportService } from "./support.service";
import { CreateTicketDto, PostMessageDto, SetStatusDto } from "./dto/support.dto";

// Attachment types we accept in chat (images + common documents).
const ALLOWED = new Map<string, string>([
  ["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"], ["image/gif", "gif"], ["image/avif", "avif"],
  ["application/pdf", "pdf"], ["text/plain", "txt"], ["text/csv", "csv"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["application/zip", "zip"],
]);
const MEDIA_FOLDER = "support-media";

@UseGuards(JwtAuthGuard)
@Controller("support")
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly storage: StorageService,
  ) {}

  @Get("unread")
  unread(@CurrentUser() user: AuthUser) {
    return this.support.unreadCount(user);
  }

  @Get("tickets")
  list(@CurrentUser() user: AuthUser, @Query("scope") scope?: string) {
    return this.support.listTickets(user, scope === "inbox" ? "inbox" : "mine");
  }

  @Post("tickets")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.support.createTicket(user, dto);
  }

  @Get("tickets/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.support.getTicket(user, id);
  }

  @Post("tickets/:id/messages")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  message(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: PostMessageDto) {
    return this.support.postMessage(user, id, dto);
  }

  @Post("tickets/:id/read")
  read(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.support.markRead(user, id);
  }

  @Patch("tickets/:id")
  setStatus(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SetStatusDto) {
    return this.support.setStatus(user, id, dto.status);
  }

  // ---- media (R2) --------------------------------------------------------
  @Post("attachments")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } })) // 10MB
  async upload(@CurrentUser() _user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException("No file uploaded.");
    const ext = ALLOWED.get(file.mimetype);
    if (!ext) throw new BadRequestException("That file type isn't supported.");
    const name = `${randomBytes(16).toString("hex")}.${ext}`;
    const key = this.storage.key(MEDIA_FOLDER, name);
    await this.storage.put(key, file.buffer, file.mimetype);
    return {
      key,
      url: `/support/media/${name}`,
      name: file.originalname?.slice(0, 300) || name,
      contentType: file.mimetype,
      size: file.size,
    };
  }

  // Stream an attachment back (authenticated; filenames are server-generated and
  // unguessable). <img>/<a> to this URL send the session cookie automatically.
  @Get("media/:file")
  async media(@Param("file") file: string, @Res() res: Response) {
    if (!/^[a-f0-9]{32}\.[a-z0-9]{1,8}$/i.test(file)) throw new NotFoundException();
    const obj = await this.storage.getObject(this.storage.key(MEDIA_FOLDER, file));
    if (!obj) throw new NotFoundException();
    res.setHeader("Content-Type", obj.contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(obj.body);
  }
}
