import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TomasService } from './tomas.service';

const TIME_ZONE = process.env.APP_TIMEZONE ?? 'America/Bogota';

/**
 * Jobs programados (actor "Sistema (Scheduler)" del anteproyecto):
 * - 00:01 genera las tomas del día y cierra tratamientos vencidos.
 * - Cada 5 min detecta omisiones (> 2 h) y notifica a los familiares.
 * - 21:00 envía el resumen diario de adherencia.
 */
@Injectable()
export class TomasScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(TomasScheduler.name);

  constructor(
    private readonly tomas: TomasService,
    private readonly notificaciones: NotificacionesService,
    private readonly config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<boolean>('SCHEDULER_ENABLED') !== false;
  }

  /** Si el servidor estuvo apagado a las 00:01, genera las tomas al iniciar. */
  async onApplicationBootstrap(): Promise<void> {
    await this.generarTomasDiarias();
  }

  @Cron('1 0 * * *', { name: 'generar-tomas', timeZone: TIME_ZONE })
  async generarTomasDiarias(): Promise<void> {
    if (!this.enabled) return;
    await this.safely('generar-tomas', async () => {
      await this.tomas.finalizarTratamientosVencidos();
      await this.tomas.generarTomasDelDia();
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'detectar-omisiones' })
  async detectarOmisiones(): Promise<void> {
    if (!this.enabled) return;
    await this.safely('detectar-omisiones', async () => {
      await this.tomas.detectarOmisiones();
      await this.notificaciones.reintentarFallidas();
    });
  }

  @Cron('0 21 * * *', { name: 'resumen-diario', timeZone: TIME_ZONE })
  async resumenDiario(): Promise<void> {
    if (!this.enabled) return;
    await this.safely('resumen-diario', () =>
      this.tomas.enviarResumenesDiarios(),
    );
  }

  private async safely(job: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error(`Job ${job} falló: ${(error as Error).message}`);
    }
  }
}
