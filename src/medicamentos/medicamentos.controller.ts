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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateMedicamentoDto } from './dto/create-medicamento.dto';
import { MedicamentoQueryDto } from './dto/medicamento-query.dto';
import { UpdateMedicamentoDto } from './dto/update-medicamento.dto';
import { MedicamentosService } from './medicamentos.service';

@ApiTags('Medicamentos y horarios')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Sin permisos o sin acceso al paciente' })
@Controller('medicamentos')
export class MedicamentosController {
  constructor(private readonly medicamentosService: MedicamentosService) {}

  @Post()
  @Roles(Role.CAREGIVER)
  @ApiOperation({
    summary: 'Crear medicamento (consulta openFDA y alerta interacciones)',
  })
  @ApiCreatedResponse({
    description: '{ medicamento, alertas, tomasGeneradasHoy }',
  })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMedicamentoDto,
  ) {
    return this.medicamentosService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar medicamentos (filtros: activo, nombre)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MedicamentoQueryDto,
  ) {
    return this.medicamentosService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del medicamento con info de openFDA' })
  @ApiNotFoundResponse()
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.medicamentosService.findOne(user, id);
  }

  @Put(':id')
  @Roles(Role.CAREGIVER)
  @ApiOperation({ summary: 'Actualizar medicamento (dosis, horarios, etc.)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMedicamentoDto,
  ) {
    return this.medicamentosService.update(user, id, dto);
  }

  @Patch(':id/toggle')
  @Roles(Role.CAREGIVER)
  @ApiOperation({ summary: 'Activar o desactivar un medicamento' })
  toggle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.medicamentosService.toggle(user, id);
  }

  @Delete(':id')
  @Roles(Role.CAREGIVER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar medicamento (soft delete: activo=false)' })
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.medicamentosService.remove(user, id);
  }
}
