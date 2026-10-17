import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@pbl6/service-kit';
import type { PermissionCode, UserType } from './catalog';
import {
  ALLOWED_USER_TYPES_KEY,
  REQUIRED_PERMISSIONS_KEY,
  type RequestWithPrincipal,
} from './decorators';
import { AccessTokenVerifier, bearerToken } from './verifier';

/**
 * Authentication: every route requires a valid access token unless it is
 * marked `@Public()`. Sets `request.user` to the `Principal`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessTokenVerifier) private readonly verifier: AccessTokenVerifier,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const header = request.headers.authorization;
    const token = bearerToken(Array.isArray(header) ? header[0] : header);
    if (!token) {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Missing bearer token',
      });
    }
    try {
      request.user = this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Access token is invalid or expired',
      });
    }
    return true;
  }
}

/**
 * Authorization: checks `@AllowUserTypes()` and `@RequirePermissions()` of the
 * handler and its controller. Runs after `JwtAuthGuard`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const targets = [context.getHandler(), context.getClass()];
    // A public route never needs a principal, even inside a protected controller.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const permissions = this.reflector
      .getAll<(PermissionCode[] | undefined)[]>(REQUIRED_PERMISSIONS_KEY, targets)
      .flat()
      .filter((value): value is PermissionCode => value !== undefined);
    const userTypes =
      this.reflector.getAllAndOverride<UserType[] | undefined>(
        ALLOWED_USER_TYPES_KEY,
        targets,
      ) ?? [];
    if (permissions.length === 0 && userTypes.length === 0) {
      return true;
    }
    const principal = context
      .switchToHttp()
      .getRequest<RequestWithPrincipal>().user;
    if (!principal) {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Missing bearer token',
      });
    }
    if (userTypes.length > 0 && !userTypes.includes(principal.userType)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'This account type cannot use this operation',
      });
    }
    const missing = permissions.filter((code) => !principal.permissions.has(code));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing permission',
        details: { required: missing },
      });
    }
    return true;
  }
}
