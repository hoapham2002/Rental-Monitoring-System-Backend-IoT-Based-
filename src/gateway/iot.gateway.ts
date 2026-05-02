import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
 
@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
    credentials: true,
  },
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class IoTGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;
 
  private readonly logger = new Logger(IoTGateway.name);
 
  afterInit() {
    this.logger.log('Socket.io Gateway initialized');
  }
 
  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
    client.emit('connected', { message: 'Connected to IoT Rental System' });
  }
 
  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }
 
  // ── CLIENT → SERVER ───────────────────────────────────────────────────────
 
  /**
   * Client gửi: socket.emit('join-room', { roomId: '665f...' })
   * Sau đó client sẽ nhận các event của phòng đó.
   */
  @SubscribeMessage('join-room')
  handleJoinRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.roomId) return;
    client.join(`room:${data.roomId}`);
    this.logger.debug(`Client ${client.id} joined room:${data.roomId}`);
    client.emit('joined-room', { roomId: data.roomId });
  }
 
  /**
   * Client gửi: socket.emit('leave-room', { roomId: '665f...' })
   */
  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.roomId) return;
    client.leave(`room:${data.roomId}`);
    client.emit('left-room', { roomId: data.roomId });
  }
 
  // ── SERVER → CLIENT (gọi từ DevicesService/NotificationsService) ─────────
 
  /**
   * Emit alert tới tất cả clients đang ở trong room đó.
   * Gọi từ DevicesService khi phát hiện FIRE hoặc security event.
   */
  emitAlert(roomId: string, payload: AlertPayload): void {
    this.server.to(`room:${roomId}`).emit('alert', payload);
    this.logger.log(
      `Alert emitted → room:${roomId} | type: ${payload.type} | severity: ${payload.severity}`,
    );
  }
 
  /**
   * Emit device state update (ví dụ: đèn bật, cửa mở).
   * FE dùng để cập nhật UI dashboard realtime.
   */
  emitDeviceUpdate(roomId: string, payload: DeviceUpdatePayload): void {
    this.server.to(`room:${roomId}`).emit('device-update', payload);
  }
 
  /**
   * Broadcast tới TẤT CẢ clients (dùng cho admin dashboard).
   */
  broadcastToAll(event: string, payload: unknown): void {
    this.server.emit(event, payload);
  }
}
 
// ── Payload types ────────────────────────────────────────────────────────────
 
export interface AlertPayload {
  alertId: string;
  type: 'fire' | 'security' | 'system';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  device_id: string;
  room_id: string;
  ts: Date;
}
 
export interface DeviceUpdatePayload {
  deviceId: string;
  status: 'online' | 'offline';
  last_state: string | null;
  last_seen: Date | null;
}

//
// Socket.io server. Clients (web dashboard, mobile) kết nối vào đây.
//
// Flow:
//   1. Client connect → server emit 'connected'
//   2. Client gửi 'join-room' { roomId } → server join socket vào room channel
//   3. Khi IoT gửi FIRE → DevicesService gọi gateway.emitAlert() → emit 'alert' tới đúng room
//   4. Khi thiết bị đổi trạng thái → DevicesService gọi gateway.emitDeviceUpdate()
//
// Events phát ra từ server:
//   'alert'          → { alertId, type, severity, message, device_id, room_id, ts }
//   'device-update'  → { deviceId, status, last_state, last_seen }
//   'connected'      → { message }