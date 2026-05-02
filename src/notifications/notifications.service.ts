import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Notification, NotificationDocument, User, UserDocument } from '../common/schemas';
import {
  NOTIFICATION_QUEUE,
  JOB_PUSH_SOCKET,
  JOB_SAVE_DB,
  DEFAULT_JOB_OPTIONS,
  NotificationJobData,
} from './notification.queue';
 
export interface AlertNotifPayload {
  alertId: string;
  roomId: string;
  type: 'fire' | 'security' | 'system';
  severity: 'info' | 'warning' | 'critical';
  message: string;
}
 
export interface BillNotifPayload {
  billId: string;
  roomId: string;
  tenantId: string;
  month: number;
  year: number;
  totalAmount: number;
}
 
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private queue!: Queue<NotificationJobData>;
 
  constructor(
    @InjectModel(Notification.name)
    private readonly notifModel: Model<NotificationDocument>,
 
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
 
    private readonly config: ConfigService,
  ) {}
 
  // ── Lifecycle: khởi tạo và đóng Queue connection ─────────────────────────
  onModuleInit() {
    this.queue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE, {
      connection: {
        host: this.config.get<string>('REDIS_HOST', '127.0.0.1'),
        port: this.config.get<number>('REDIS_PORT', 6379),
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      },
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    this.logger.log('Notification queue connected to Redis');
  }
 
  async onModuleDestroy() {
    await this.queue?.close();
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // Gọi từ DevicesService khi có Alert (FIRE / PASSWORD_FAIL)
  // ══════════════════════════════════════════════════════════════════════════
  async notifyAlert(payload: AlertNotifPayload): Promise<void> {
    const { alertId, roomId, type, severity, message } = payload;
 
    // Lấy tất cả user liên quan đến phòng này
    const targetUserIds = await this.getUserIdsForRoom(roomId);
    if (targetUserIds.length === 0) {
      this.logger.warn(`No users found for room ${roomId}, skipping notification`);
      return;
    }
 
    const title = type === 'fire'
      ? '🔥 Cảnh báo cháy!'
      : severity === 'warning'
      ? '🔐 Cảnh báo bảo mật'
      : '⚠️ Cảnh báo hệ thống';
 
    const ts = new Date().toISOString();
 
    // Enqueue jobs cho từng user — KHÔNG await
    for (const userId of targetUserIds) {
      this.queue.add(JOB_PUSH_SOCKET, {
        type: 'push_socket',
        userId,
        roomId,
        event: 'notification',
        payload: {
          alertId,
          notifType: 'alert',
          title,
          body: message,
          ref_id: alertId,
          ts,
        },
      } satisfies NotificationJobData).catch((err) =>
        this.logger.error(`Failed to enqueue push_socket for user ${userId}`, err),
      );
 
      this.queue.add(JOB_SAVE_DB, {
        type: 'save_db',
        userId,
        notifType: 'alert',
        title,
        body: message,
        ref_id: alertId,
      } satisfies NotificationJobData).catch((err) =>
        this.logger.error(`Failed to enqueue save_db for user ${userId}`, err),
      );
    }
 
    this.logger.log(
      `Alert notifications queued for ${targetUserIds.length} users — alertId: ${alertId}`,
    );
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // Gọi từ BillsService khi tạo hóa đơn mới (Phase 4)
  // ══════════════════════════════════════════════════════════════════════════
  async notifyBill(payload: BillNotifPayload): Promise<void> {
    const { billId, tenantId, month, year, totalAmount } = payload;
 
    const formatted = new Intl.NumberFormat('vi-VN').format(totalAmount);
    const title = `📄 Hóa đơn tháng ${month}/${year}`;
    const body = `Hóa đơn tháng ${month}/${year} đã được tạo. Tổng tiền: ${formatted}đ. Vui lòng thanh toán trước ngày 5.`;
    const ts = new Date().toISOString();
 
    // Chỉ notify đúng tenant đó
    this.queue.add(JOB_PUSH_SOCKET, {
      type: 'push_socket',
      userId: tenantId,
      roomId: payload.roomId,
      event: 'notification',
      payload: {
        billId,
        notifType: 'bill',
        title,
        body,
        ref_id: billId,
        ts,
      },
    } satisfies NotificationJobData).catch((err) =>
      this.logger.error(`Failed to enqueue bill push_socket for tenant ${tenantId}`, err),
    );
 
    this.queue.add(JOB_SAVE_DB, {
      type: 'save_db',
      userId: tenantId,
      notifType: 'bill',
      title,
      body,
      ref_id: billId,
    } satisfies NotificationJobData).catch((err) =>
      this.logger.error(`Failed to enqueue bill save_db for tenant ${tenantId}`, err),
    );
 
    this.logger.log(`Bill notification queued for tenant ${tenantId} — billId: ${billId}`);
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // GET /notifications — lấy danh sách thông báo của user hiện tại
  // ══════════════════════════════════════════════════════════════════════════
  async getNotifications(userId: string, onlyUnread?: boolean) {
    const filter: Record<string, unknown> = {
      user_id: new Types.ObjectId(userId),
    };
    if (onlyUnread === true) filter.read = false;
 
    const [data, unread_count] = await Promise.all([
      this.notifModel
        .find(filter)
        .sort({ ts: -1 })
        .limit(50)
        .lean(),
      this.notifModel.countDocuments({
        user_id: new Types.ObjectId(userId),
        read: false,
      }),
    ]);
 
    return { data, unread_count };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // PATCH /notifications/:id/read
  // ══════════════════════════════════════════════════════════════════════════
  async markAsRead(notifId: string, userId: string) {
    if (!Types.ObjectId.isValid(notifId)) {
      return { ok: false, message: 'Invalid notification ID' };
    }
 
    const updated = await this.notifModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notifId),
        user_id: new Types.ObjectId(userId), // chỉ update notif của chính mình
      },
      { $set: { read: true } },
      { new: true },
    );
 
    return { ok: !!updated, notification: updated };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // PATCH /notifications/read-all — đánh dấu tất cả đã đọc
  // ══════════════════════════════════════════════════════════════════════════
  async markAllAsRead(userId: string) {
    const result = await this.notifModel.updateMany(
      { user_id: new Types.ObjectId(userId), read: false },
      { $set: { read: true } },
    );
    return { ok: true, updated: result.modifiedCount };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // Helper: lấy tất cả userIds cần nhận thông báo cho 1 phòng
  // = tenant đang ở + owner của phòng
  // ══════════════════════════════════════════════════════════════════════════
  private async getUserIdsForRoom(roomId: string): Promise<string[]> {
    const Room = this.notifModel.db.model('Room');
    const room = await Room.findById(roomId)
      .select('owner_id current_tenant_id')
      .lean() as any;
 
    if (!room) return [];
 
    const ids: string[] = [];
    if (room.owner_id) ids.push(room.owner_id.toString());
    if (room.current_tenant_id) ids.push(room.current_tenant_id.toString());
 
    return [...new Set(ids)]; // deduplicate nếu owner === tenant (edge case)
  }
}

//
// ═══════════════════════════════════════════════════════════════════
// NOTIFICATION SERVICE — Task 3.2
// ═══════════════════════════════════════════════════════════════════
//
// Được gọi từ:
//   - DevicesService.handleStatusUpdate() khi có FIRE / PASSWORD_FAIL
//   - BillsService.createBill() khi tạo hóa đơn mới (Phase 4)
//
// Flow:
//   1. Xác định danh sách userId cần nhận thông báo
//   2. Enqueue 2 jobs / user: push_socket + save_db
//   3. Không await queue.add() — fire-and-forget hoàn toàn
//
// NotificationService KHÔNG xử lý gửi thực sự.
// Việc gửi là trách nhiệm của NotificationWorker.
// ═══════════════════════════════════════════════════════════════════