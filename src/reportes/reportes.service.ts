import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsSelect,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Paginated, paginate, skipFor } from '../common/dto/paginated.dto';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ClockService } from '../common/services/clock.service';
import { addDays } from '../common/utils/date.util';
import { PatientAccessService } from '../contactos/patient-access.service';
import { Medicamento } from '../medicamentos/entities/medicamento.entity';
import { RegistroToma } from '../tomas/entities/registro-toma.entity';
import { EstadoToma } from '../tomas/enums/estado-toma.enum';
import { TOMA_SELECT } from '../tomas/tomas.service';
import { Usuario } from '../users/entities/usuario.entity';
import {
  DIAS_POR_PERIODO,
  HistorialQueryDto,
  Periodo,
  ReporteQueryDto,
} from './dto/reporte-query.dto';
import { PdfService } from './pdf.service';
import {
  adherenciaGlobal,
  adherenciaPorMedicamento,
  contarEstados,
  patronesOmision,
  TomaReporte,
} from './report-calculator';

const TOMA_REPORTE_SELECT: FindOptionsSelect<RegistroToma> = {
  id: true,
  fecha: true,
  horaProgramada: true,
  estado: true,
  medicamentoId: true,
  medicamento: { id: true, nombre: true, dosis: true },
};

const MAX_HISTORIAL_PDF = 100;

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(RegistroToma)
    private readonly tomas: Repository<RegistroToma>,
    @InjectRepository(Medicamento)
    private readonly medicamentos: Repository<Medicamento>,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    private readonly access: PatientAccessService,
    private readonly clock: ClockService,
    private readonly pdf: PdfService,
  ) {}

  rango(periodo: Periodo): { desde: string; hasta: string } {
    const hasta = this.clock.today();
    return { desde: addDays(hasta, -(DIAS_POR_PERIODO[periodo] - 1)), hasta };
  }

  async adherencia(user: AuthenticatedUser, query: ReporteQueryDto) {
    const { pacienteId, desde, hasta } = await this.contexto(user, query);
    const tomas = await this.tomasEnRango(pacienteId, desde, hasta);
    return {
      pacienteId,
      periodo: query.periodo,
      desde,
      hasta,
      ...adherenciaGlobal(tomas, desde, hasta),
    };
  }

  async porMedicamento(user: AuthenticatedUser, query: ReporteQueryDto) {
    const { pacienteId, desde, hasta } = await this.contexto(user, query);
    const tomas = await this.tomasEnRango(pacienteId, desde, hasta);
    return {
      pacienteId,
      periodo: query.periodo,
      desde,
      hasta,
      medicamentos: adherenciaPorMedicamento(tomas),
    };
  }

  async patrones(user: AuthenticatedUser, query: ReporteQueryDto) {
    const { pacienteId, desde, hasta } = await this.contexto(user, query);
    const tomas = await this.tomasEnRango(pacienteId, desde, hasta);
    return {
      pacienteId,
      periodo: query.periodo,
      desde,
      hasta,
      ...patronesOmision(tomas),
    };
  }

  async historial(
    user: AuthenticatedUser,
    query: HistorialQueryDto,
  ): Promise<Paginated<RegistroToma>> {
    const pacienteId = await this.access.resolvePatientId(
      user,
      query.pacienteId,
    );
    const where: FindOptionsWhere<RegistroToma> = { pacienteId };
    if (query.medicamentoId) where.medicamentoId = query.medicamentoId;
    if (query.estado) where.estado = query.estado;
    if (query.fechaInicio && query.fechaFin) {
      where.fecha = Between(query.fechaInicio, query.fechaFin);
    } else if (query.fechaInicio) {
      where.fecha = MoreThanOrEqual(query.fechaInicio);
    } else if (query.fechaFin) {
      where.fecha = LessThanOrEqual(query.fechaFin);
    }
    const [items, total] = await this.tomas.findAndCount({
      where,
      select: TOMA_SELECT,
      relations: { medicamento: true },
      order: { fecha: 'DESC', horaProgramada: 'DESC' },
      skip: skipFor(query.page, query.size),
      take: query.size,
    });
    return paginate(items, total, query.page, query.size);
  }

  /** Dashboard: adherencia actual, próxima toma y alertas. */
  async resumen(user: AuthenticatedUser, pacienteIdParam?: string) {
    const pacienteId = await this.access.resolvePatientId(
      user,
      pacienteIdParam,
    );
    const paciente = await this.getPaciente(pacienteId);
    const { fecha: hoy, hora } = this.clock.local();
    const ayer = addDays(hoy, -1);

    const [
      tomasHoy,
      semana,
      proximaToma,
      omitidasRecientes,
      activos,
      porFinalizar,
    ] = await Promise.all([
      this.tomas.find({
        where: { pacienteId, fecha: hoy },
        select: { id: true, estado: true },
      }),
      this.tomasEnRango(pacienteId, addDays(hoy, -6), hoy),
      this.tomas.findOne({
        where: {
          pacienteId,
          fecha: hoy,
          estado: EstadoToma.PENDIENTE,
          horaProgramada: MoreThan(hora),
        },
        select: TOMA_SELECT,
        relations: { medicamento: true },
        order: { horaProgramada: 'ASC' },
      }),
      this.tomas.find({
        where: {
          pacienteId,
          estado: EstadoToma.OMITIDO,
          fecha: Between(ayer, hoy),
        },
        select: TOMA_SELECT,
        relations: { medicamento: true },
        order: { fecha: 'DESC', horaProgramada: 'DESC' },
        take: 10,
      }),
      this.medicamentos.count({ where: { pacienteId, activo: true } }),
      this.medicamentos.find({
        where: {
          pacienteId,
          activo: true,
          fechaFin: Between(hoy, addDays(hoy, 7)),
        },
        select: { id: true, nombre: true, fechaFin: true },
      }),
    ]);

    return {
      paciente: { id: paciente.id, nombre: paciente.nombre },
      fecha: hoy,
      hoy: contarEstados(tomasHoy),
      adherencia7d: contarEstados(semana).adherencia,
      medicamentosActivos: activos,
      proximaToma,
      alertas: [
        ...omitidasRecientes.map((t) => ({
          tipo: 'DOSIS_OMITIDA',
          mensaje: `Dosis omitida de ${t.medicamento.nombre} (${t.fecha} ${t.horaProgramada.slice(0, 5)})`,
          registroTomaId: t.id,
        })),
        ...porFinalizar.map((m) => ({
          tipo: 'TRATAMIENTO_POR_FINALIZAR',
          mensaje: `El tratamiento con ${m.nombre} finaliza el ${m.fechaFin}`,
          medicamentoId: m.id,
        })),
      ],
    };
  }

  async exportarPdf(
    user: AuthenticatedUser,
    query: ReporteQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { pacienteId, desde, hasta } = await this.contexto(user, query);
    const paciente = await this.getPaciente(pacienteId);
    const tomas = await this.tomasEnRango(pacienteId, desde, hasta);
    const buffer = await this.pdf.generarReporteAdherencia({
      paciente: { nombre: paciente.nombre, email: paciente.email },
      periodo: query.periodo,
      desde,
      hasta,
      global: contarEstados(tomas),
      porMedicamento: adherenciaPorMedicamento(tomas),
      patrones: patronesOmision(tomas),
      historial: [...tomas].reverse().slice(0, MAX_HISTORIAL_PDF),
      generadoEn: `${this.clock.today()} ${this.clock.local().hora.slice(0, 5)} (${this.clock.timeZone})`,
    });
    return { buffer, filename: `mediplan-reporte-${desde}_${hasta}.pdf` };
  }

  // ---------------------------------------------------------------- helpers

  private async contexto(user: AuthenticatedUser, query: ReporteQueryDto) {
    const pacienteId = await this.access.resolvePatientId(
      user,
      query.pacienteId,
    );
    return { pacienteId, ...this.rango(query.periodo) };
  }

  private tomasEnRango(
    pacienteId: string,
    desde: string,
    hasta: string,
  ): Promise<TomaReporte[]> {
    return this.tomas.find({
      where: { pacienteId, fecha: Between(desde, hasta) },
      select: TOMA_REPORTE_SELECT,
      relations: { medicamento: true },
      order: { fecha: 'ASC', horaProgramada: 'ASC' },
    });
  }

  private async getPaciente(id: string): Promise<Usuario> {
    const paciente = await this.usuarios.findOne({ where: { id } });
    if (!paciente) throw new NotFoundException('Paciente no encontrado');
    return paciente;
  }
}
