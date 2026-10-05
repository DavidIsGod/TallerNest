import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PacientePaginationQueryDto } from '../../common/dto/paciente-query.dto';
import { EstadoNotificacion, TipoNotificacion } from '../enums';

export class NotificacionQueryDto extends PacientePaginationQueryDto {
  @ApiPropertyOptional({ enum: TipoNotificacion })
  @IsOptional()
  @IsEnum(TipoNotificacion)
  tipo?: TipoNotificacion;

  @ApiPropertyOptional({ enum: EstadoNotificacion })
  @IsOptional()
  @IsEnum(EstadoNotificacion)
  estado?: EstadoNotificacion;
}
