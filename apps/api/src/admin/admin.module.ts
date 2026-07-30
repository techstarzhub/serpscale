import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminService } from "./admin.service";
import { AdminController, PublicPlansController, PublicBrandingController } from "./admin.controller";

@Module({
  imports: [PrismaModule],
  controllers: [AdminController, PublicPlansController, PublicBrandingController],
  providers: [AdminService],
})
export class AdminModule {}
