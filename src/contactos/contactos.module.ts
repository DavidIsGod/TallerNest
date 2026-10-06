import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from '../users/entities/usuario.entity';
import { ContactosController } from './contactos.controller';
import { ContactosService } from './contactos.service';
import { ContactoFamiliar } from './entities/contacto-familiar.entity';
import { PatientAccessService } from './patient-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContactoFamiliar, Usuario])],
  controllers: [ContactosController],
  providers: [ContactosService, PatientAccessService],
  exports: [ContactosService, PatientAccessService],
})
export class ContactosModule {}
