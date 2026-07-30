import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  orgId: string | null;
  // When set, this session is an admin impersonating another user — the value is
  // the real admin's id, used to "return to your account".
  impersonatorId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
