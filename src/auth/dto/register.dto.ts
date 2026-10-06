import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../common/enums/role.enum';
import {
  E164_MESSAGE,
  E164_REGEX,
  PASSWORD_MESSAGE,
  PASSWORD_REGEX,
} from '../../users/dto/create-user.dto';

export const SELF_REGISTER_ROLES = [Role.CAREGIVER, Role.FAMILY] as const;

export class RegisterDto {
  @ApiProperty({ example: 'Rosa Martínez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @ApiProperty({ example: 'rosa@correo.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(200)
  email: string;

  @ApiProperty({ example: 'Secreta123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({
    enum: SELF_REGISTER_ROLES,
    example: Role.CAREGIVER,
    description:
      'Rol deseado. ROLE_ADMIN no se puede auto-asignar: solo un administrador lo otorga.',
  })
  @IsIn(SELF_REGISTER_ROLES, {
    message: `El rol debe ser ${SELF_REGISTER_ROLES.join(' o ')}`,
  })
  rol: Role;

  @ApiPropertyOptional({ example: '+573001234567' })
  @IsOptional()
  @Matches(E164_REGEX, { message: E164_MESSAGE })
  telefono?: string;
}
