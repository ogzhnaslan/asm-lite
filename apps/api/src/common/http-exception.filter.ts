import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const res =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const body = typeof res === 'string' ? { message: res } : (res as object);

    // Bilinmeyen exception → konsola tam stack ile logla.
    // HttpException'lar zaten kontrollü; onları log'lamıyoruz.
    if (!(exception instanceof HttpException)) {
      const err = exception as Error;
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${err?.message ?? exception}`,
        err?.stack,
      );
    }

    response.status(status).json({
      ...body,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
