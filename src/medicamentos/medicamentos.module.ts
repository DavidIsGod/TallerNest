import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactosModule } from '../contactos/contactos.module';
import { OpenFdaModule } from '../openfda/openfda.module';
import { TomasModule } from '../tomas/tomas.module';
import { Medicamento } from './entities/medicamento.entity';
import { MedicamentosResolver } from './graphql/medicamentos.resolver';
import { MedicamentosController } from './medicamentos.controller';
import { MedicamentosService } from './medicamentos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Medicamento]),
    OpenFdaModule,
    ContactosModule,
    TomasModule,
  ],
  controllers: [MedicamentosController],
  // REST (controller) y GraphQL (resolver) comparten el MISMO servicio.
  providers: [MedicamentosService, MedicamentosResolver],
})
export class MedicamentosModule {}
