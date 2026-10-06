import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalDateTime, toLocalDateTime } from '../utils/date.util';

/**
 * Reloj de la aplicación. Centraliza "ahora" y la zona horaria para que la
 * lógica de negocio sea determinística en las pruebas.
 */
@Injectable()
export class ClockService {
  constructor(private readonly config: ConfigService) {}

  get timeZone(): string {
    return this.config.get<string>('APP_TIMEZONE') ?? 'America/Bogota';
  }

  now(): Date {
    return new Date();
  }

  local(date: Date = this.now()): LocalDateTime {
    return toLocalDateTime(date, this.timeZone);
  }

  today(): string {
    return this.local().fecha;
  }
}
