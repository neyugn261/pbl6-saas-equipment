import {
  Controller,
  DynamicModule,
  Get,
  Inject,
  Module,
  ModuleMetadata,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from './public';

/** One dependency checked by `GET /health` (database, broker, ...). */
export interface HealthCheck {
  name: string;
  /** Resolves when the dependency is usable; rejects otherwise. */
  check(): Promise<void>;
}

export const HEALTH_CHECKS = Symbol('HEALTH_CHECKS');
const CHECK_TIMEOUT_MS = 2000;

type CheckState = 'up' | 'down';

async function run(check: HealthCheck): Promise<CheckState> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check.check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

@Controller('health')
export class HealthController {
  constructor(@Inject(HEALTH_CHECKS) private readonly checks: HealthCheck[]) {}

  /** `200 {status:'ok', <check>:'up'}`, or `503` with the failing check as `down`. */
  @Public()
  @Get()
  async check(): Promise<Record<string, string>> {
    const states = await Promise.all(this.checks.map(run));
    const result: Record<string, CheckState> = {};
    this.checks.forEach((check, index) => {
      result[check.name] = states[index];
    });
    if (states.includes('down')) {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'One or more dependencies are down',
        status: 'error',
        ...result,
      });
    }
    return { status: 'ok', ...result };
  }
}

export interface HealthModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: any[];
  useFactory: (...deps: any[]) => HealthCheck[] | Promise<HealthCheck[]>;
}

/**
 * ```ts
 * HealthModule.forRootAsync({
 *   inject: [PrismaService],
 *   useFactory: (prisma: PrismaService) => [prismaHealthCheck(prisma)],
 * })
 * ```
 */
@Module({})
export class HealthModule {
  static forRootAsync(options: HealthModuleAsyncOptions): DynamicModule {
    return {
      module: HealthModule,
      imports: options.imports ?? [],
      controllers: [HealthController],
      providers: [
        {
          provide: HEALTH_CHECKS,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
      ],
    };
  }
}
