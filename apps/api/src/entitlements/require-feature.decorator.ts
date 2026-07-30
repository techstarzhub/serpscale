import { SetMetadata } from "@nestjs/common";

export const FEATURE_KEY = "required_feature";

/** Gate an endpoint by plan feature: the caller's org plan must include this
 *  module key (see MODULE_CATALOG). Enforced by FeaturesGuard. */
export const RequireFeature = (key: string) => SetMetadata(FEATURE_KEY, key);
