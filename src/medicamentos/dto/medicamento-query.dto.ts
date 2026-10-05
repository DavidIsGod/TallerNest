import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { toBoolean } from '../../common/dto/boolean-query.transform';
import { PacientePaginationQueryDto } from '../../common/dto/paciente-query.dto';

export class MedicamentoQueryDto extends PacientePaginationQueryDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ description: 'Busca por nombre o principio activo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;
}
