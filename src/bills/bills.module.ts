import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import {
  Bill,  BillSchema,
  Room,  RoomSchema,
  User,  UserSchema,
} from '../common/schemas';
import { NotificationsModule } from '../notifications/notifications.module';
 
@Module({
  imports: [
    // ScheduleModule.forRoot() đăng ký ở app.module.ts (global)
    // Không đăng ký lại ở đây để tránh double registration
    MongooseModule.forFeature([
      { name: Bill.name, schema: BillSchema },
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [BillsController],
  providers: [BillsService],
  exports: [BillsService],
})
export class BillsModule {}