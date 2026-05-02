import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DevicesService } from './devices.service';
import { Device, DeviceLog, Alert } from '../common/schemas';
import { IoTGateway } from '../gateway/iot.gateway';
 
// ── Fixtures ────────────────────────────────────────────────────────────────
const roomId = new Types.ObjectId();
const mockDevice = {
  _id: 'FIRE_101',
  room_id: roomId,
  type: 'fire_sensor',
  status: 'online',
  last_state: 'NORMAL',
  last_seen: new Date(),
};
 
const mockLock = {
  _id: 'LOCK_101',
  room_id: roomId,
  type: 'lock',
  status: 'online',
  last_state: 'LOCKED',
  last_seen: new Date(),
};
 
// ── Model mocks ──────────────────────────────────────────────────────────────
const deviceModelMock = {
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  find: jest.fn(),
  db: { model: jest.fn() },
};
 
const deviceLogModelMock = {
  create: jest.fn(),
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    }),
  }),
};
 
const alertModelMock = {
  create: jest.fn(),
};
 
const gatewayMock = {
  emitAlert: jest.fn(),
  emitDeviceUpdate: jest.fn(),
  broadcastToAll: jest.fn(),
};
 
// ── Tests ────────────────────────────────────────────────────────────────────
describe('DevicesService', () => {
  let service: DevicesService;
 
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: getModelToken(Device.name), useValue: deviceModelMock },
        { provide: getModelToken(DeviceLog.name), useValue: deviceLogModelMock },
        { provide: getModelToken(Alert.name), useValue: alertModelMock },
        { provide: IoTGateway, useValue: gatewayMock },
      ],
    }).compile();
 
    service = module.get<DevicesService>(DevicesService);
    jest.clearAllMocks();
  });
 
  // ── handleStatusUpdate ─────────────────────────────────────────────────────
  describe('handleStatusUpdate()', () => {
    it('logs event and returns ok:true for normal status', async () => {
      deviceModelMock.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDevice) });
      deviceModelMock.findByIdAndUpdate.mockResolvedValue({});
      deviceLogModelMock.create.mockResolvedValue({});
 
      const result = await service.handleStatusUpdate({
        deviceId: 'FIRE_101',
        value: 'NORMAL',
      });
 
      expect(result.ok).toBe(true);
      expect(result.alert_created).toBe(false);
      expect(deviceLogModelMock.create).toHaveBeenCalledTimes(1);
    });
 
    it('creates FIRE alert and emits socket event', async () => {
      deviceModelMock.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDevice) });
      deviceModelMock.findByIdAndUpdate.mockResolvedValue({});
      deviceLogModelMock.create.mockResolvedValue({});
      alertModelMock.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        type: 'fire',
        severity: 'critical',
        message: '🔥 Phát hiện cháy',
      });
 
      const result = await service.handleStatusUpdate({
        deviceId: 'FIRE_101',
        value: 'FIRE',
      });
 
      expect(result.alert_created).toBe(true);
      expect(alertModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'fire', severity: 'critical' }),
      );
      expect(gatewayMock.emitAlert).toHaveBeenCalledTimes(1);
    });
 
    it('creates security alert on PASSWORD_FAIL', async () => {
      deviceModelMock.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockLock) });
      deviceModelMock.findByIdAndUpdate.mockResolvedValue({});
      deviceLogModelMock.create.mockResolvedValue({});
      alertModelMock.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        type: 'security',
        severity: 'warning',
        message: '🔐 Nhập sai mật khẩu',
      });
 
      const result = await service.handleStatusUpdate({
        deviceId: 'LOCK_101',
        value: 'PASSWORD_FAIL',
      });
 
      expect(result.alert_created).toBe(true);
      expect(alertModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'security', severity: 'warning' }),
      );
    });
 
    it('throws NotFoundException if device not found', async () => {
      deviceModelMock.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
 
      await expect(
        service.handleStatusUpdate({ deviceId: 'GHOST_999', value: 'FIRE' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
 
  // ── controlDevice ──────────────────────────────────────────────────────────
  describe('controlDevice()', () => {
    it('sends UNLOCK command to lock device', async () => {
      deviceModelMock.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockLock) });
      deviceModelMock.findByIdAndUpdate.mockResolvedValue({});
      deviceLogModelMock.create.mockResolvedValue({});
 
      const result = await service.controlDevice(
        { deviceId: 'LOCK_101', command: 'UNLOCK' },
        'user-id-123',
        'owner',
      );
 
      expect(result.ok).toBe(true);
      expect(result.command_sent).toBe('UNLOCK');
      expect(result.new_state).toBe('UNLOCKED');
      expect(gatewayMock.broadcastToAll).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({ command: 'UNLOCK' }),
      );
    });
 
    it('throws BadRequestException if sending UNLOCK to light device', async () => {
      const lightDevice = { ...mockDevice, _id: 'LIGHT_101', type: 'light' };
      deviceModelMock.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(lightDevice) });
 
      await expect(
        service.controlDevice(
          { deviceId: 'LIGHT_101', command: 'UNLOCK' },
          'user-id-123',
          'owner',
        ),
      ).rejects.toThrow(BadRequestException);
    });
 
    it('throws BadRequestException if device is offline', async () => {
      const offlineDevice = { ...mockLock, status: 'offline' };
      deviceModelMock.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(offlineDevice) });
 
      await expect(
        service.controlDevice(
          { deviceId: 'LOCK_101', command: 'UNLOCK' },
          'user-id-123',
          'owner',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});