import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import {
  GenerarTomasDto,
  ResumenTomasQueryDto,
  TomaQueryDto,
  TomasHoyQueryDto,
} from './dto/toma-query.dto';
import { UpdateTomaDto } from './dto/update-toma.dto';
import { TomasService } from './tomas.service';

@ApiTags('Registro de tomas')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Sin permisos o sin acceso al paciente' })
@Controller('tomas')
export class TomasController {
  constructor(private readonly tomasService: TomasService) {}

  @Get()
  @ApiOperation({
    summary:
      'Listar tomas (filtros: fecha, desde, hasta, estado, medicamentoId)',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TomaQueryDto,
  ) {
    return this.tomasService.findAll(user, query);
  }

  @Get('hoy')
  @ApiOperation({ summary: 'Tomas programadas para hoy' })
  findHoy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TomasHoyQueryDto,
  ) {
    return this.tomasService.findHoy(user, query);
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen del día: pendientes, tomadas, omitidas' })
  resumen(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ResumenTomasQueryDto,
  ) {
    return this.tomasService.resumen(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un registro de toma' })
  @ApiNotFoundResponse()
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tomasService.findOne(user, id);
  }

  @Patch(':id')
  @Roles(Role.CAREGIVER)
  @ApiOperation({ summary: 'Marcar una toma como TOMADO u OMITIDO' })
  @ApiBadRequestResponse({ description: 'Toma de una fecha futura' })
  @ApiConflictResponse({ description: 'La toma ya estaba registrada' })
  actualizarEstado(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTomaDto,
  ) {
    return this.tomasService.actualizarEstado(user, id, dto);
  }

  @Post('jobs/generar')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ejecutar manualmente la generación de tomas (job de las 00:01)',
  })
  async generar(@Body() dto: GenerarTomasDto) {
    const creadas = await this.tomasService.generarTomasDelDia(dto.fecha);
    return { creadas };
  }

  @Post('jobs/detectar-omisiones')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ejecutar manualmente la detección de omisiones (job cada 5 min)',
  })
  detectarOmisiones() {
    return this.tomasService.detectarOmisiones();
  }

  @Post('jobs/resumen-diario')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar manualmente el resumen diario a familiares',
  })
  resumenDiario(@Body() dto: GenerarTomasDto) {
    return this.tomasService.enviarResumenesDiarios(dto.fecha);
  }
}
