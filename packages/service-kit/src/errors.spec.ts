import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { toApiError } from './errors';
import { UpstreamError, UpstreamUnavailableError } from './http-client';

describe('toApiError', () => {
  it('keeps bodies that already carry a code', () => {
    expect(
      toApiError(new UnauthorizedException({ code: 'INVALID_ACCESS_TOKEN', message: 'Expired' })),
    ).toEqual({ status: 401, body: { code: 'INVALID_ACCESS_TOKEN', message: 'Expired' } });
  });

  it('maps validation errors to VALIDATION_FAILED with details', () => {
    expect(
      toApiError(new BadRequestException(['property tenantId should not exist'])),
    ).toEqual({
      status: 400,
      body: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: ['property tenantId should not exist'],
      },
    });
  });

  it('gives plain HTTP exceptions a default code', () => {
    expect(toApiError(new NotFoundException('Equipment not found'))).toEqual({
      status: 404,
      body: { code: 'NOT_FOUND', message: 'Equipment not found' },
    });
    expect(toApiError(new ForbiddenException()).body.code).toBe('FORBIDDEN');
  });

  it('hides unexpected errors behind a generic 500', () => {
    const result = toApiError(new Error('relation "users" does not exist'));
    expect(result).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('maps unique violations from Prisma to 409', () => {
    const error = Object.assign(new Error('Unique constraint failed'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });
    expect(toApiError(error)).toMatchObject({ status: 409, body: { code: 'UNIQUE_VIOLATION' } });
  });

  it('maps failures of other services without leaking their body', () => {
    expect(toApiError(new UpstreamUnavailableError('asset-service', new Error('ECONNREFUSED')))).toMatchObject({
      status: 503,
      body: { code: 'UPSTREAM_UNAVAILABLE' },
    });
    const upstream = toApiError(new UpstreamError('asset-service', 500, 'INTERNAL_ERROR', { secret: 1 }));
    expect(upstream.status).toBe(502);
    expect(JSON.stringify(upstream.body)).not.toContain('secret');
  });
});
