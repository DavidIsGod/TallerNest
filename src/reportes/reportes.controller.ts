import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { PacienteQueryDto } from '../common/dto/paciente-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { HistorialQueryDto, ReporteQueryDto } from './dto/reporte-query.dto';
import { ReportesService } from './reportes.service';

@ApiTags('Reportes y estadísticas')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Sin acceso al paciente' })
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('adherencia')
  @ApiOperation({
    summary: 'Adherencia global y serie diaria (periodo 7d, 30d, 90d)',
  })
  adherencia(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReporteQueryDto,
  ) {
    return this.reportesService.adherencia(user, query);
  }

  @Get('por-medicamento')
  @ApiOperation({ summary: 'Adherencia desglosada por medicamento' })
  porMedicamento(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReporteQueryDto,
  ) {
    return this.reportesService.porMedicamento(user, query);
  }

  @Get('patrones')
  @ApiOperation({
    summary: 'Patrones de omisión (heatmap día de la semana × hora)',
  })
  patrones(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReporteQueryDto,
  ) {
    return this.reportesService.patrones(user, query);
  }

  @Get('historial')
  @ApiOperation({
    summary:
      'Historial detallado paginado (fechaInicio, fechaFin, medicamentoId, estado, page, size)',
  })
  historial(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: HistorialQueryDto,
  ) {
    return this.reportesService.historial(user, query);
  }

  @Get('resumen')
  @ApiOperation({
    summary: 'Dashboard: adherencia actual, próxima toma y alertas',
  })
  resumen(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PacienteQueryDto,
  ) {
    return this.reportesService.resumen(user, query.pacienteId);
  }

  @Get('exportar/pdf')
  @ApiOperation({ summary: 'Descargar el reporte completo en PDF' })
  @ApiProduces('application/pdf')
  async exportarPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReporteQueryDto,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.reportesService.exportarPdf(
      user,
      query,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
      length: buffer.length,
    });
  }
}
