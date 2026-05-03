import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import {
  Room, RoomSchema,
  User, UserSchema,
  Device, DeviceSchema,
  Bill, BillSchema,
} from '../common/schemas';
 
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name,   schema: RoomSchema },
      { name: User.name,   schema: UserSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: Bill.name,   schema: BillSchema },
    ]),
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
 
