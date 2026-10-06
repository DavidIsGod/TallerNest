import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { E164_MESSAGE, E164_REGEX } from './create-user.dto';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'María Gómez' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @ApiPropertyOptional({ example: 'maria@correo.com' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: '+573001234567' })
  @IsOptional()
  @Matches(E164_REGEX, { message: E164_MESSAGE })
  telefono?: string;
}
