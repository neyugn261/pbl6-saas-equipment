import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import type { Request, Response, NextFunction } from 'express';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import type { AppEnv } from '../config/env.validation.js';

function buildProxy(target: string, pathPrefix: string, upstreamPrefix = '') {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // Nest mounts middleware on a route and Express shortens req.url. Use the
    // original URL so the complete upstream path and query string survive.
    pathRewrite: (_path, req) => {
      const originalUrl = (req as Request).originalUrl ?? _path;
      const suffix = originalUrl.slice(pathPrefix.length);
      if (!suffix) return upstreamPrefix || '/';
      return `${upstreamPrefix}${suffix.startsWith('?') && !upstreamPrefix ? '/' : ''}${suffix}`;
    },
    onProxyReq: (proxyReq: ClientRequest, req: IncomingMessage) => {
      const expressReq = req as Request;
      const authorization = expressReq.headers.authorization;
      if (authorization) proxyReq.setHeader('Authorization', authorization);
      const correlationId = expressReq.headers['x-correlation-id'];
      if (correlationId) {
        proxyReq.setHeader(
          'x-correlation-id',
          Array.isArray(correlationId) ? correlationId[0] : correlationId,
        );
      }
      // Nest's JSON parser has already consumed POST/PATCH bodies by this point.
      fixRequestBody(proxyReq, req);
    },
    onError: (
      _err: Error,
      _req: IncomingMessage,
      res: ServerResponse | Response,
    ) => {
      const expressRes = res as Response;
      if (!expressRes.headersSent) {
        expressRes.status(502).json({
          code: 'BAD_GATEWAY',
          message: 'Upstream service unavailable',
        });
      }
    },
  });
}

@Injectable()
export class IdentityProxyMiddleware implements NestMiddleware {
  private readonly proxy: ReturnType<typeof createProxyMiddleware>;
  constructor(config: ConfigService<AppEnv, true>) {
    this.proxy = buildProxy(
      config.get('IDENTITY_SERVICE_URL', { infer: true }),
      '/api/identity',
    );
  }
  use(req: Request, res: Response, next: NextFunction): void {
    this.proxy(req, res, next);
  }
}

/** Optional alias: /api/auth/* -> identity-service /auth/* */
@Injectable()
export class AuthAliasProxyMiddleware implements NestMiddleware {
  private readonly proxy: ReturnType<typeof createProxyMiddleware>;
  constructor(config: ConfigService<AppEnv, true>) {
    this.proxy = buildProxy(
      config.get('IDENTITY_SERVICE_URL', { infer: true }),
      '/api',
    );
  }
  use(req: Request, res: Response, next: NextFunction): void {
    this.proxy(req, res, next);
  }
}

@Injectable()
export class OrganizationProxyMiddleware implements NestMiddleware {
  private readonly proxy: ReturnType<typeof createProxyMiddleware>;
  constructor(config: ConfigService<AppEnv, true>) {
    this.proxy = buildProxy(
      config.get('ORGANIZATION_SERVICE_URL', { infer: true }),
      '/api/organization',
    );
  }
  use(req: Request, res: Response, next: NextFunction): void {
    this.proxy(req, res, next);
  }
}

@Injectable()
export class AssetProxyMiddleware implements NestMiddleware {
  private readonly proxy: ReturnType<typeof createProxyMiddleware>;
  constructor(config: ConfigService<AppEnv, true>) {
    this.proxy = buildProxy(
      config.get('ASSET_SERVICE_URL', { infer: true }),
      '/api/assets',
    );
  }
  use(req: Request, res: Response, next: NextFunction): void {
    this.proxy(req, res, next);
  }
}

@Injectable()
export class ServiceRequestProxyMiddleware implements NestMiddleware {
  private readonly proxy: ReturnType<typeof createProxyMiddleware>;
  constructor(config: ConfigService<AppEnv, true>) {
    this.proxy = buildProxy(
      config.get('SERVICE_REQUEST_SERVICE_URL', { infer: true }),
      '/api/service-requests',
      '/service-requests',
    );
  }
  use(req: Request, res: Response, next: NextFunction): void {
    this.proxy(req, res, next);
  }
}

@Injectable()
export class WorkorderProxyMiddleware implements NestMiddleware {
  private readonly proxy: ReturnType<typeof createProxyMiddleware>;
  constructor(config: ConfigService<AppEnv, true>) {
    this.proxy = buildProxy(
      config.get('WORKORDER_SERVICE_URL', { infer: true }),
      '/api/workorders',
    );
  }
  use(req: Request, res: Response, next: NextFunction): void {
    this.proxy(req, res, next);
  }
}

@Injectable()
export class MaintenanceProxyMiddleware implements NestMiddleware {
  private readonly proxy: ReturnType<typeof createProxyMiddleware>;
  constructor(config: ConfigService<AppEnv, true>) {
    this.proxy = buildProxy(
      config.get('MAINTENANCE_SERVICE_URL', { infer: true }),
      '/api/maintenance',
    );
  }
  use(req: Request, res: Response, next: NextFunction): void {
    this.proxy(req, res, next);
  }
}

@Injectable()
export class InventoryProxyMiddleware implements NestMiddleware {
  private readonly proxy: ReturnType<typeof createProxyMiddleware>;
  constructor(config: ConfigService<AppEnv, true>) {
    this.proxy = buildProxy(
      config.get('INVENTORY_SERVICE_URL', { infer: true }),
      '/api/inventory',
    );
  }
  use(req: Request, res: Response, next: NextFunction): void {
    this.proxy(req, res, next);
  }
}

@Injectable()
export class NotificationProxyMiddleware implements NestMiddleware {
  private readonly proxy: ReturnType<typeof createProxyMiddleware>;
  constructor(config: ConfigService<AppEnv, true>) {
    this.proxy = buildProxy(
      config.get('NOTIFICATION_SERVICE_URL', { infer: true }),
      '/api/notifications',
    );
  }
  use(req: Request, res: Response, next: NextFunction): void {
    this.proxy(req, res, next);
  }
}
