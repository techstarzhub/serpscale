import { Module } from "@nestjs/common";
import { AutofixService } from "./autofix.service";
import { AutofixController } from "./autofix.controller";
import { GithubConnectionService } from "./github-connection.service";
import { GithubConnectionController } from "./github-connection.controller";

// Audit → auto-fix PR loop + the per-campaign GitHub repo connection that powers
// it. PrismaModule is global, so no import needed here.
@Module({
  controllers: [AutofixController, GithubConnectionController],
  providers: [AutofixService, GithubConnectionService],
  exports: [AutofixService, GithubConnectionService],
})
export class AutofixModule {}
