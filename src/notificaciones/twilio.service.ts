import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CanalNotificacion, EstadoNotificacion } from './enums';

export interface ResultadoEnvio {
  estado: EstadoNotificacion;
  canal: CanalNotificacion;
  destino: string;
  sid: string | null;
  estadoProveedor: string | null;
  error: string | null;
}

interface TwilioMessageResponse {
  sid?: string;
  status?: string;
  message?: string;
}

/**
 * Cliente mínimo de la API de mensajería de Twilio (SMS / WhatsApp).
 * Si no hay credenciales configuradas funciona en modo simulado: el mensaje
 * se registra en la base de datos con estado SIMULADA. Nunca lanza.
 */
@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);

  constructor(private readonly config: ConfigService) {}

  get canal(): CanalNotificacion {
    return this.config.get<string>('TWILIO_CHANNEL') === 'whatsapp'
      ? CanalNotificacion.WHATSAPP
      : CanalNotificacion.SMS;
  }

  get configurado(): boolean {
    return Boolean(
      this.config.get<string>('TWILIO_ACCOUNT_SID') &&
      this.config.get<string>('TWILIO_AUTH_TOKEN') &&
      this.config.get<string>('TWILIO_FROM_NUMBER'),
    );
  }

  async enviar(telefono: string, mensaje: string): Promise<ResultadoEnvio> {
    const canal = this.canal;
    const prefijo = canal === CanalNotificacion.WHATSAPP ? 'whatsapp:' : '';
    const destino = `${prefijo}${telefono}`;
    const base = {
      canal,
      destino,
      sid: null,
      estadoProveedor: null,
      error: null,
    };

    if (!this.configurado) {
      this.logger.log(`[SIMULADO] ${destino}: ${mensaje}`);
      return { ...base, estado: EstadoNotificacion.SIMULADA };
    }

    const sid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    const from = `${prefijo}${this.config.getOrThrow<string>('TWILIO_FROM_NUMBER')}`;

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: destino, From: from, Body: mensaje }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const body = (await response.json()) as TwilioMessageResponse;
      if (!response.ok) {
        return {
          ...base,
          estado: EstadoNotificacion.FALLIDA,
          estadoProveedor: body.status ?? 'failed',
          error: body.message ?? `HTTP ${response.status}`,
        };
      }
      return {
        ...base,
        estado: EstadoNotificacion.ENVIADA,
        sid: body.sid ?? null,
        estadoProveedor: body.status ?? 'queued',
      };
    } catch (error) {
      this.logger.warn(
        `Error enviando a ${destino}: ${(error as Error).message}`,
      );
      return {
        ...base,
        estado: EstadoNotificacion.FALLIDA,
        error: (error as Error).message,
      };
    }
  }
}
