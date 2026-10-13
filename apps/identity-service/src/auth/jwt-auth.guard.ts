import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from './auth.types';
import { TokenService } from './token.service';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/** Requires a valid `Authorization: Bearer <access token>` header. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Missing bearer token',
      });
    }
    try {
      request.user = await this.tokens.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Access token is invalid or expired',
      });
    }
    return true;
  }
}
