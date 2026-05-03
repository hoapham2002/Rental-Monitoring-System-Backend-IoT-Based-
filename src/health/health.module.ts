import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';

@Module({
  imports: [
    TerminusModule,
    MongooseModule,   // cần để @InjectConnection() hoạt động
  ],
  controllers: [HealthController],
  // ConfigService available globally từ AppConfigModule (isGlobal: true)
})
export class HealthModule {}
