import { Module } from '@nestjs/common';
import { OpenFdaController } from './openfda.controller';
import { OpenFdaService } from './openfda.service';

@Module({
  controllers: [OpenFdaController],
  providers: [OpenFdaService],
  exports: [OpenFdaService],
})
export class OpenFdaModule {}
