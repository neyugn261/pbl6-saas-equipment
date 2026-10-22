import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.validation.js';
import { configureGateway } from './gateway.setup.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const config = app.get<ConfigService<AppEnv, true>>(ConfigService);

  configureGateway(app, config);

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
