import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { CacheInterceptor } from './cache.interceptor';
import {
  Room,   RoomSchema,
  Bill,   BillSchema,
  Alert,  AlertSchema,
  Device, DeviceSchema,
} from '../common/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name,   schema: RoomSchema },
      { name: Bill.name,   schema: BillSchema },
      { name: Alert.name,  schema: AlertSchema },
      { name: Device.name, schema: DeviceSchema },
    ]),
  ],
  controllers: [StatsController],
  providers: [
    StatsService,
    CacheInterceptor, // provide để inject ConfigService vào interceptor
  ],
})
export class StatsModule {}
