import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { ProxyModule } from './proxy/proxy.module.js';
import { HealthModule } from './health/health.module.js';
import { InternalBlockMiddleware } from './proxy/internal-block.middleware.js';
import { CorrelationIdMiddleware } from './proxy/correlation-id.middleware.js';
import {
  IdentityProxyMiddleware,
  AuthAliasProxyMiddleware,
  PlatformProxyMiddleware,
  OrganizationProxyMiddleware,
  AssetProxyMiddleware,
  ServiceRequestProxyMiddleware,
  EstimateProxyMiddleware,
  WorkorderProxyMiddleware,
  MaintenanceProxyMiddleware,
  InventoryProxyMiddleware,
  NotificationProxyMiddleware,
} from './proxy/proxy.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Service-local .env first, then the monorepo root .env.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    ProxyModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 1. Correlation-id — runs on all routes
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');

    // 2. Block /internal/* — runs BEFORE proxy to prevent leaking internal endpoints
    consumer.apply(InternalBlockMiddleware).forRoutes('*');

    // 3. Per-service proxy middlewares
    consumer
      .apply(IdentityProxyMiddleware)
      .forRoutes({ path: 'api/identity/*path', method: RequestMethod.ALL });

    consumer
      .apply(AuthAliasProxyMiddleware)
      .forRoutes({ path: 'api/auth/*path', method: RequestMethod.ALL });

    consumer
      .apply(PlatformProxyMiddleware)
      .forRoutes({ path: 'api/platform/*path', method: RequestMethod.ALL });

    consumer.apply(OrganizationProxyMiddleware).forRoutes({
      path: 'api/organization/*path',
      method: RequestMethod.ALL,
    });

    consumer
      .apply(AssetProxyMiddleware)
      .forRoutes({ path: 'api/assets/*path', method: RequestMethod.ALL });

    // M2 estimate-by-id routes are rooted at /estimates in the owning service.
    consumer
      .apply(EstimateProxyMiddleware)
      .forRoutes({ path: 'api/service-requests/estimates/*path', method: RequestMethod.ALL });

    consumer.apply(ServiceRequestProxyMiddleware).forRoutes(
      {
        path: 'api/service-requests',
        method: RequestMethod.ALL,
      },
      {
        path: 'api/service-requests/*path',
        method: RequestMethod.ALL,
      },
    );

    consumer
      .apply(WorkorderProxyMiddleware)
      .forRoutes({ path: 'api/workorders/*path', method: RequestMethod.ALL });

    consumer
      .apply(MaintenanceProxyMiddleware)
      .forRoutes({ path: 'api/maintenance/*path', method: RequestMethod.ALL });

    consumer
      .apply(InventoryProxyMiddleware)
      .forRoutes({ path: 'api/inventory/*path', method: RequestMethod.ALL });

    consumer.apply(NotificationProxyMiddleware).forRoutes({
      path: 'api/notifications/*path',
      method: RequestMethod.ALL,
    });
  }
}
