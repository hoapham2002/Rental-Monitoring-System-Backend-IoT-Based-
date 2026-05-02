import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import {
  Device, DeviceSchema,
  DeviceLog, DeviceLogSchema,
  Alert, AlertSchema,
} from '../common/schemas';
import { NotificationsModule } from '../notifications/notifications.module';
 
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: DeviceLog.name, schema: DeviceLogSchema },
      { name: Alert.name, schema: AlertSchema },
    ]),
    NotificationsModule,   // inject NotificationsService vào DevicesService
  ],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}