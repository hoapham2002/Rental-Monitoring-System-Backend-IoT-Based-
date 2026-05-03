import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StatsService } from './stats.service';
import { Room, Bill, Alert, Device } from '../common/schemas';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ownerId = new Types.ObjectId().toString();
const roomId  = new Types.ObjectId();

const mockRooms = [
  { _id: roomId, owner_id: new Types.ObjectId(ownerId), status: 'occupied' },
];

// ── Model mocks ───────────────────────────────────────────────────────────────
const makeFindSelect = (val: unknown) => ({
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(val) }),
  }),
});

const roomModelMock = {
  ...makeFindSelect(mockRooms),
  countDocuments: jest.fn().mockResolvedValue(1),
  aggregate:      jest.fn().mockResolvedValue([{ _id: 'occupied', count: 1 }]),
};

const billModelMock = {
  countDocuments: jest.fn().mockResolvedValue(2),
  aggregate:      jest.fn().mockResolvedValue([
    { month: 1, total_revenue: 5_000_000, bill_count: 2, avg_bill: 2_500_000 },
  ]),
};

const alertModelMock = {
  countDocuments: jest.fn().mockResolvedValue(3),
  aggregate:      jest.fn().mockResolvedValue([
    { type: 'fire', count: 2 },
    { type: 'security', count: 1 },
  ]),
};

const deviceModelMock = {
  countDocuments: jest.fn().mockResolvedValue(1),
  aggregate:      jest.fn().mockResolvedValue([
    { status: 'online', count: 4 },
    { status: 'offline', count: 1 },
  ]),
};

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('StatsService', () => {
  let service: StatsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: getModelToken(Room.name),   useValue: roomModelMock },
        { provide: getModelToken(Bill.name),   useValue: billModelMock },
        { provide: getModelToken(Alert.name),  useValue: alertModelMock },
        { provide: getModelToken(Device.name), useValue: deviceModelMock },
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
    jest.clearAllMocks();
  });

  // ── getOverview ─────────────────────────────────────────────────────────────
  describe('getOverview()', () => {
    it('runs 6 queries in parallel and returns summary', async () => {
      roomModelMock.find.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockRooms) }),
      });
      roomModelMock.countDocuments.mockResolvedValue(3);
      roomModelMock.aggregate.mockResolvedValue([
        { _id: 'empty', count: 1 },
        { _id: 'occupied', count: 2 },
      ]);
      alertModelMock.countDocuments.mockResolvedValue(2);
      billModelMock.countDocuments.mockResolvedValue(1);
      deviceModelMock.countDocuments.mockResolvedValue(0);

      const result = await service.getOverview('owner', ownerId);

      expect(result).toHaveProperty('total_rooms');
      expect(result).toHaveProperty('rooms_by_status');
      expect(result).toHaveProperty('active_alerts');
      expect(result).toHaveProperty('unpaid_bills');
      expect(result).toHaveProperty('devices_offline');
      expect(result).toHaveProperty('today_alerts');
      expect(result.rooms_by_status).toHaveProperty('empty');
      expect(result.rooms_by_status).toHaveProperty('occupied');
      expect(result.rooms_by_status).toHaveProperty('maintenance');
    });

    it('throws ForbiddenException for tenant role', async () => {
      await expect(
        service.getOverview('tenant', ownerId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── getRevenue ──────────────────────────────────────────────────────────────
  describe('getRevenue()', () => {
    it('returns 12 months data with zeros for missing months', async () => {
      roomModelMock.find.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockRooms) }),
      });
      billModelMock.aggregate.mockResolvedValue([
        { month: 3, total_revenue: 7_500_000, bill_count: 3, avg_bill: 2_500_000 },
        { month: 6, total_revenue: 5_000_000, bill_count: 2, avg_bill: 2_500_000 },
      ]);

      const result = await service.getRevenue('owner', ownerId, 2025);

      expect(result.year).toBe(2025);
      expect(result.monthly).toHaveLength(12);
      // Tháng có data
      expect(result.monthly[2].total_revenue).toBe(7_500_000); // index 2 = month 3
      expect(result.monthly[5].total_revenue).toBe(5_000_000); // index 5 = month 6
      // Tháng không có data → 0
      expect(result.monthly[0].total_revenue).toBe(0);
      expect(result.monthly[11].total_revenue).toBe(0);
      // Tổng đúng
      expect(result.total_revenue).toBe(12_500_000);
    });

    it('admin sees all rooms (no filter)', async () => {
      roomModelMock.find.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });
      billModelMock.aggregate.mockResolvedValue([]);

      const result = await service.getRevenue('admin', ownerId, 2025);

      // Admin: pipeline không có room_id filter
      const pipelineArg = billModelMock.aggregate.mock.calls[0][0];
      const matchStage  = pipelineArg.find((s: any) => s.$match);
      expect(matchStage.$match).not.toHaveProperty('room_id');
      expect(result.monthly).toHaveLength(12);
    });
  });

  // ── getAlertStats ───────────────────────────────────────────────────────────
  describe('getAlertStats()', () => {
    it('returns alert breakdown by type, severity, and day', async () => {
      roomModelMock.find.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockRooms) }),
      });
      alertModelMock.aggregate
        .mockResolvedValueOnce([{ type: 'fire', count: 3 }])          // byType
        .mockResolvedValueOnce([{ severity: 'critical', count: 3 }])  // bySeverity
        .mockResolvedValueOnce([{ date: '2025-01-15', count: 3, critical: 3 }]); // byDay
      alertModelMock.countDocuments.mockResolvedValue(1);

      const result = await service.getAlertStats('owner', ownerId, 7);

      expect(result).toHaveProperty('period_days', 7);
      expect(result).toHaveProperty('total_unresolved');
      expect(result).toHaveProperty('by_type');
      expect(result).toHaveProperty('by_severity');
      expect(result).toHaveProperty('by_day');
    });
  });

  // ── getDeviceStats ──────────────────────────────────────────────────────────
  describe('getDeviceStats()', () => {
    it('calculates online ratio correctly', async () => {
      roomModelMock.find.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockRooms) }),
      });
      deviceModelMock.aggregate
        .mockResolvedValueOnce([
          { status: 'online', count: 8 },
          { status: 'offline', count: 2 },
        ])
        .mockResolvedValueOnce([
          { type: 'lock', total: 3, online: 3, offline: 0 },
        ]);
      deviceModelMock.countDocuments.mockResolvedValue(1);

      const result = await service.getDeviceStats('owner', ownerId);

      expect(result.total).toBe(10);
      expect(result.online).toBe(8);
      expect(result.offline).toBe(2);
      expect(result.online_ratio).toBe('80%');
      expect(result).toHaveProperty('stale_devices');
      expect(result).toHaveProperty('by_type');
    });
  });
});
