import {
  DynamicModule,
  Global,
  Module,
  type ModuleMetadata,
  type Provider,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, PermissionsGuard } from './guards';
import type { JwtVerificationOptions } from './jwt-options';
import { AccessTokenVerifier } from './verifier';

export const JWT_VERIFICATION_OPTIONS = Symbol('JWT_VERIFICATION_OPTIONS');

export interface AuthModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: any[];
  useFactory: (
    ...deps: any[]
  ) => JwtVerificationOptions | Promise<JwtVerificationOptions>;
  /**
   * Registers `JwtAuthGuard` + `PermissionsGuard` as global guards (default
   * true): every route then needs a token unless marked `@Public()`.
   */
  globalGuards?: boolean;
}

/**
 * ```ts
 * AuthModule.forRootAsync({
 *   inject: [ConfigService],
 *   useFactory: (config: ConfigService) => jwtOptionsFromConfig(config),
 * })
 * ```
 */
@Global()
@Module({})
export class AuthModule {
  static forRootAsync(options: AuthModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: JWT_VERIFICATION_OPTIONS,
        inject: options.inject ?? [],
        useFactory: options.useFactory,
      },
      {
        provide: AccessTokenVerifier,
        inject: [JWT_VERIFICATION_OPTIONS],
        useFactory: (jwt: JwtVerificationOptions) => new AccessTokenVerifier(jwt),
      },
      JwtAuthGuard,
      PermissionsGuard,
    ];
    if (options.globalGuards ?? true) {
      providers.push(
        { provide: APP_GUARD, useExisting: JwtAuthGuard },
        { provide: APP_GUARD, useExisting: PermissionsGuard },
      );
    }
    return {
      module: AuthModule,
      imports: options.imports ?? [],
      providers,
      exports: [AccessTokenVerifier, JwtAuthGuard, PermissionsGuard],
    };
  }
}
