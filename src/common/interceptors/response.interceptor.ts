import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { STATUS_CODES } from 'http';
import { Observable, map } from 'rxjs';

export interface StandardResponse<T> {
  status: number;
  message: string;
  data: T;
  timestamp: string;
}

/**
 * Envuelve toda respuesta exitosa en el formato estándar:
 * { status, message, data, timestamp }
 * Los archivos (StreamableFile) y las respuestas 204 se envían sin envolver.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  StandardResponse<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<StandardResponse<T> | T> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile || response.statusCode === 204) {
          return data;
        }
        return {
          status: response.statusCode,
          message: STATUS_CODES[response.statusCode] ?? 'OK',
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
