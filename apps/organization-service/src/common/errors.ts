import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

/** 404 with a specific code; also used for rows outside the caller's scope. */
export function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message });
}

export function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

export function unprocessable(
  code: string,
  message: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message });
}
