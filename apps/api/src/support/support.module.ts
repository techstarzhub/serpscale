import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SupportGateway } from "./support.gateway";

// Support desk: tickets + realtime chat. PrismaService, EmailService,
// PermissionsService and StorageService come from their global modules.
@Module({
  imports: [JwtModule.register({})],
  controllers: [SupportController],
  providers: [SupportService, SupportGateway],
})
export class SupportModule {}
