import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, OtpService, JwtStrategy],
  // Exported so other modules (users onboarding, team invite) can mint sessions
  // and one-click login links.
  exports: [AuthService],
})
export class AuthModule {}
