import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsController } from "./integrations.controller";
import { GoogleService } from "./google.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, GoogleService],
  exports: [IntegrationsService, GoogleService],
})
export class IntegrationsModule {}
