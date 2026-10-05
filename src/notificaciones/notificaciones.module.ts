import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactosModule } from '../contactos/contactos.module';
import { Notificacion } from './entities/notificacion.entity';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { TwilioService } from './twilio.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notificacion]), ContactosModule],
  controllers: [NotificacionesController],
  providers: [NotificacionesService, TwilioService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
