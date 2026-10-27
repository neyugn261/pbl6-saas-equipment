import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppEnv } from './config/env.validation';
import { configureApp, createLogger } from '@pbl6/service-kit';

async function bootstrap() {
  const logger = createLogger('workorder-service');
  const app = await NestFactory.create(AppModule, { logger });
  configureApp(app, { logger });
  app.enableShutdownHooks();
  const config = app.get<ConfigService<AppEnv, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
