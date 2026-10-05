import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactosModule } from '../contactos/contactos.module';
import { Medicamento } from '../medicamentos/entities/medicamento.entity';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { RegistroToma } from './entities/registro-toma.entity';
import { TomasController } from './tomas.controller';
import { TomasScheduler } from './tomas.scheduler';
import { TomasService } from './tomas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RegistroToma, Medicamento]),
    ContactosModule,
    NotificacionesModule,
  ],
  controllers: [TomasController],
  providers: [TomasService, TomasScheduler],
  exports: [TomasService],
})
export class TomasModule {}
