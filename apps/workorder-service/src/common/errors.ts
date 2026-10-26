import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
export const missing = (code: string) =>
  new NotFoundException({ code, message: 'Resource not found' });
export const invalid = (code: string, message: string) =>
  new UnprocessableEntityException({ code, message });
export const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });
export const badInput = (message: string) =>
  new BadRequestException({ code: 'VALIDATION_FAILED', message });
/** Prisma contains uses SQL LIKE; search input is literal, not a wildcard. */
export const literalSearch = (value: string) =>
  value.replace(/[\\%_]/g, '\\$&');
