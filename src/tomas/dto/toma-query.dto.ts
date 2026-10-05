import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { IsFecha } from '../../common/decorators/is-fecha.decorator';
import {
  PacientePaginationQueryDto,
  PacienteQueryDto,
} from '../../common/dto/paciente-query.dto';
import { EstadoToma } from '../enums/estado-toma.enum';

export class TomaQueryDto extends PacientePaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-10-05', description: 'Fecha exacta' })
  @IsOptional()
  @IsFecha()
  fecha?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsFecha()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-10-05' })
  @IsOptional()
  @IsFecha()
  hasta?: string;

  @ApiPropertyOptional({ enum: EstadoToma })
  @IsOptional()
  @IsEnum(EstadoToma)
  estado?: EstadoToma;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  medicamentoId?: string;
}

export class TomasHoyQueryDto extends PacienteQueryDto {
  @ApiPropertyOptional({ enum: EstadoToma })
  @IsOptional()
  @IsEnum(EstadoToma)
  estado?: EstadoToma;
}

export class ResumenTomasQueryDto extends PacienteQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-05',
    description: 'Por defecto hoy',
  })
  @IsOptional()
  @IsFecha()
  fecha?: string;
}

export class GenerarTomasDto {
  @ApiPropertyOptional({
    example: '2026-10-05',
    description: 'Por defecto hoy',
  })
  @IsOptional()
  @IsFecha()
  fecha?: string;
}
