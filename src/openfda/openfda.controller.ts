import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OpenFdaService } from './openfda.service';

export class ConsultaOpenFdaDto {
  @ApiProperty({ example: 'metformina' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  principioActivo: string;
}

@ApiTags('openFDA')
@ApiBearerAuth()
@Controller('openfda')
export class OpenFdaController {
  constructor(private readonly openFda: OpenFdaService) {}

  @Get('consulta')
  @ApiOperation({
    summary: 'Consultar información farmacológica de un principio activo',
    description:
      'Permite previsualizar advertencias e interacciones antes de registrar un medicamento.',
  })
  consultar(@Query() query: ConsultaOpenFdaDto) {
    return this.openFda.consultar(query.principioActivo);
  }
}
