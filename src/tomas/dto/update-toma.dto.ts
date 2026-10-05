import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { EstadoToma } from '../enums/estado-toma.enum';

const ESTADOS_MARCABLES = [EstadoToma.TOMADO, EstadoToma.OMITIDO] as const;

export class UpdateTomaDto {
  @ApiProperty({ enum: ESTADOS_MARCABLES, example: EstadoToma.TOMADO })
  @IsIn(ESTADOS_MARCABLES, { message: 'El estado debe ser TOMADO u OMITIDO' })
  estado: EstadoToma.TOMADO | EstadoToma.OMITIDO;

  @ApiPropertyOptional({ example: 'Tomó media dosis' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}
