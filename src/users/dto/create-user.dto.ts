import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export const PASSWORD_MESSAGE =
  'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número';
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;
export const E164_MESSAGE =
  'El teléfono debe estar en formato internacional E.164 (ej: +573001234567)';

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Creación de usuarios por parte de un administrador (cualquier rol). */
export class CreateUserDto {
  @ApiProperty({ example: 'María Gómez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @ApiProperty({ example: 'maria@correo.com' })
  @Transform(trimLower)
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(200)
  email: string;

  @ApiProperty({ example: 'Secreta123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ enum: Role, example: Role.CAREGIVER })
  @IsEnum(Role)
  rol: Role;

  @ApiPropertyOptional({ example: '+573001234567' })
  @IsOptional()
  @Matches(E164_REGEX, { message: E164_MESSAGE })
  telefono?: string;
}
