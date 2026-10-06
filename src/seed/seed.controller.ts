import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SeedService } from './seed.service';

@ApiTags('Seed')
@ApiBearerAuth()
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reiniciar la BD con datos de demostración',
    description:
      'Borra todos los datos y carga usuarios (admin, cuidadores, familiares), medicamentos, 30 días de tomas, contactos y notificaciones. Invalida todas las sesiones, incluida la del admin.',
  })
  @ApiForbiddenResponse({ description: 'Requiere ROLE_ADMIN' })
  run() {
    return this.seedService.run();
  }
}
