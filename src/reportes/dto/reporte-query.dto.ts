import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { IsFecha } from '../../common/decorators/is-fecha.decorator';
import {
  PacientePaginationQueryDto,
  PacienteQueryDto,
} from '../../common/dto/paciente-query.dto';
import { EstadoToma } from '../../tomas/enums/estado-toma.enum';

export enum Periodo {
  SEMANA = '7d',
  MES = '30d',
  TRIMESTRE = '90d',
}

export const DIAS_POR_PERIODO: Record<Periodo, number> = {
  [Periodo.SEMANA]: 7,
  [Periodo.MES]: 30,
  [Periodo.TRIMESTRE]: 90,
};

export class ReporteQueryDto extends PacienteQueryDto {
  @ApiPropertyOptional({ enum: Periodo, default: Periodo.MES })
  @IsOptional()
  @IsEnum(Periodo, { message: 'periodo debe ser 7d, 30d o 90d' })
  periodo: Periodo = Periodo.MES;
}

export class HistorialQueryDto extends PacientePaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsFecha()
  fechaInicio?: string;

  @ApiPropertyOptional({ example: '2026-10-05' })
  @IsOptional()
  @IsFecha()
  fechaFin?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  medicamentoId?: string;

  @ApiPropertyOptional({ enum: EstadoToma })
  @IsOptional()
  @IsEnum(EstadoToma)
  estado?: EstadoToma;
}
