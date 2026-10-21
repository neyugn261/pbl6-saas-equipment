import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { CurrentUser, Public, type Principal } from '@pbl6/auth';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  ClientContext,
  LoginResult,
  TokenPair,
  UserProfile,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

function clientContext(request: Request): ClientContext {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip?.slice(0, 64) ?? null,
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto, @Req() request: Request): Promise<LoginResult> {
    return this.auth.login(body, clientContext(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body() body: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken, clientContext(request));
  }

  /** Takes the refresh token so a client can log out after its access token expired. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() body: RefreshTokenDto): Promise<void> {
    return this.auth.logout(body.refreshToken);
  }

  /** Requires a bearer token (global JwtAuthGuard from @pbl6/auth). */
  @Get('me')
  me(@CurrentUser() principal: Principal): Promise<UserProfile> {
    return this.auth.me(principal);
  }
}
