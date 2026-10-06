import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { ClockService } from '../common/services/clock.service';
import { addDays, normalizeTime } from '../common/utils/date.util';
import { ContactoFamiliar } from '../contactos/entities/contacto-familiar.entity';
import { Medicamento } from '../medicamentos/entities/medicamento.entity';
import { Notificacion } from '../notificaciones/entities/notificacion.entity';
import {
  CanalNotificacion,
  EstadoNotificacion,
  TipoNotificacion,
} from '../notificaciones/enums';
import { RegistroToma } from '../tomas/entities/registro-toma.entity';
import { EstadoToma } from '../tomas/enums/estado-toma.enum';
import { Usuario } from '../users/entities/usuario.entity';
import { UsersService } from '../users/users.service';
import {
  infoOpenFdaDemo,
  prng,
  SEED_CONTACTOS,
  SEED_MEDICAMENTOS,
  SEED_USUARIOS,
  SeedUsuario,
} from './seed-data';

export interface SeedResult {
  usuarios: number;
  medicamentos: number;
  tomas: number;
  contactos: number;
  notificaciones: number;
  credenciales: {
    email: string;
    password: string;
    rol: Role;
    twoFactor: boolean;
  }[];
}

const TABLAS = [
  'notificaciones',
  'registros_toma',
  'contactos_familiares',
  'medicamentos',
  'sesiones',
  'usuarios',
];

