import { SetMetadata } from "@nestjs/common";
import type { Permission } from "../permissions";

export const PERMISSIONS_KEY = "required_permissions";

/** Gate an endpoint: caller must hold ALL listed permissions. */
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS_KEY, perms);
