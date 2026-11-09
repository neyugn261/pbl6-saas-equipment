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
import { BranchAccessClient, BranchScopeGuard } from './branch-scope';

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
  /** Enables live primary-branch resolution on @BranchScoped routes. Uses the same inject list. */
  branchServiceUrl?: (...deps: any[]) => string;
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
    if (options.branchServiceUrl) {
      providers.push(
        {
          provide: BranchAccessClient,
          inject: options.inject ?? [],
          useFactory: (...deps: any[]) =>
            new BranchAccessClient(options.branchServiceUrl!(...deps)),
        },
        BranchScopeGuard,
      );
    }
    if (options.globalGuards ?? true) {
      providers.push(
        { provide: APP_GUARD, useExisting: JwtAuthGuard },
        { provide: APP_GUARD, useExisting: PermissionsGuard },
      );
      if (options.branchServiceUrl)
        providers.push({ provide: APP_GUARD, useExisting: BranchScopeGuard });
    }
    return {
      module: AuthModule,
      imports: options.imports ?? [],
      providers,
      exports: [AccessTokenVerifier, JwtAuthGuard, PermissionsGuard,
        ...(options.branchServiceUrl
          ? [BranchAccessClient, BranchScopeGuard]
          : []),
      ],
    };
  }
}
