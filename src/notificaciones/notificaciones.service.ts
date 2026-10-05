import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Paginated, paginate, skipFor } from '../common/dto/paginated.dto';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ContactosService } from '../contactos/contactos.service';
import { PatientAccessService } from '../contactos/patient-access.service';
import { NotificacionQueryDto } from './dto/notificacion-query.dto';
import { Notificacion } from './entities/notificacion.entity';
import { EstadoNotificacion, TipoNotificacion } from './enums';
import { TwilioService } from './twilio.service';

@Injectable()
export class NotificacionesService {
  constructor(
    @InjectRepository(Notificacion)
    private readonly notificaciones: Repository<Notificacion>,
    private readonly contactos: ContactosService,
    private readonly access: PatientAccessService,
    private readonly twilio: TwilioService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Envía un mensaje a todos los contactos del paciente con
   * recibeNotificaciones = true y registra cada envío.
   */
  async notificarContactos(
    pacienteId: string,
    mensaje: string,
    tipo: TipoNotificacion,
    registroTomaId: string | null = null,
  ): Promise<Notificacion[]> {
    const contactos = await this.contactos.findNotificables(pacienteId);
    const registros: Notificacion[] = [];
    for (const contacto of contactos) {
      const resultado = await this.twilio.enviar(contacto.telefono, mensaje);
      registros.push(
        this.notificaciones.create({
          pacienteId,
          contactoId: contacto.id,
          registroTomaId,
          tipo,
          mensaje,
          canal: resultado.canal,
          destino: resultado.destino,
          estado: resultado.estado,
          estadoProveedor: resultado.estadoProveedor,
          proveedorSid: resultado.sid,
          error: resultado.error,
          intentos: 1,
        }),
      );
    }
    return registros.length ? this.notificaciones.save(registros) : [];
  }

  /** Reintenta los envíos fallidos que no superan el máximo de intentos. */
  async reintentarFallidas(): Promise<{
    reintentadas: number;
    enviadas: number;
  }> {
    const maxIntentos = Number(
      this.config.get<number>('NOTIFICACION_MAX_INTENTOS') ?? 3,
    );
    const fallidas = await this.notificaciones.find({
      where: {
        estado: EstadoNotificacion.FALLIDA,
        intentos: LessThan(maxIntentos),
      },
      relations: { contacto: true },
      take: 100,
    });
    let enviadas = 0;
    for (const n of fallidas) {
      const telefono =
        n.contacto?.telefono ?? n.destino.replace('whatsapp:', '');
      const resultado = await this.twilio.enviar(telefono, n.mensaje);
      n.intentos += 1;
      n.estado = resultado.estado;
      n.estadoProveedor = resultado.estadoProveedor;
      n.proveedorSid = resultado.sid;
      n.error = resultado.error;
      if (resultado.estado !== EstadoNotificacion.FALLIDA) enviadas += 1;
      await this.notificaciones.save(n);
    }
    return { reintentadas: fallidas.length, enviadas };
  }

  async findAll(
    user: AuthenticatedUser,
    query: NotificacionQueryDto,
  ): Promise<Paginated<Notificacion>> {
    const pacienteId = await this.access.resolvePatientId(
      user,
      query.pacienteId,
    );
    const [items, total] = await this.notificaciones.findAndCount({
      where: {
        pacienteId,
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.estado ? { estado: query.estado } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: skipFor(query.page, query.size),
      take: query.size,
    });
    return paginate(items, total, query.page, query.size);
  }
}
