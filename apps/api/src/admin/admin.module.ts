import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminService } from "./admin.service";
import { AdminStaffService } from "./admin-staff.service";
import { AdminController, PublicPlansController, PublicBrandingController } from "./admin.controller";
import { AdminStaffController } from "./admin-staff.controller";

@Module({
  imports: [PrismaModule],
  controllers: [AdminController, PublicPlansController, PublicBrandingController, AdminStaffController],
  providers: [AdminService, AdminStaffService],
})
export class AdminModule {}
