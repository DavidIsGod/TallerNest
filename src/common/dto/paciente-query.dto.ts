import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

const PACIENTE_DESCRIPTION =
  'Paciente a consultar. Opcional para CAREGIVER (es él mismo) y para FAMILY vinculado a un solo paciente; obligatorio para ADMIN.';

export class PacienteQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: PACIENTE_DESCRIPTION })
  @IsOptional()
  @IsUUID()
  pacienteId?: string;
}

export class PacientePaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: PACIENTE_DESCRIPTION })
  @IsOptional()
  @IsUUID()
  pacienteId?: string;
}
