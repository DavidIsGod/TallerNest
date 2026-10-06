import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { E164_MESSAGE, E164_REGEX } from '../../users/dto/create-user.dto';

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateContactoDto {
  @ApiProperty({ example: 'Andrés Gómez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @ApiProperty({ example: 'Hijo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  relacion: string;

  @ApiProperty({ example: '+573001234567', description: 'Formato E.164' })
  @Matches(E164_REGEX, { message: E164_MESSAGE })
  telefono: string;

  @ApiPropertyOptional({ example: 'andres@correo.com' })
  @IsOptional()
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Si el paciente aún no tiene contacto de emergencia, este se marca automáticamente como tal.',
  })
  @IsOptional()
  @IsBoolean()
  esEmergencia?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  recibeNotificaciones?: boolean;

  @ApiPropertyOptional({
    example: 'familiar@mediplan.com',
    description:
      'Email de un usuario ROLE_FAMILY registrado para darle acceso de solo lectura al paciente.',
  })
  @IsOptional()
  @Transform(trimLower)
  @IsEmail()
  usuarioEmail?: string;
}
