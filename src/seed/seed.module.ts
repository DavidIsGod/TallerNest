import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

@Module({
  imports: [UsersModule],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}
