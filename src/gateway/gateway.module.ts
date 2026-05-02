import { Module, Global } from '@nestjs/common';
import { IoTGateway } from './iot.gateway';
 
@Global() // Global để DevicesService và NotificationsService inject được không cần import
@Module({
  providers: [IoTGateway],
  exports: [IoTGateway],
})
export class GatewayModule {}

//
// Socket.io Gateway – realtime bridge giữa backend và FE/Mobile.
// Khi có Alert (cháy, đột nhập), DevicesService emit event tới đây.
// Client join vào room theo room_id để chỉ nhận alert của phòng mình.