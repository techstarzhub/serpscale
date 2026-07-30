import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { EntitlementsService } from "./entitlements.service";
import { FeaturesGuard } from "./features.guard";

/** Global so any module can inject EntitlementsService / use FeaturesGuard
 *  without re-importing. */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [EntitlementsService, FeaturesGuard],
  exports: [EntitlementsService, FeaturesGuard],
})
export class EntitlementsModule {}
