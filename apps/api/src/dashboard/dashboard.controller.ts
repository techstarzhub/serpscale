import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { DashboardService } from "./dashboard.service";

// No permission gate here: the service scopes campaigns by role (same as GET /projects)
// and only includes metric blocks the user is allowed to see.
@UseGuards(JwtAuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser, @Query("days") days?: string) {
    return this.dashboard.summary(user, Number(days) || 28);
  }

  // AI-written motivational line for the welcome banner (cached one per day).
  @Get("quote")
  quote() {
    return this.dashboard.dailyQuote();
  }
}
