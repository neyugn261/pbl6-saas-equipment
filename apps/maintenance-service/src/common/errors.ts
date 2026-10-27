import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
export const missing = () =>
  new NotFoundException({
    code: 'MAINTENANCE_NOT_FOUND',
    message: 'Maintenance resource not found',
  });
export const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });
export const invalid = (code: string, message: string) =>
  new UnprocessableEntityException({ code, message });
export const sameId = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();
