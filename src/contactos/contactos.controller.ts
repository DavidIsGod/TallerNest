import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PacienteQueryDto } from '../common/dto/paciente-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ContactosService } from './contactos.service';
import { CreateContactoDto } from './dto/create-contacto.dto';
import { NotificacionesContactoDto } from './dto/notificaciones-contacto.dto';
import { UpdateContactoDto } from './dto/update-contacto.dto';

@ApiTags('Contactos de emergencia y familiares')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Sin permisos o sin acceso al paciente' })
@Controller('contactos')
export class ContactosController {
  constructor(private readonly contactosService: ContactosService) {}

  @Post()
  @Roles(Role.CAREGIVER)
  @ApiOperation({ summary: 'Registrar un contacto (máx. 10 por paciente)' })
  @ApiConflictResponse({
    description: 'Límite de contactos o usuario ya vinculado',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContactoDto,
  ) {
    return this.contactosService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar contactos del paciente' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PacienteQueryDto,
  ) {
    return this.contactosService.findAll(user, query.pacienteId);
  }

  @Get('mis-pacientes')
  @Roles(Role.FAMILY)
  @ApiOperation({
    summary: 'Pacientes a los que el familiar autenticado tiene acceso',
  })
  misPacientes(@CurrentUser() user: AuthenticatedUser) {
    return this.contactosService.misPacientes(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un contacto' })
  @ApiNotFoundResponse()
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contactosService.findOne(user, id);
  }

  @Put(':id')
  @Roles(Role.CAREGIVER)
  @ApiOperation({ summary: 'Actualizar datos del contacto' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactoDto,
  ) {
    return this.contactosService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.CAREGIVER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar contacto' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Es el único contacto de emergencia' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contactosService.remove(user, id);
  }

  @Patch(':id/notificaciones')
  @Roles(Role.CAREGIVER)
  @ApiOperation({ summary: 'Activar/desactivar notificaciones del contacto' })
  setNotificaciones(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotificacionesContactoDto,
  ) {
    return this.contactosService.setNotificaciones(
      user,
      id,
      dto.recibeNotificaciones,
    );
  }
}
