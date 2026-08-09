import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsController } from "./integrations.controller";
import { GoogleService } from "./google.service";
import { GoogleTokenScheduler } from "./google-token.scheduler";

@Module({
  imports: [JwtModule.register({})],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, GoogleService, GoogleTokenScheduler],
  exports: [IntegrationsService, GoogleService],
})
export class IntegrationsModule {}
