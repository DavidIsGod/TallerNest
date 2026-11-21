import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'http';
import { QueryFailedError } from 'typeorm';
import { esGraphql } from '../utils/request.util';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

/**
 * Formato de error estándar de REST:
 * { status, error, message, timestamp, path }
 *
 * En GraphQL no se escribe ninguna respuesta HTTP: se devuelve la excepción y
 * Apollo la pone en el arreglo `errors` (con HTTP 200). El formato de ese
 * error lo define src/graphql/formatear-error-graphql.ts.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (esGraphql(host)) return exception;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message } = this.resolve(exception);

    response.status(status).json({
      status,
      error: STATUS_CODES[status] ?? 'Error',
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private resolve(exception: unknown): {
    status: number;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: string | string[] }).message
          : exception.message;
      return { status: exception.getStatus(), message };
    }

    if (exception instanceof QueryFailedError) {
      const code = (exception.driverError as { code?: string } | undefined)
        ?.code;
      if (code === PG_UNIQUE_VIOLATION) {
        return {
          status: HttpStatus.CONFLICT,
          message: 'El recurso ya existe (registro duplicado)',
        };
      }
      if (code === PG_FOREIGN_KEY_VIOLATION) {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'El recurso referenciado no existe',
        };
      }
    }

    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
    };
  }
}
