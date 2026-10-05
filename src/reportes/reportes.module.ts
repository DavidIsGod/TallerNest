import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactosModule } from '../contactos/contactos.module';
import { Medicamento } from '../medicamentos/entities/medicamento.entity';
import { RegistroToma } from '../tomas/entities/registro-toma.entity';
import { Usuario } from '../users/entities/usuario.entity';
import { PdfService } from './pdf.service';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RegistroToma, Medicamento, Usuario]),
    ContactosModule,
  ],
  controllers: [ReportesController],
  providers: [ReportesService, PdfService],
})
export class ReportesModule {}
