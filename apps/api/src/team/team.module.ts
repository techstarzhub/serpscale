import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TeamService } from "./team.service";
import { TeamController } from "./team.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
