import { Global, Module } from '@nestjs/common';
import { ClockService } from './services/clock.service';

@Global()
@Module({
  providers: [ClockService],
  exports: [ClockService],
})
export class CommonModule {}
