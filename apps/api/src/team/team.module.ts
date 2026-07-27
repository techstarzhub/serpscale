import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TeamService } from "./team.service";
import { TeamController } from "./team.controller";

@Module({
  imports: [PrismaModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
