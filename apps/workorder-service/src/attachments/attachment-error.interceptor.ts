import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NestInterceptor,
} from '@nestjs/common';
import { catchError } from 'rxjs';

/** SDK errors are sanitized by the storage adapter. Also prevent unexpected
 * Prisma stacks (which can contain object keys in query arguments) reaching
 * the shared error logger; keep the standard public error format. */
@Injectable()
export class AttachmentErrorInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new InternalServerErrorException({
          code: 'INTERNAL_ERROR',
          message: 'Attachment operation failed',
        });
      }),
    );
  }
}
