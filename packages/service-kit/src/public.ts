import { SetMetadata } from '@nestjs/common';

/** Metadata key read by the authentication guard of `@pbl6/auth`. */
export const IS_PUBLIC_KEY = 'pbl6:isPublic';

/**
 * Marks a route or controller as reachable without an access token
 * (health checks, login). Every other route requires one.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
