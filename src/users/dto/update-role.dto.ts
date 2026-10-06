import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class UpdateRoleDto {
  @ApiProperty({ enum: Role, example: Role.FAMILY })
  @IsEnum(Role, {
    message: `El rol debe ser uno de: ${Object.values(Role).join(', ')}`,
  })
  rol: Role;
}
