import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { IdentityEnv } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get<ConfigService<IdentityEnv, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
