import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Bill,
  BillDocument,
  Device,
  DeviceDocument,
  Room,
  RoomDocument,
  User,
  UserDocument,
} from '../common/schemas';
import {
  AssignTenantDto,
  CreateRoomDto,
  GetRoomsQueryDto,
  UpdateRoomStatusDto,
} from './dto/rooms.dto';
 
@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);
 
  constructor(
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Device.name) private readonly deviceModel: Model<DeviceDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
  ) {}
 
  // ══════════════════════════════════════════════════════════════════════════
  // GET /rooms
  // ══════════════════════════════════════════════════════════════════════════
  async getRooms(query: GetRoomsQueryDto, userRole: string, userId: string) {
    const filter: Record<string, unknown> = {};
 
    if (userRole === 'owner') {
      filter.owner_id = new Types.ObjectId(userId);
    } else if (userRole === 'tenant') {
      // Tenant chỉ xem đúng phòng mình
      const user = await this.userModel.findById(userId).select('room_id').lean();
      if (!user?.room_id) return [];
      return this.roomModel.findById(user.room_id).lean().then((r) => (r ? [r] : []));
    }
    // admin: không filter owner
 
    if (query.status) filter.status = query.status;
    if (query.floor) filter.floor = query.floor;
 
    return this.roomModel
      .find(filter)
      .populate('current_tenant_id', 'name email phone')
      .sort({ floor: 1, name: 1 })
      .lean();
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // POST /rooms
  // ══════════════════════════════════════════════════════════════════════════
  async createRoom(dto: CreateRoomDto, ownerId: string) {
    const room = await this.roomModel.create({
      name: dto.name.trim(),
      floor: dto.floor,
      base_price: dto.base_price,
      owner_id: new Types.ObjectId(ownerId),
      current_tenant_id: null,
      status: 'empty',
    });
 
    this.logger.log(`Room created: ${room.name} by owner ${ownerId}`);
    return room;
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // PATCH /rooms/:id/assign — gán tenant vào phòng
  // ══════════════════════════════════════════════════════════════════════════
  async assignTenant(roomId: string, dto: AssignTenantDto, ownerId: string, ownerRole: string) {
    const room = await this.findRoomAndCheckOwnership(roomId, ownerId, ownerRole);
 
    if (room.status === 'occupied') {
      throw new ConflictException(
        `Phòng "${room.name}" đã có người thuê. Hãy gỡ tenant hiện tại trước.`,
      );
    }
    if (room.status === 'maintenance') {
      throw new BadRequestException(`Phòng "${room.name}" đang bảo trì, không thể gán tenant.`);
    }
 
    if (!Types.ObjectId.isValid(dto.tenant_id)) {
      throw new BadRequestException('tenant_id không hợp lệ.');
    }
 
    const tenant = await this.userModel.findById(dto.tenant_id).lean();
    if (!tenant) throw new NotFoundException(`Tenant ${dto.tenant_id} không tồn tại.`);
    if (tenant.role !== 'tenant') {
      throw new BadRequestException('User này không phải role tenant.');
    }
    if (tenant.room_id) {
      throw new ConflictException('Tenant này đã đang ở một phòng khác.');
    }
 
    const tenantObjId = new Types.ObjectId(dto.tenant_id);
 
    // Cập nhật Room và User cùng lúc
    await Promise.all([
      this.roomModel.findByIdAndUpdate(roomId, {
        $set: { current_tenant_id: tenantObjId, status: 'occupied' },
      }),
      this.userModel.findByIdAndUpdate(dto.tenant_id, {
        $set: { room_id: new Types.ObjectId(roomId) },
      }),
    ]);
 
    return {
      ok: true,
      message: `Tenant "${tenant.name}" đã được gán vào phòng "${room.name}".`,
      room_id: roomId,
      tenant_id: dto.tenant_id,
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // PATCH /rooms/:id/status
  // ══════════════════════════════════════════════════════════════════════════
  async updateStatus(roomId: string, dto: UpdateRoomStatusDto, userId: string, userRole: string) {
    const room = await this.findRoomAndCheckOwnership(roomId, userId, userRole);
 
    // Không thể set occupied thủ công — chỉ qua assignTenant
    if (dto.status === 'occupied') {
      throw new BadRequestException(
        'Không thể set status "occupied" trực tiếp. Dùng PATCH /rooms/:id/assign.',
      );
    }
 
    // Nếu chuyển sang empty/maintenance: gỡ tenant hiện tại
    if ((dto.status as string) !== 'occupied' && room.current_tenant_id) {
      await Promise.all([
        this.roomModel.findByIdAndUpdate(roomId, {
          $set: { status: dto.status, current_tenant_id: null },
        }),
        this.userModel.findByIdAndUpdate(room.current_tenant_id, {
          $set: { room_id: null },
        }),
      ]);
    } else {
      await this.roomModel.findByIdAndUpdate(roomId, { $set: { status: dto.status } });
    }
 
    return { ok: true, room_id: roomId, new_status: dto.status };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /rooms/:id — với 3 lớp integrity check (V6 final)
  // ══════════════════════════════════════════════════════════════════════════
  async deleteRoom(roomId: string, userId: string, userRole: string) {
    const room = await this.findRoomAndCheckOwnership(roomId, userId, userRole);
 
    // ── Integrity check 1: Còn tenant ─────────────────────────────────────
    if (room.current_tenant_id) {
      throw new ConflictException(
        'Không thể xóa: phòng đang có tenant. Hãy gỡ tenant trước.',
      );
    }
 
    // ── Integrity check 2: Còn thiết bị ──────────────────────────────────
    const deviceCount = await this.deviceModel.countDocuments({
      room_id: new Types.ObjectId(roomId),
    });
    if (deviceCount > 0) {
      throw new ConflictException(
        `Không thể xóa: còn ${deviceCount} thiết bị liên kết với phòng này.`,
      );
    }
 
    // ── Integrity check 3: Còn hóa đơn chưa thanh toán ───────────────────
    const hasPendingBills = await this.billModel.exists({
      room_id: new Types.ObjectId(roomId),
      status: { $ne: 'paid' },
    });
    if (hasPendingBills) {
      throw new ConflictException(
        'Không thể xóa: còn hóa đơn chưa thanh toán.',
      );
    }
 
    await this.roomModel.findByIdAndDelete(roomId);
 
    this.logger.log(`Room ${roomId} (${room.name}) deleted by ${userId}`);
    return { ok: true, message: `Phòng "${room.name}" đã được xóa.` };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // Helper: tìm room + kiểm tra ownership
  // ══════════════════════════════════════════════════════════════════════════
  private async findRoomAndCheckOwnership(
    roomId: string,
    userId: string,
    userRole: string,
  ): Promise<RoomDocument> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new BadRequestException('room_id không hợp lệ.');
    }
 
    const room = await this.roomModel.findById(roomId).lean() as RoomDocument | null;
    if (!room) throw new NotFoundException(`Phòng ${roomId} không tồn tại.`);
 
    // Admin bypass ownership check
    if (userRole === 'admin') return room;
 
    if ((room as any).owner_id.toString() !== userId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên phòng này.');
    }
 
    return room;
  }
}

//
// ═══════════════════════════════════════════════════════════════════
// ROOMS SERVICE — Task 4.1
// ═══════════════════════════════════════════════════════════════════
//
// Business rules:
//   - Owner chỉ quản lý phòng của mình (owner_id check mọi mutation)
//   - Admin thấy và quản lý tất cả
//   - Tenant chỉ xem phòng đang ở
//
// DELETE integrity (V6 + V6 final):
//   1. current_tenant_id phải null
//   2. Không còn Device nào link tới phòng
//   3. Không còn Bill unpaid/pending
// ═══════════════════════════════════════════════════════════════════