import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PermissionsService } from "./permissions.service";
import { PermissionsGuard } from "./guards/permissions.guard";
import { AuditService } from "./audit.service";

/**
 * Global RBAC module — PermissionsService, PermissionsGuard and AuditService are
 * available everywhere without per-module imports.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [PermissionsService, PermissionsGuard, AuditService],
  exports: [PermissionsService, PermissionsGuard, AuditService],
})
export class AuthzModule {}