/** Reinicia la base de datos con datos de demostración. */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly clock: ClockService,
  ) {}

  async run(): Promise<SeedResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query(`TRUNCATE TABLE ${TABLAS.join(', ')} CASCADE`);
      const usuarios = await this.crearUsuarios(manager);
      const medicamentos = await this.crearMedicamentos(manager, usuarios);
      const contactos = await this.crearContactos(manager, usuarios);
      const tomas = await this.crearTomas(manager, medicamentos);
      const notificaciones = await this.crearNotificaciones(
        manager,
        tomas,
        contactos,
        usuarios,
      );
      return {
        usuarios: usuarios.size,
        medicamentos: medicamentos.length,
        tomas: tomas.length,
        contactos: contactos.length,
        notificaciones: notificaciones.length,
      };
    });
    this.logger.log(`Seed ejecutado: ${JSON.stringify(result)}`);
    return { ...result, credenciales: this.credenciales() };
  }

  private credenciales(): SeedResult['credenciales'] {
    return [
      {
        email: this.config.get<string>('ADMIN_EMAIL', 'admin@mediplan.com'),
        password: this.config.get<string>('ADMIN_PASSWORD', 'Admin123*'),
        rol: Role.ADMIN,
        twoFactor: false,
      },
      ...SEED_USUARIOS.map((u) => ({
        email: u.email,
        password: u.password,
        rol: u.rol,
        twoFactor: Boolean(u.twoFactorSecret),
      })),
    ];
  }

  private async crearUsuarios(
    manager: EntityManager,
  ): Promise<Map<string, Usuario>> {
    const admin: SeedUsuario = {
      key: 'admin',
      nombre: this.config.get<string>('ADMIN_NAME', 'Administrador MediPlan'),
      email: this.config.get<string>('ADMIN_EMAIL', 'admin@mediplan.com'),
      password: this.config.get<string>('ADMIN_PASSWORD', 'Admin123*'),
      rol: Role.ADMIN,
    };
    const map = new Map<string, Usuario>();
    for (const u of [admin, ...SEED_USUARIOS]) {
      const usuario = await manager.save(
        manager.create(Usuario, {
          nombre: u.nombre,
          email: u.email.toLowerCase(),
          rol: u.rol,
          telefono: u.telefono ?? null,
          passwordHash: await this.users.hashPassword(u.password),
          twoFactorEnabled: Boolean(u.twoFactorSecret),
          twoFactorSecret: u.twoFactorSecret ?? null,
        }),
      );
      map.set(u.key, usuario);
    }
    return map;
  }

  private crearMedicamentos(
    manager: EntityManager,
    usuarios: Map<string, Usuario>,
  ): Promise<Medicamento[]> {
    const hoy = this.clock.today();
    return manager.save(
      SEED_MEDICAMENTOS.map((m) =>
        manager.create(Medicamento, {
          pacienteId: usuarios.get(m.paciente)!.id,
          nombre: m.nombre,
          principioActivo: m.principioActivo,
          dosis: m.dosis,
          frecuencia: m.frecuencia,
          horarios: m.horarios,
          fechaInicio: addDays(hoy, -m.diasDesdeInicio),
          fechaFin:
            m.diasHastaFin === null ? null : addDays(hoy, m.diasHastaFin),
          instrucciones: m.instrucciones ?? null,
          activo: true,
          infoOpenfda: infoOpenFdaDemo(m.principioActivo),
        }),
      ),
    );
  }

  private crearContactos(
    manager: EntityManager,
    usuarios: Map<string, Usuario>,
  ): Promise<ContactoFamiliar[]> {
    return manager.save(
      SEED_CONTACTOS.map((c) =>
        manager.create(ContactoFamiliar, {
          pacienteId: usuarios.get(c.paciente)!.id,
          usuarioId: c.usuario ? usuarios.get(c.usuario)!.id : null,
          nombre: c.nombre,
          relacion: c.relacion,
          telefono: c.telefono,
          email: c.email ?? null,
          esEmergencia: c.esEmergencia,
          recibeNotificaciones: c.recibeNotificaciones,
        }),
      ),
    );
  }

  /**
   * Historial de los últimos 30 días + tomas de hoy. Las tomas de hoy cuya
   * hora ya pasó quedan TOMADAS y las futuras PENDIENTES.
   */
  private async crearTomas(
    manager: EntityManager,
    medicamentos: Medicamento[],
  ): Promise<RegistroToma[]> {
    const random = prng(20261005);
    const { fecha: hoy, hora: ahora } = this.clock.local();
    const tomas: RegistroToma[] = [];

    medicamentos.forEach((med, i) => {
      const config = SEED_MEDICAMENTOS[i];
      const desde = addDays(hoy, -Math.min(30, config.diasDesdeInicio));
      for (let fecha = desde; fecha <= hoy; fecha = addDays(fecha, 1)) {
        for (const horario of med.horarios) {
          const hora = normalizeTime(horario);
          const esFutura = fecha === hoy && hora > ahora;
          const omitida =
            !esFutura && fecha < hoy && random() < config.tasaOmision;
          const estado = esFutura
            ? EstadoToma.PENDIENTE
            : omitida
              ? EstadoToma.OMITIDO
              : EstadoToma.TOMADO;
          tomas.push(
            manager.create(RegistroToma, {
              medicamentoId: med.id,
              pacienteId: med.pacienteId,
              fecha,
              horaProgramada: hora,
              estado,
              horaReal:
                estado === EstadoToma.TOMADO
                  ? new Date(`${fecha}T${hora}-05:00`)
                  : null,
              omisionAutomatica: omitida,
              notificacionEnviada: omitida,
            }),
          );
        }
      }
    });
    return manager.save(tomas, { chunk: 200 });
  }

  private crearNotificaciones(
    manager: EntityManager,
    tomas: RegistroToma[],
    contactos: ContactoFamiliar[],
    usuarios: Map<string, Usuario>,
  ): Promise<Notificacion[]> {
    const pacientes = new Map([...usuarios.values()].map((u) => [u.id, u]));
    const omitidas = tomas
      .filter((t) => t.estado === EstadoToma.OMITIDO)
      .slice(-15);
    const notificaciones = omitidas.flatMap((t) =>
      contactos
        .filter((c) => c.pacienteId === t.pacienteId && c.recibeNotificaciones)
        .map((c) =>
          manager.create(Notificacion, {
            pacienteId: t.pacienteId,
            contactoId: c.id,
            registroTomaId: t.id,
            tipo: TipoNotificacion.DOSIS_OMITIDA,
            canal: CanalNotificacion.SMS,
            destino: c.telefono,
            mensaje: `Alerta MediPlan: ${pacientes.get(t.pacienteId)?.nombre} no ha tomado una dosis programada para las ${t.horaProgramada.slice(0, 5)} del ${t.fecha}. Por favor verifique.`,
            estado: EstadoNotificacion.SIMULADA,
            intentos: 1,
          }),
        ),
    );
    return manager.save(notificaciones);
  }
}
