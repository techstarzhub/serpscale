import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";

// Personal to the signed-in user — no permission gates, just authentication.
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Get("unread-count")
  async unread(@CurrentUser() user: AuthUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post(":id/read")
  read(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post("read-all")
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Delete()
  clear(@CurrentUser() user: AuthUser) {
    return this.notifications.clear(user.id);
  }

  @Get("preferences")
  prefs(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user);
  }

  @Put("preferences")
  setPrefs(@CurrentUser() user: AuthUser, @Body() dto: Record<string, { inApp?: boolean; email?: boolean }>) {
    return this.notifications.setPreferences(user, dto ?? {});
  }
}
