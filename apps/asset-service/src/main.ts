import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { configureApp, createLogger } from '@pbl6/service-kit';
import { AppModule } from './app.module';
import { AppEnv } from './config/env.validation';
import express from 'express';

async function bootstrap() {
  const logger = createLogger('asset-service');
  const app = await NestFactory.create(AppModule, { logger, bodyParser: false });
  app.use(express.json({ limit: '6mb' }));
  configureApp(app, { logger });
  const config = app.get<ConfigService<AppEnv, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
