import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { PERMISSIONS, PLATFORM_PERMISSION_GROUPS } from "../auth/permissions";
import { AdminStaffService } from "./admin-staff.service";
import { InviteStaffDto, UpdateStaffDto } from "./dto/admin-staff.dto";

/** Super admin's platform team management. Gated by platform.staff.manage. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("admin/staff")
export class AdminStaffController {
  constructor(private readonly staff: AdminStaffService) {}

  /** Permission catalog for the staff picker (platform perms only). */
  @Get("permissions")
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  permissions() {
    return PLATFORM_PERMISSION_GROUPS;
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  list() {
    return this.staff.listStaff();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteStaffDto) {
    return this.staff.invite(user, dto);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(user, id, dto);
  }

  @Post(":id/reset-password")
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  resetPassword(@Param("id") id: string) {
    return this.staff.resetPassword(id);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.staff.remove(user, id);
  }
}
