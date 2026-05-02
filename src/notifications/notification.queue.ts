//
// ═══════════════════════════════════════════════════════════════════
// BULLMQ NOTIFICATION QUEUE — Task 3.1
// ═══════════════════════════════════════════════════════════════════
//
// Hai loại job:
//   push_socket  → emit Socket.io event tới đúng user/room (realtime UI)
//   save_db      → lưu document vào Notifications collection (lịch sử)
//
// Cả hai job được enqueue CÙNG LÚC khi có Alert.
// Worker xử lý độc lập, retry tự động nếu fail.
//
// Retry strategy: 3 lần, backoff exponential (1s → 2s → 4s)
// ═══════════════════════════════════════════════════════════════════
 
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
 
// ── Job payload types ────────────────────────────────────────────────────────
 
export interface PushSocketJobData {
  type: 'push_socket';
  userId: string;          // emit tới đúng user
  roomId: string;          // emit tới đúng room (cho FE dashboard)
  event: string;           // Socket.io event name
  payload: {
    alertId?: string;
    billId?: string;
    notifType: 'bill' | 'alert' | 'system';
    title: string;
    body: string;
    ref_id: string | null;
    ts: string;
  };
}
 
export interface SaveDbJobData {
  type: 'save_db';
  userId: string;
  notifType: 'bill' | 'alert' | 'system';
  title: string;
  body: string;
  ref_id: string | null;   // ObjectId của Alert hoặc Bill
}
 
export type NotificationJobData = PushSocketJobData | SaveDbJobData;
 
// ── Queue name constant ──────────────────────────────────────────────────────
export const NOTIFICATION_QUEUE = 'notifications';
 
// ── Job names ────────────────────────────────────────────────────────────────
export const JOB_PUSH_SOCKET = 'push_socket';
export const JOB_SAVE_DB     = 'save_db';
 
// ── Default job options (retry 3x, exponential backoff) ─────────────────────
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,   // 1s → 2s → 4s
  },
  removeOnComplete: 100,   // giữ 100 completed jobs để debug
  removeOnFail: 50,        // giữ 50 failed jobs để inspect
};
 
// ── Factory function để tạo Queue instance (dùng trong tests) ────────────────
export function createNotificationQueue(config: ConfigService): Queue<NotificationJobData> {
  return new Queue<NotificationJobData>(NOTIFICATION_QUEUE, {
    connection: {
      host: config.get<string>('REDIS_HOST', '127.0.0.1'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
    },
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
}