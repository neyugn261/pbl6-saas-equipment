import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { PermissionCode, UserType } from './catalog';
import type { Principal } from './principal';

export const REQUIRED_PERMISSIONS_KEY = 'pbl6:requiredPermissions';
export const ALLOWED_USER_TYPES_KEY = 'pbl6:allowedUserTypes';

/** The caller must hold EVERY listed permission (through its roles). */
export const RequirePermissions = (
  ...permissions: PermissionCode[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

/**
 * The caller's account type must be one of `types`, e.g. tenant endpoints
 * that Platform Admin must not call: `@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')`.
 */
export const AllowUserTypes = (
  ...types: UserType[]
): MethodDecorator & ClassDecorator => SetMetadata(ALLOWED_USER_TYPES_KEY, types);

export interface RequestWithPrincipal {
  headers: Record<string, string | string[] | undefined>;
  user?: Principal;
}

/** Injects the authenticated `Principal` set by `JwtAuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (!request.user) {
      // Only reachable on a @Public() route, which must not read the user.
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Missing bearer token',
      });
    }
    return request.user;
  },
);
