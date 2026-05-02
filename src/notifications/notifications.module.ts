import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationWorker } from './notification.worker';
import {
  Notification, NotificationSchema,
  User, UserSchema,
} from '../common/schemas';
 
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationWorker,   // Worker tự start khi module init
  ],
  exports: [NotificationsService],  // Export để DevicesService, BillsService dùng
})
export class NotificationsModule {}

//
// Import order quan trọng:
//   GatewayModule phải là Global (đã set) nên IoTGateway tự inject được.
//   NotificationsModule export NotificationsService để
//   DevicesModule và BillsModule (Phase 4) inject vào.