import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RoomsService } from './rooms.service';
import { Room, User, Device, Bill } from '../common/schemas';
 
// ── Fixtures ──────────────────────────────────────────────────────────────────
const ownerId  = new Types.ObjectId().toString();
const tenantId = new Types.ObjectId().toString();
const roomId   = new Types.ObjectId().toString();
 
const mockRoom = {
  _id: new Types.ObjectId(roomId),
  name: 'Phòng 101',
  floor: 1,
  owner_id: new Types.ObjectId(ownerId),
  current_tenant_id: null,
  status: 'empty',
  base_price: 2_500_000,
};
 
const mockTenant = {
  _id: new Types.ObjectId(tenantId),
  name: 'Tran Thi B',
  email: 'b@demo.com',
  role: 'tenant',
  room_id: null,
};
 
// ── Model mocks ───────────────────────────────────────────────────────────────
const lean = (val: unknown) => ({ lean: jest.fn().mockResolvedValue(val) });
 
const roomModelMock = {
  find: jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockRoom]) }),
    }),
  }),
  findById: jest.fn().mockReturnValue(lean(mockRoom)),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
  findByIdAndDelete: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue(mockRoom),
};
 
const userModelMock = {
  findById: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue(lean(mockTenant)),
    lean: jest.fn().mockResolvedValue(mockTenant),
  }),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
};
 
const deviceModelMock = {
  countDocuments: jest.fn().mockResolvedValue(0),
};
 
const billModelMock = {
  exists: jest.fn().mockResolvedValue(null),
};
 
// ── Tests ─────────────────────────────────────────────────────────────────────
describe('RoomsService', () => {
  let service: RoomsService;
 
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: getModelToken(Room.name),   useValue: roomModelMock },
        { provide: getModelToken(User.name),   useValue: userModelMock },
        { provide: getModelToken(Device.name), useValue: deviceModelMock },
        { provide: getModelToken(Bill.name),   useValue: billModelMock },
      ],
    }).compile();
 
    service = module.get<RoomsService>(RoomsService);
    jest.clearAllMocks();
  });
 
  // ── createRoom ────────────────────────────────────────────────────────────
  describe('createRoom()', () => {
    it('creates and returns a room', async () => {
      roomModelMock.create.mockResolvedValue(mockRoom);
 
      const result = await service.createRoom(
        { name: 'Phòng 101', floor: 1, base_price: 2_500_000 },
        ownerId,
      );
      expect(result.name).toBe('Phòng 101');
      expect(roomModelMock.create).toHaveBeenCalledTimes(1);
    });
  });
 
  // ── assignTenant ──────────────────────────────────────────────────────────
  describe('assignTenant()', () => {
    it('assigns tenant to empty room successfully', async () => {
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
      userModelMock.findById
        .mockReturnValueOnce(lean(mockTenant))  // ownership check user
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(mockTenant) });
 
      const result = await service.assignTenant(
        roomId,
        { tenant_id: tenantId },
        ownerId,
        'owner',
      );
      expect(result.ok).toBe(true);
    });
 
    it('throws ConflictException if room is already occupied', async () => {
      roomModelMock.findById.mockReturnValue(
        lean({ ...mockRoom, status: 'occupied', current_tenant_id: new Types.ObjectId() }),
      );
 
      await expect(
        service.assignTenant(roomId, { tenant_id: tenantId }, ownerId, 'owner'),
      ).rejects.toThrow(ConflictException);
    });
 
    it('throws ForbiddenException if owner tries to assign to another owner room', async () => {
      const otherOwnerId = new Types.ObjectId().toString();
      roomModelMock.findById.mockReturnValue(
        lean({ ...mockRoom, owner_id: new Types.ObjectId(otherOwnerId) }),
      );
 
      await expect(
        service.assignTenant(roomId, { tenant_id: tenantId }, ownerId, 'owner'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
 
  // ── deleteRoom ────────────────────────────────────────────────────────────
  describe('deleteRoom()', () => {
    it('deletes room when all integrity checks pass', async () => {
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
      deviceModelMock.countDocuments.mockResolvedValue(0);
      billModelMock.exists.mockResolvedValue(null);
 
      const result = await service.deleteRoom(roomId, ownerId, 'owner');
      expect(result.ok).toBe(true);
      expect(roomModelMock.findByIdAndDelete).toHaveBeenCalledWith(roomId);
    });
 
    it('throws ConflictException if room has tenant', async () => {
      roomModelMock.findById.mockReturnValue(
        lean({ ...mockRoom, current_tenant_id: new Types.ObjectId() }),
      );
 
      await expect(service.deleteRoom(roomId, ownerId, 'owner')).rejects.toThrow(ConflictException);
    });
 
    it('throws ConflictException if room has devices', async () => {
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
      deviceModelMock.countDocuments.mockResolvedValue(2);
 
      await expect(service.deleteRoom(roomId, ownerId, 'owner')).rejects.toThrow(ConflictException);
    });
 
    it('throws ConflictException if room has unpaid bills', async () => {
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
      deviceModelMock.countDocuments.mockResolvedValue(0);
      billModelMock.exists.mockResolvedValue({ _id: new Types.ObjectId() });
 
      await expect(service.deleteRoom(roomId, ownerId, 'owner')).rejects.toThrow(ConflictException);
    });
  });
 
  // ── updateStatus ──────────────────────────────────────────────────────────
  describe('updateStatus()', () => {
    it('throws BadRequestException when setting status to "occupied" directly', async () => {
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
 
      await expect(
        service.updateStatus(roomId, { status: 'occupied' }, ownerId, 'owner'),
      ).rejects.toThrow(BadRequestException);
    });
 
    it('sets room to maintenance successfully', async () => {
      roomModelMock.findById.mockReturnValue(lean(mockRoom));
      roomModelMock.findByIdAndUpdate.mockResolvedValue({});
 
      const result = await service.updateStatus(
        roomId,
        { status: 'maintenance' },
        ownerId,
        'owner',
      );
      expect(result.ok).toBe(true);
      expect(result.new_status).toBe('maintenance');
    });
  });
});