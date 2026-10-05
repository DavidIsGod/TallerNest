import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { NotificacionQueryDto } from './dto/notificacion-query.dto';
import { NotificacionesService } from './notificaciones.service';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Historial de notificaciones (alertas de omisión y resúmenes) del paciente',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificacionQueryDto,
  ) {
    return this.notificacionesService.findAll(user, query);
  }

  @Post('reintentar')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reintentar envíos fallidos (también corre en el scheduler)',
  })
  reintentar() {
    return this.notificacionesService.reintentarFallidas();
  }
}
