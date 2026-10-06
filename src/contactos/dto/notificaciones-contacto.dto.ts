import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class NotificacionesContactoDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  recibeNotificaciones: boolean;
}
