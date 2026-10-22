import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AppEnv } from '../config/env.validation.js';

type ServiceState = 'up' | 'down';

/** Readiness of the M1 service chain behind the public gateway. */
@Controller('health')
export class HealthController {
  private readonly version: string;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    const pkg = require('../../package.json') as { version: string };
    this.version = pkg.version;
  }

  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<{
    status: 'ok' | 'degraded';
    version: string;
    services: Record<string, ServiceState>;
  }> {
    const targets = {
      identity: this.config.get('IDENTITY_SERVICE_URL', { infer: true }),
      organization: this.config.get('ORGANIZATION_SERVICE_URL', {
        infer: true,
      }),
      asset: this.config.get('ASSET_SERVICE_URL', { infer: true }),
      'service-request': this.config.get('SERVICE_REQUEST_SERVICE_URL', {
        infer: true,
      }),
    };
    const results = await Promise.all(
      Object.entries(targets).map(async ([name, baseUrl]) => {
        try {
          const upstream = await fetch(new URL('/health', baseUrl), {
            signal: AbortSignal.timeout(1500),
            redirect: 'error',
          });
          return [name, upstream.ok ? 'up' : 'down'] as const;
        } catch {
          return [name, 'down'] as const;
        }
      }),
    );
    const services = Object.fromEntries(results) as Record<
      string,
      ServiceState
    >;
    const status = results.every(([, state]) => state === 'up')
      ? 'ok'
      : 'degraded';
    if (status === 'degraded') response.status(503);
    return { status, version: this.version, services };
  }
}
