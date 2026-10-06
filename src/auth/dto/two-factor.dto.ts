import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, Matches } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({
    example: '123456',
    description: 'Código TOTP de 6 dígitos de la app autenticadora',
  })
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code: string;
}

export class VerifyTwoFactorDto extends TwoFactorCodeDto {
  @ApiProperty({
    description:
      'Token temporal devuelto por /auth/login cuando el 2FA está activo',
  })
  @IsJWT()
  twoFactorToken: string;
}
