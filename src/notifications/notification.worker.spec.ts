//
// Unit tests cho NotificationWorker.
// Kiểm tra job processor xử lý đúng từng loại job.
 
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { NotificationWorker } from './notification.worker';
import { Notification } from '../common/schemas';
import { IoTGateway } from '../gateway/iot.gateway';
 
// ── Mock BullMQ Worker ────────────────────────────────────────────────────────
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));
 
// ── Mocks ─────────────────────────────────────────────────────────────────────
const notifModelMock = {
  create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
};
 
const gatewayMock = {
  broadcastToAll: jest.fn(),
  emitDeviceUpdate: jest.fn(),
};
 
const configMock = {
  get: jest.fn((key: string, def?: unknown) => {
    const map: Record<string, unknown> = {
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 6379,
    };
    return map[key] ?? def;
  }),
};
 
// ── Tests ─────────────────────────────────────────────────────────────────────
describe('NotificationWorker', () => {
  let worker: NotificationWorker;
 
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationWorker,
        { provide: getModelToken(Notification.name), useValue: notifModelMock },
        { provide: IoTGateway, useValue: gatewayMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
 
    worker = module.get<NotificationWorker>(NotificationWorker);
    worker.onModuleInit();
    jest.clearAllMocks();
  });
 
  afterEach(async () => {
    await worker.onModuleDestroy();
  });
 
  // ── push_socket job ─────────────────────────────────────────────────────────
  describe('handlePushSocket()', () => {
    it('calls gateway.broadcastToAll with correct payload', async () => {
      const userId = new Types.ObjectId().toString();
      const roomId = new Types.ObjectId().toString();
 
      // Access private method via any cast for testing
      await (worker as any).handlePushSocket({
        type: 'push_socket',
        userId,
        roomId,
        event: 'notification',
        payload: {
          alertId: 'alert-123',
          notifType: 'alert',
          title: '🔥 Cảnh báo cháy!',
          body: 'Phát hiện cháy tại phòng 101',
          ref_id: 'alert-123',
          ts: new Date().toISOString(),
        },
      });
 
      expect(gatewayMock.broadcastToAll).toHaveBeenCalledWith(
        `notif:${userId}`,
        expect.objectContaining({ notifType: 'alert' }),
      );
    });
  });
 
  // ── save_db job ─────────────────────────────────────────────────────────────
  describe('handleSaveDb()', () => {
    it('creates notification document in DB', async () => {
      const userId = new Types.ObjectId().toString();
      const refId = new Types.ObjectId().toString();
 
      await (worker as any).handleSaveDb({
        type: 'save_db',
        userId,
        notifType: 'alert',
        title: '🔥 Cảnh báo cháy!',
        body: 'Phát hiện cháy',
        ref_id: refId,
      });
 
      expect(notifModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'alert',
          title: '🔥 Cảnh báo cháy!',
          read: false,
        }),
      );
    });
 
    it('handles null ref_id correctly', async () => {
      const userId = new Types.ObjectId().toString();
 
      await (worker as any).handleSaveDb({
        type: 'save_db',
        userId,
        notifType: 'system',
        title: 'Thông báo hệ thống',
        body: 'Hệ thống đã cập nhật',
        ref_id: null,
      });
 
      expect(notifModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ ref_id: null }),
      );
    });
  });
});
 