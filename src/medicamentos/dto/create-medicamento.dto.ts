import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsFecha } from '../../common/decorators/is-fecha.decorator';

export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateMedicamentoDto {
  @ApiProperty({ example: 'Glucophage' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre: string;

  @ApiProperty({
    example: 'metformina',
    description: 'Principio activo (se usa para consultar openFDA)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  principioActivo: string;

  @ApiProperty({ example: '850 mg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dosis: string;

  @ApiProperty({ example: 'Cada 12 horas' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  frecuencia: string;

  @ApiProperty({
    example: ['08:00', '20:00'],
    description: 'Horarios de toma en formato HH:mm (24 h)',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Debe indicar al menos un horario' })
  @ArrayMaxSize(24)
  @ArrayUnique({ message: 'Los horarios no pueden repetirse' })
  @Matches(HORA_REGEX, {
    each: true,
    message: 'Cada horario debe tener formato HH:mm (24 horas)',
  })
  horarios: string[];

  @ApiProperty({ example: '2026-10-01' })
  @IsFecha()
  fechaInicio: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    nullable: true,
    description: 'null u omitido = tratamiento indefinido (crónico)',
  })
  @IsOptional()
  @IsFecha()
  fechaFin?: string | null;

  @ApiPropertyOptional({ example: 'Tomar con alimentos' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instrucciones?: string;
}
