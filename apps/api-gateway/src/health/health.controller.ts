import { Controller, Get } from '@nestjs/common';

/**
 * Health endpoint for liveness probes and load-balancer checks.
 *
 * GET /health → 200 { status: 'ok', version: string }
 *
 * MVP: always returns ok — upstream availability is not aggregated here.
 * In a production hardening pass this can be extended with per-service
 * HTTP checks using @nestjs/terminus.
 */
@Controller('health')
export class HealthController {
  private readonly version: string;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json') as { version: string };
    this.version = pkg.version;
  }

  @Get()
  check(): {
    status: string;
    version: string;
    services: Record<string, string>;
  } {
    return {
      status: 'ok',
      version: this.version,
      services: {
        identity: 'unknown',
        organization: 'unknown',
        asset: 'unknown',
        'service-request': 'unknown',
        workorder: 'unknown',
        maintenance: 'unknown',
        inventory: 'unknown',
        notification: 'unknown',
      },
    };
  }
}
