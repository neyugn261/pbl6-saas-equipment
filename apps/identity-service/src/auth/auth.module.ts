import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { IdentityEnv } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<IdentityEnv, true>) => {
        const options = {
          algorithm: 'HS256' as const,
          issuer: config.get('JWT_ISSUER', { infer: true }),
          audience: config.get('JWT_AUDIENCE', { infer: true }),
        };
        return {
          secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
          signOptions: {
            ...options,
            expiresIn: config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
          },
          verifyOptions: {
            algorithms: [options.algorithm],
            issuer: options.issuer,
            audience: options.audience,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    PasswordService,
    TokenService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
