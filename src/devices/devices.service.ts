import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Alert,
  AlertDocument,
  Device,
  DeviceDocument,
  DeviceLog,
  DeviceLogDocument,
} from '../common/schemas';
import { UpdateStatusDto, ControlDeviceDto, GetLogsQueryDto } from './dto/devices.dto';
import { IoTGateway } from '../gateway/iot.gateway';
import { NotificationsService } from '../notifications/notifications.service';
 
// Mapping value → event name để lưu vào logs
const VALUE_TO_EVENT: Record<string, string> = {
  FIRE: 'fire_detected',
  DOOR_OPEN: 'door_opened',
  DOOR_LOCKED: 'door_locked',
  MOTION_ON: 'motion_detected',
  MOTION_OFF: 'motion_cleared',
  PASSWORD_FAIL: 'password_fail',
  NORMAL: 'status_normal',
  ON: 'device_on',
  OFF: 'device_off',
};
 
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);
 
  constructor(
    @InjectModel(Device.name)
    private readonly deviceModel: Model<DeviceDocument>,
 
    @InjectModel(DeviceLog.name)
    private readonly deviceLogModel: Model<DeviceLogDocument>,
 
    @InjectModel(Alert.name)
    private readonly alertModel: Model<AlertDocument>,
 
    private readonly gateway: IoTGateway,
    private readonly notificationsService: NotificationsService,
  ) {}
 
  // ══════════════════════════════════════════════════════════════════════════
  // POST /devices/status — nhận data từ IoT Gateway
  // ══════════════════════════════════════════════════════════════════════════
  async handleStatusUpdate(dto: UpdateStatusDto) {
    const ts = dto.ts ? new Date(dto.ts) : new Date();
 
    // 1. Validate device tồn tại
    const device = await this.deviceModel.findById(dto.deviceId).lean();
    if (!device) {
      throw new NotFoundException(
        `Device "${dto.deviceId}" not found. Register device first.`,
      );
    }
 
    const eventName = VALUE_TO_EVENT[dto.value] ?? 'status_update';
 
    // 2. Lưu log (audit trail - không bao giờ bỏ qua)
    await this.deviceLogModel.create({
      device_id: dto.deviceId,
      event: eventName,
      value: dto.value,
      user_id: null, // null vì đây là IoT tự động, không phải user action
      ts,
    });
 
    // 3. Cập nhật trạng thái thiết bị
    await this.deviceModel.findByIdAndUpdate(dto.deviceId, {
      $set: {
        last_state: dto.value,
        last_seen: ts,
        status: 'online',
      },
    });
 
    let alertCreated = false;
 
    // 4. Xử lý FIRE — critical alert
    if (dto.value === 'FIRE') {
      const alert = await this.alertModel.create({
        device_id: dto.deviceId,
        room_id: device.room_id,
        type: 'fire',
        severity: 'critical',
        message: `🔥 Phát hiện cháy tại thiết bị ${dto.deviceId}!`,
        resolved: false,
        ts,
      });
 
      // 5a. Emit realtime — KHÔNG await (fire-and-forget)
      this.gateway.emitAlert(device.room_id.toString(), {
        alertId: (alert._id as Types.ObjectId).toString(),
        type: 'fire',
        severity: 'critical',
        message: alert.message,
        device_id: dto.deviceId,
        room_id: device.room_id.toString(),
        ts,
      });
 
      // 5b. Enqueue notification jobs — KHÔNG await (fire-and-forget)
      this.notificationsService.notifyAlert({
        alertId: (alert._id as Types.ObjectId).toString(),
        roomId: device.room_id.toString(),
        type: 'fire',
        severity: 'critical',
        message: alert.message,
      }).catch((err) => this.logger.error('Failed to enqueue fire notification', err));
 
      alertCreated = true;
      this.logger.warn(`🔥 FIRE detected on device ${dto.deviceId}, room ${device.room_id}`);
    }
 
    // 4b. Xử lý PASSWORD_FAIL — security alert
    if (dto.value === 'PASSWORD_FAIL') {
      const alert = await this.alertModel.create({
        device_id: dto.deviceId,
        room_id: device.room_id,
        type: 'security',
        severity: 'warning',
        message: `🔐 Nhập sai mật khẩu tại khóa ${dto.deviceId}`,
        resolved: false,
        ts,
      });
 
      // 5b. Emit realtime — KHÔNG await
      this.gateway.emitAlert(device.room_id.toString(), {
        alertId: (alert._id as Types.ObjectId).toString(),
        type: 'security',
        severity: 'warning',
        message: alert.message,
        device_id: dto.deviceId,
        room_id: device.room_id.toString(),
        ts,
      });
 
      // Enqueue notification — KHÔNG await
      this.notificationsService.notifyAlert({
        alertId: (alert._id as Types.ObjectId).toString(),
        roomId: device.room_id.toString(),
        type: 'security',
        severity: 'warning',
        message: alert.message,
      }).catch((err) => this.logger.error('Failed to enqueue security notification', err));
 
      alertCreated = true;
      this.logger.warn(`🔐 PASSWORD_FAIL on device ${dto.deviceId}`);
    }

    // 4c. Xử lý MOTION_ON — PIR motion alert
    if (dto.value === 'MOTION_ON') {
      const alert = await this.alertModel.create({
        device_id: dto.deviceId,
        room_id: device.room_id,
        type: 'security',
        severity: 'info',
        message: `🚶 Phát hiện chuyển động tại phòng ${device.room_id}`,
        resolved: false,
        ts,
      });

      // 5b. Emit realtime
      this.gateway.emitAlert(device.room_id.toString(), {
        alertId: (alert._id as Types.ObjectId).toString(),
        type: 'security',
        severity: 'info',
        message: alert.message,
        device_id: dto.deviceId,
        room_id: device.room_id.toString(),
        ts,
      });

      // Enqueue notification
      this.notificationsService.notifyAlert({
        alertId: (alert._id as Types.ObjectId).toString(),
        roomId: device.room_id.toString(),
        type: 'security',
        severity: 'info',
        message: alert.message,
      }).catch((err) => this.logger.error('Failed to enqueue motion notification', err));

      alertCreated = true;
      this.logger.log(`🚶 MOTION_ON on device ${dto.deviceId}`);
    }
 
    // 5c. Emit device state update cho FE dashboard (tất cả events)
    this.gateway.emitDeviceUpdate(device.room_id.toString(), {
      deviceId: dto.deviceId,
      status: 'online',
      last_state: dto.value,
      last_seen: ts,
    });
 
    return {
      ok: true,
      logged: true,
      alert_created: alertCreated,
      event: eventName,
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // POST /devices/control — gửi lệnh điều khiển từ FE/Mobile
  // ══════════════════════════════════════════════════════════════════════════
  async controlDevice(dto: ControlDeviceDto, userId: string, userRole: string) {
    const device = await this.deviceModel.findById(dto.deviceId).lean();
    if (!device) {
      throw new NotFoundException(`Device "${dto.deviceId}" not found.`);
    }
 
    if (device.status === 'offline') {
      throw new BadRequestException(
        `Device "${dto.deviceId}" is offline. Cannot send command.`,
      );
    }
 
    // Validate command phù hợp với device type
    if (dto.command === 'UNLOCK' || dto.command === 'LOCK') {
      if (device.type !== 'lock') {
        throw new BadRequestException(
          `Command "${dto.command}" chỉ dùng được cho device type "lock".`,
        );
      }
    }
    if (dto.command === 'LIGHT_ON' || dto.command === 'LIGHT_OFF') {
      if (device.type !== 'light') {
        throw new BadRequestException(
          `Command "${dto.command}" chỉ dùng được cho device type "light".`,
        );
      }
    }
 
    // Xác định new_state
    const newState = {
      UNLOCK: 'UNLOCKED',
      LOCK: 'LOCKED',
      LIGHT_ON: 'ON',
      LIGHT_OFF: 'OFF',
    }[dto.command];
 
    // Lưu log với user_id (ai điều khiển, lúc nào)
    await this.deviceLogModel.create({
      device_id: dto.deviceId,
      event: `remote_${dto.command.toLowerCase()}`,
      value: dto.command,
      user_id: new Types.ObjectId(userId),
      ts: new Date(),
    });
 
    // Cập nhật trạng thái thiết bị
    await this.deviceModel.findByIdAndUpdate(dto.deviceId, {
      $set: { last_state: newState, last_seen: new Date() },
    });
 
    // Emit realtime tới FE
    this.gateway.emitDeviceUpdate(device.room_id.toString(), {
      deviceId: dto.deviceId,
      status: 'online',
      last_state: newState,
      last_seen: new Date(),
    });
 
    // Emit lệnh xuống Gateway Script (Gateway script lắng nghe event 'command')
    // Gateway script sẽ forward lệnh về Arduino/ESP32 qua Serial
    this.gateway.broadcastToAll('command', {
      deviceId: dto.deviceId,
      command: dto.command,
      duration_sec: dto.duration_sec ?? null,
    });
 
    this.logger.log(
      `Command "${dto.command}" sent to device "${dto.deviceId}" by user ${userId}`,
    );
 
    return {
      ok: true,
      command_sent: dto.command,
      device: dto.deviceId,
      new_state: newState,
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // GET /devices — danh sách thiết bị (filter theo role)
  // ══════════════════════════════════════════════════════════════════════════
  async getDevices(
    userRole: string,
    userId: string,
    roomId?: string,
  ) {
    let filter: Record<string, unknown> = {};
 
    if (userRole === 'tenant') {
      // Tenant: chỉ thấy device của phòng mình
      // Lấy room_id từ user document
      const User = this.deviceModel.db.model('User');
      const user = await User.findById(userId).select('room_id').lean() as any;
      if (!user?.room_id) return [];
      filter.room_id = user.room_id;
    } else if (userRole === 'owner') {
      // Owner: thấy tất cả device của phòng mình
      const Room = this.deviceModel.db.model('Room');
      const ownerRooms = await Room.find({ owner_id: new Types.ObjectId(userId) })
        .select('_id')
        .lean();
      const roomIds = ownerRooms.map((r: any) => r._id);
      filter.room_id = { $in: roomIds };
      if (roomId) filter.room_id = new Types.ObjectId(roomId); // override nếu filter cụ thể
    } else {
      // Admin: thấy tất cả
      if (roomId) filter.room_id = new Types.ObjectId(roomId);
    }
 
    return this.deviceModel
      .find(filter)
      .select('-password_hash') // không trả password_hash
      .lean();
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // GET /devices/:id/logs — lịch sử thiết bị
  // ══════════════════════════════════════════════════════════════════════════
  async getDeviceLogs(
    deviceId: string,
    query: GetLogsQueryDto,
    userRole: string,
    userId: string,
  ) {
    const device = await this.deviceModel.findById(deviceId).lean();
    if (!device) throw new NotFoundException(`Device "${deviceId}" not found.`);
 
    // Tenant chỉ xem log của phòng mình
    if (userRole === 'tenant') {
      const User = this.deviceModel.db.model('User');
      const user = await User.findById(userId).select('room_id').lean() as any;
      if (!user?.room_id || user.room_id.toString() !== device.room_id.toString()) {
        throw new ForbiddenException('Access denied: device does not belong to your room.');
      }
    }
 
    // Owner chỉ xem log của phòng mình
    if (userRole === 'owner') {
      const Room = this.deviceModel.db.model('Room');
      const room = await Room.findById(device.room_id).lean() as any;
      if (!room || room.owner_id.toString() !== userId) {
        throw new ForbiddenException('Access denied: device does not belong to your room.');
      }
    }
 
    const filter: Record<string, unknown> = { device_id: deviceId };
    if (query.event) filter.event = query.event;
 
    return this.deviceLogModel
      .find(filter)
      .sort({ ts: -1 })
      .limit(query.limit ?? 50)
      .lean();
  }
}

//
// LUỒNG XỬ LÝ CHÍNH khi IoT gửi data lên POST /devices/status:
//
//   1. Validate device tồn tại trong DB               (await - phải xong trước)
//   2. Lưu DeviceLog                                   (await - audit trail)
//   3. Cập nhật Device.last_state, last_seen, status   (await - dashboard cần)
//   4. Nếu FIRE / PASSWORD_FAIL → tạo Alert            (await - cần alertId)
//   5. Emit Socket.io realtime                         (KHÔNG await - fire-and-forget)
//   6. Trả về response 200                             (~20ms tổng)