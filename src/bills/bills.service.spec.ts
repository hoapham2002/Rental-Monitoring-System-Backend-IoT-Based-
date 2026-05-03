import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { BillsService } from './bills.service';
import { Bill, Room, User } from '../common/schemas';
import { NotificationsService } from '../notifications/notifications.service';
 
// ── Fixtures ──────────────────────────────────────────────────────────────────
const ownerId  = new Types.ObjectId().toString();
const tenantId = new Types.ObjectId().toString();
const roomId   = new Types.ObjectId().toString();
const billId   = new Types.ObjectId().toString();
 
const mockRoom = {
  _id:                new Types.ObjectId(roomId),
  owner_id:           new Types.ObjectId(ownerId),
  current_tenant_id:  new Types.ObjectId(tenantId),
  status:             'occupied',
  base_price:         2_500_000,
};
 
const mockTenant = {
  _id:   new Types.ObjectId(tenantId),
  name:  'Tran Thi B',
  phone: '0922222222',
  role:  'tenant',
};
 
const mockBill = {
  _id:                    new Types.ObjectId(billId),
  room_id:                new Types.ObjectId(roomId),
  tenant_id:              new Types.ObjectId(tenantId),
  tenant_name_snapshot:   'Tran Thi B',
  tenant_phone_snapshot:  '0922222222',
  month:                  1,
  year:                   2025,
  electricity_index:      100,
  water_index:            8,
  total_amount:           2_500_000 + 100 * 3_500 + 8 * 15_000,
  status:                 'unpaid',
  paid_at:                null,
};
 
// ── Model mocks ───────────────────────────────────────────────────────────────
const lean = (val: unknown) => ({ lean: jest.fn().mockResolvedValue(val) });
 
const billModelMock = {
  create:             jest.fn().mockResolvedValue(mockBill),
  find:               jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockBill]) }) }),
  findById:           jest.fn().mockReturnValue(lean(mockBill)),
  findOneAndUpdate:   jest.fn().mockResolvedValue({ ...mockBill, status: 'paid', paid_at: new Date() }),
  exists:             jest.fn().mockResolvedValue(null),
};
 
const roomModelMock = {
  findById:   jest.fn().mockReturnValue(lean(mockRoom)),
  find:       jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockRoom]) }) }),
};
 
const userModelMock = {
  findById: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue(lean(mockTenant)),
  }),
};
 
const notificationsServiceMock = {
  notifyBill: jest.fn().mockResolvedValue(undefined),
};
 
// ── Tests ─────────────────────────────────────────────────────────────────────
describe('BillsService', () => {
  let service: BillsService;
 
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillsService,
        { provide: getModelToken(Bill.name), useValue: billModelMock },
        { provide: getModelToken(Room.name), useValue: roomModelMock },
        { provide: getModelToken(User.name), useValue: userModelMock },
        { provide: NotificationsService,     useValue: notificationsServiceMock },
      ],
    }).compile();
 
    service = module.get<BillsService>(BillsService);
    jest.clearAllMocks();
  });
 
  // ── createBill ────────────────────────────────────────────────────────────
  describe('createBill()', () => {
    const dto = {
      room_id:            roomId,
      month:              1,
      year:               2025,
      electricity_index:  100,
      water_index:        8,
    };
 
    it('creates bill and enqueues notification', async () => {
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
      userModelMock.findById.mockReturnValue({
        select: jest.fn().mockReturnValue(lean(mockTenant)),
      });
      billModelMock.create.mockResolvedValue(mockBill);
 
      const result = await service.createBill(dto, ownerId);
 
      expect(billModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          month:                 1,
          year:                  2025,
          tenant_name_snapshot:  'Tran Thi B',
          total_amount:          2_500_000 + 100 * 3_500 + 8 * 15_000,
        }),
      );
      expect(notificationsServiceMock.notifyBill).toHaveBeenCalled();
      expect(result.status).toBe('unpaid');
    });
 
    it('calculates total_amount correctly', async () => {
      roomModelMock.findById.mockReturnValue(
        lean({ ...mockRoom, base_price: 3_000_000 }),
      );
      userModelMock.findById.mockReturnValue({
        select: jest.fn().mockReturnValue(lean(mockTenant)),
      });
 
      const expectedTotal = 3_000_000 + 50 * 3_500 + 5 * 15_000;
      billModelMock.create.mockResolvedValue({
        ...mockBill,
        total_amount: expectedTotal,
      });
 
      const result = await service.createBill(
        { ...dto, electricity_index: 50, water_index: 5 },
        ownerId,
      );
      expect(result.total_amount).toBe(expectedTotal);
    });
 
    it('throws ForbiddenException if owner does not own the room', async () => {
      roomModelMock.findById.mockReturnValue(
        lean({ ...mockRoom, owner_id: new Types.ObjectId() }),
      );
 
      await expect(service.createBill(dto, ownerId)).rejects.toThrow(ForbiddenException);
    });
 
    it('throws BadRequestException if room has no tenant', async () => {
      roomModelMock.findById.mockReturnValue(
        lean({ ...mockRoom, current_tenant_id: null }),
      );
 
      await expect(service.createBill(dto, ownerId)).rejects.toThrow(BadRequestException);
    });
 
    it('throws ConflictException on duplicate bill (MongoDB error 11000)', async () => {
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
      userModelMock.findById.mockReturnValue({
        select: jest.fn().mockReturnValue(lean(mockTenant)),
      });
      billModelMock.create.mockRejectedValue({ code: 11000 });
 
      await expect(service.createBill(dto, ownerId)).rejects.toThrow(ConflictException);
    });
  });
 
  // ── confirmPayment ────────────────────────────────────────────────────────
  describe('confirmPayment()', () => {
    it('marks bill as paid with atomic update', async () => {
      billModelMock.findById.mockReturnValue(lean(mockBill));
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
      const paidBill = { ...mockBill, status: 'paid', paid_at: new Date() };
      billModelMock.findOneAndUpdate.mockResolvedValue(paidBill);
 
      const result = await service.confirmPayment(billId, ownerId);
 
      expect(result.ok).toBe(true);
      expect(result.bill.status).toBe('paid');
      expect(result.paid_at).toBeDefined();
 
      // Verify atomic update used $ne guard
      expect(billModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: { $ne: 'paid' } }),
        expect.objectContaining({ $set: expect.objectContaining({ status: 'paid' }) }),
        expect.anything(),
      );
    });
 
    it('throws ConflictException if bill already paid', async () => {
      billModelMock.findById.mockReturnValue(
        lean({ ...mockBill, status: 'paid', paid_at: new Date() }),
      );
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
 
      await expect(service.confirmPayment(billId, ownerId)).rejects.toThrow(ConflictException);
    });
 
    it('throws ForbiddenException if owner does not own the room', async () => {
      billModelMock.findById.mockReturnValue(lean(mockBill));
      roomModelMock.findById.mockReturnValue(
        lean({ ...mockRoom, owner_id: new Types.ObjectId() }),
      );
 
      await expect(service.confirmPayment(billId, ownerId)).rejects.toThrow(ForbiddenException);
    });
  });
 
  // ── getMyBills ────────────────────────────────────────────────────────────
  describe('getMyBills()', () => {
    it('returns bills for the tenant', async () => {
      const bills = [mockBill];
      billModelMock.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(bills) }),
      });
 
      const result = await service.getMyBills(tenantId, {});
      expect(result).toHaveLength(1);
      expect(billModelMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: expect.any(Types.ObjectId) }),
      );
    });
  });
});