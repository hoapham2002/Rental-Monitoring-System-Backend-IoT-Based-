//
// Unit tests cho NotificationsService.
// Mock Redis/BullMQ hoàn toàn — không cần Redis thật để chạy test.
 
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { NotificationsService } from './notifications.service';
import { Notification, User } from '../common/schemas';
 
// ── Mock Queue (thay BullMQ) ─────────────────────────────────────────────────
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  close: jest.fn().mockResolvedValue(undefined),
};
 
// Mock bullmq module để không cần Redis thật
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueue),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));
 
// ── Fixtures ─────────────────────────────────────────────────────────────────
const roomId = new Types.ObjectId().toString();
const ownerId = new Types.ObjectId().toString();
const tenantId = new Types.ObjectId().toString();
const alertId = new Types.ObjectId().toString();
const billId = new Types.ObjectId().toString();
 
const mockRoom = {
  _id: roomId,
  owner_id: new Types.ObjectId(ownerId),
  current_tenant_id: new Types.ObjectId(tenantId),
};
 
// ── Model mocks ───────────────────────────────────────────────────────────────
const notifModelMock = {
  create: jest.fn(),
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    }),
  }),
  countDocuments: jest.fn().mockResolvedValue(0),
  findOneAndUpdate: jest.fn().mockResolvedValue(null),
  updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
  db: {
    model: jest.fn().mockReturnValue({
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockRoom),
        }),
      }),
    }),
  },
};
 
const userModelMock = {};
 
const configServiceMock = {
  get: jest.fn((key: string, def?: unknown) => {
    const map: Record<string, unknown> = {
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
    };
    return map[key] ?? def;
  }),
};
 
// ── Tests ─────────────────────────────────────────────────────────────────────
describe('NotificationsService', () => {
  let service: NotificationsService;
 
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getModelToken(Notification.name), useValue: notifModelMock },
        { provide: getModelToken(User.name), useValue: userModelMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
 
    service = module.get<NotificationsService>(NotificationsService);
    service.onModuleInit(); // khởi tạo queue thủ công
    jest.clearAllMocks();
  });
 
  afterEach(async () => {
    await service.onModuleDestroy();
  });
 
  // ── notifyAlert ─────────────────────────────────────────────────────────────
  describe('notifyAlert()', () => {
    it('enqueues push_socket + save_db jobs for owner AND tenant', async () => {
      notifModelMock.db.model.mockReturnValue({
        findById: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockRoom),
          }),
        }),
      });
 
      await service.notifyAlert({
        alertId,
        roomId,
        type: 'fire',
        severity: 'critical',
        message: '🔥 Phát hiện cháy!',
      });
 
      // 2 users (owner + tenant) × 2 jobs = 4 queue.add calls
      expect(mockQueue.add).toHaveBeenCalledTimes(4);
 
      // Verify job types
      const calls = mockQueue.add.mock.calls;
      const jobNames = calls.map((c: any[]) => c[0]);
      expect(jobNames.filter((n: string) => n === 'push_socket')).toHaveLength(2);
      expect(jobNames.filter((n: string) => n === 'save_db')).toHaveLength(2);
    });
 
    it('does nothing if room has no users', async () => {
      notifModelMock.db.model.mockReturnValue({
        findById: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null), // room not found
          }),
        }),
      });
 
      await service.notifyAlert({
        alertId,
        roomId,
        type: 'fire',
        severity: 'critical',
        message: 'Fire!',
      });
 
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
 
  // ── notifyBill ──────────────────────────────────────────────────────────────
  describe('notifyBill()', () => {
    it('enqueues exactly 2 jobs for the tenant', async () => {
      await service.notifyBill({
        billId,
        roomId,
        tenantId,
        month: 1,
        year: 2025,
        totalAmount: 3_200_000,
      });
 
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'push_socket',
        expect.objectContaining({ userId: tenantId, type: 'push_socket' }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'save_db',
        expect.objectContaining({ userId: tenantId, notifType: 'bill' }),
      );
    });
 
    it('formats Vietnamese currency in notification body', async () => {
      await service.notifyBill({
        billId,
        roomId,
        tenantId,
        month: 3,
        year: 2025,
        totalAmount: 3_200_000,
      });
 
      const saveDbCall = mockQueue.add.mock.calls.find(
        (c: any[]) => c[0] === 'save_db',
      );
      expect(saveDbCall[1].body).toContain('3.200.000đ');
      expect(saveDbCall[1].title).toContain('tháng 3/2025');
    });
  });
 
  // ── getNotifications ────────────────────────────────────────────────────────
  describe('getNotifications()', () => {
    it('returns data and unread_count', async () => {
      notifModelMock.countDocuments.mockResolvedValue(3);
 
      const result = await service.getNotifications(tenantId);
 
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('unread_count');
      expect(result.unread_count).toBe(3);
    });
  });
 
  // ── markAllAsRead ───────────────────────────────────────────────────────────
  describe('markAllAsRead()', () => {
    it('returns updated count', async () => {
      notifModelMock.updateMany.mockResolvedValue({ modifiedCount: 5 });
 
      const result = await service.markAllAsRead(tenantId);
 
      expect(result.ok).toBe(true);
      expect(result.updated).toBe(5);
    });
  });
});