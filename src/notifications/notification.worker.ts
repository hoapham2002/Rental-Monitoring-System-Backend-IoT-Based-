import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Notification, NotificationDocument } from '../common/schemas';
import { IoTGateway } from '../gateway/iot.gateway';
import {
  NOTIFICATION_QUEUE,
  JOB_PUSH_SOCKET,
  JOB_SAVE_DB,
  NotificationJobData,
  PushSocketJobData,
  SaveDbJobData,
} from './notification.queue';
 
@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private worker!: Worker<NotificationJobData>;
 
  constructor(
    @InjectModel(Notification.name)
    private readonly notifModel: Model<NotificationDocument>,
 
    private readonly gateway: IoTGateway,
    private readonly config: ConfigService,
  ) {}
 
  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onModuleInit() {
    this.worker = new Worker<NotificationJobData>(
      NOTIFICATION_QUEUE,
      async (job: Job<NotificationJobData>) => this.processJob(job),
      {
        connection: {
          host: this.config.get<string>('REDIS_HOST', '127.0.0.1'),
          port: this.config.get<number>('REDIS_PORT', 6379),
          password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        },
        concurrency: 5,
      },
    );
 
    this.worker.on('completed', (job) => {
      this.logger.debug(`Job completed: ${job.id} (${job.name})`);
    });
 
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job failed: ${job?.id} (${job?.name}) — attempt ${job?.attemptsMade}`,
        err.message,
      );
    });
 
    this.logger.log('Notification worker started, listening on queue...');
  }
 
  async onModuleDestroy() {
    await this.worker?.close();
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // Main job processor
  // ══════════════════════════════════════════════════════════════════════════
  private async processJob(job: Job<NotificationJobData>): Promise<void> {
    switch (job.name) {
      case JOB_PUSH_SOCKET:
        await this.handlePushSocket(job.data as PushSocketJobData);
        break;
 
      case JOB_SAVE_DB:
        await this.handleSaveDb(job.data as SaveDbJobData);
        break;
 
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // push_socket: emit thông báo realtime tới user
  // ══════════════════════════════════════════════════════════════════════════
  private async handlePushSocket(data: PushSocketJobData): Promise<void> {
    const { userId, roomId, event, payload } = data;
 
    // Emit tới user channel (private notification)
    this.gateway.broadcastToAll(`notif:${userId}`, payload);
 
    // Emit tới room channel (FE dashboard có thể lắng nghe)
    this.gateway.emitDeviceUpdate(roomId, {
      deviceId: '',
      status: 'online',
      last_state: null,
      last_seen: null,
      ...(payload as any),     // extend payload cho FE nếu cần
    });
 
    // Thực ra dùng event riêng cho notification rõ hơn:
    this.gateway.broadcastToAll('notification', {
      targetUserId: userId,
      ...payload,
    });
 
    this.logger.debug(
      `Socket pushed to user ${userId} | type: ${payload.notifType}`,
    );
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // save_db: lưu thông báo vào MongoDB
  // ══════════════════════════════════════════════════════════════════════════
  private async handleSaveDb(data: SaveDbJobData): Promise<void> {
    const { userId, notifType, title, body, ref_id } = data;
 
    await this.notifModel.create({
      user_id: new Types.ObjectId(userId),
      type: notifType,
      ref_id: ref_id ? new Types.ObjectId(ref_id) : null,
      title,
      body,
      read: false,
      ts: new Date(),
    });
 
    this.logger.debug(
      `Notification saved to DB for user ${userId} | type: ${notifType}`,
    );
  }
}

//
// ═══════════════════════════════════════════════════════════════════
// NOTIFICATION WORKER — Task 3.3
// ═══════════════════════════════════════════════════════════════════
//
// Worker chạy trong cùng NestJS process, lắng nghe queue 'notifications'.
//
// Xử lý 2 loại job:
//
//   push_socket:
//     → Emit Socket.io event 'notification' tới đúng user (private)
//     → Cũng emit tới room channel (FE dashboard)
//
//   save_db:
//     → Lưu document vào Notifications collection
//     → FE/Mobile sau đó GET /notifications để lấy lịch sử
//
// Concurrency = 5: xử lý tối đa 5 jobs song song
// Retry: do BullMQ tự quản lý (3 lần, exponential backoff từ queue config)
// ═══════════════════════════════════════════════════════════════════