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
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Bill,
  BillDocument,
  Room,
  RoomDocument,
  User,
  UserDocument,
} from '../common/schemas';
import { CreateBillDto, GetBillsQueryDto } from './dto/bills.dto';
import { NotificationsService } from '../notifications/notifications.service';
 
// Đơn giá (VNĐ)
const ELECTRICITY_PRICE_PER_KWH = 3_500;
const WATER_PRICE_PER_M3        = 15_000;
 
@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);
 
  constructor(
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}
 
  // ══════════════════════════════════════════════════════════════════════════
  // POST /bills — tạo hóa đơn (Owner only)
  // ══════════════════════════════════════════════════════════════════════════
  async createBill(dto: CreateBillDto, ownerId: string) {
    if (!Types.ObjectId.isValid(dto.room_id)) {
      throw new BadRequestException('room_id không hợp lệ.');
    }
 
    // 1. Validate phòng tồn tại + Owner sở hữu phòng này
    const room = await this.roomModel.findById(dto.room_id).lean();
    if (!room) throw new NotFoundException(`Phòng ${dto.room_id} không tồn tại.`);
    if ((room as any).owner_id.toString() !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền tạo hóa đơn cho phòng này.');
    }
 
    // 2. Phòng phải đang có tenant
    if (!(room as any).current_tenant_id) {
      throw new BadRequestException('Phòng chưa có tenant, không thể tạo hóa đơn.');
    }
 
    // 3. Lấy thông tin tenant để snapshot
    const tenant = await this.userModel
      .findById((room as any).current_tenant_id)
      .select('name phone')
      .lean();
    if (!tenant) throw new NotFoundException('Không tìm thấy tenant hiện tại của phòng.');
 
    // 4. Tính tổng tiền
    const total_amount =
      (room as any).base_price +
      dto.electricity_index * ELECTRICITY_PRICE_PER_KWH +
      dto.water_index * WATER_PRICE_PER_M3;
 
    // 5. Tạo bill — MongoDB unique index tự chặn trùng tháng/phòng
    let bill: BillDocument;
    try {
      bill = await this.billModel.create({
        room_id:                new Types.ObjectId(dto.room_id),
        tenant_id:              (room as any).current_tenant_id,
        tenant_name_snapshot:   (tenant as any).name,
        tenant_phone_snapshot:  (tenant as any).phone ?? '',
        month:                  dto.month,
        year:                   dto.year,
        electricity_index:      dto.electricity_index,
        water_index:            dto.water_index,
        total_amount,
        status:                 'unpaid',
        paid_at:                null,
      });
    } catch (err: any) {
      // MongoDB error code 11000 = duplicate key (unique index violation)
      if (err.code === 11000) {
        throw new ConflictException(
          `Hóa đơn tháng ${dto.month}/${dto.year} cho phòng này đã tồn tại.`,
        );
      }
      throw err;
    }
 
    // 6. Enqueue notification cho tenant — KHÔNG await (fire-and-forget)
    this.notificationsService.notifyBill({
      billId:      (bill._id as Types.ObjectId).toString(),
      roomId:      dto.room_id,
      tenantId:    (room as any).current_tenant_id.toString(),
      month:       dto.month,
      year:        dto.year,
      totalAmount: total_amount,
    }).catch((err) =>
      this.logger.error('Failed to enqueue bill notification', err),
    );
 
    this.logger.log(
      `Bill created: phòng ${dto.room_id} tháng ${dto.month}/${dto.year} — ${total_amount.toLocaleString('vi-VN')}đ`,
    );
 
    return bill;
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // GET /bills — Owner/Admin xem danh sách
  // ══════════════════════════════════════════════════════════════════════════
  async getBills(query: GetBillsQueryDto, userRole: string, userId: string) {
    const filter: Record<string, unknown> = {};
 
    if (userRole === 'owner') {
      // Chỉ lấy bills của phòng thuộc owner này
      const ownerRooms = await this.roomModel
        .find({ owner_id: new Types.ObjectId(userId) })
        .select('_id')
        .lean();
      const roomIds = ownerRooms.map((r: any) => r._id);
      filter.room_id = { $in: roomIds };
 
      // Override nếu có filter room_id cụ thể
      if (query.room_id) {
        const isOwned = roomIds.some((id: any) => id.toString() === query.room_id);
        if (!isOwned) throw new ForbiddenException('Phòng này không thuộc quyền quản lý của bạn.');
        filter.room_id = new Types.ObjectId(query.room_id);
      }
    } else if (userRole === 'admin') {
      if (query.room_id) filter.room_id = new Types.ObjectId(query.room_id);
    }
 
    if (query.month)  filter.month  = query.month;
    if (query.year)   filter.year   = query.year;
    if (query.status) filter.status = query.status;
 
    return this.billModel
      .find(filter)
      .sort({ year: -1, month: -1 })
      .lean();
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // GET /bills/my-bill — Tenant xem hóa đơn của mình
  // ══════════════════════════════════════════════════════════════════════════
  async getMyBills(tenantId: string, query: GetBillsQueryDto) {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
    };
 
    if (query.month)  filter.month  = query.month;
    if (query.year)   filter.year   = query.year;
    if (query.status) filter.status = query.status;
 
    return this.billModel
      .find(filter)
      .sort({ year: -1, month: -1 })
      .lean();
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // PATCH /bills/:id/status — xác nhận thanh toán (Owner only)
  // Atomic update: $ne guard tránh ghi đè paid_at nếu bấm 2 lần
  // ══════════════════════════════════════════════════════════════════════════
  async confirmPayment(billId: string, ownerId: string) {
    if (!Types.ObjectId.isValid(billId)) {
      throw new BadRequestException('bill_id không hợp lệ.');
    }
 
    // Validate bill tồn tại và thuộc owner
    const bill = await this.billModel.findById(billId).lean();
    if (!bill) throw new NotFoundException(`Bill ${billId} không tồn tại.`);
 
    const room = await this.roomModel.findById((bill as any).room_id).lean();
    if (!room) throw new NotFoundException('Phòng không tồn tại.');
    if ((room as any).owner_id.toString() !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền xác nhận hóa đơn này.');
    }
 
    if ((bill as any).status === 'paid') {
      throw new ConflictException('Hóa đơn này đã được thanh toán rồi.');
    }
 
    // ATOMIC UPDATE — $ne: 'paid' là guard chính, tránh race condition
    const updated = await this.billModel.findOneAndUpdate(
      {
        _id:    new Types.ObjectId(billId),
        status: { $ne: 'paid' },   // chỉ update nếu chưa paid
      },
      {
        $set: {
          status:  'paid',
          paid_at: new Date(),
        },
      },
      { new: true },
    );
 
    if (!updated) {
      throw new ConflictException('Hóa đơn đã được thanh toán (concurrent update).');
    }
 
    this.logger.log(`Bill ${billId} confirmed paid at ${updated.paid_at}`);
 
    return {
      ok:       true,
      bill:     updated,
      paid_at:  updated.paid_at,
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // CRON JOB — Task 4.3
  // Chạy lúc 00:00 ngày 25 hàng tháng
  // Quét tất cả bills unpaid → enqueue reminder notification
  // ══════════════════════════════════════════════════════════════════════════
  @Cron('0 0 25 * *', { name: 'bill-reminder' })
  async sendBillReminders(): Promise<void> {
    const now = new Date();
    this.logger.log(`[Cron] Running bill reminder — ${now.toISOString()}`);
 
    const unpaidBills = await this.billModel
      .find({ status: 'unpaid' })
      .lean();
 
    if (unpaidBills.length === 0) {
      this.logger.log('[Cron] No unpaid bills found.');
      return;
    }
 
    this.logger.log(`[Cron] Found ${unpaidBills.length} unpaid bills. Enqueueing reminders...`);
 
    let enqueued = 0;
    for (const bill of unpaidBills) {
      try {
        await this.notificationsService.notifyBill({
          billId:      (bill._id as Types.ObjectId).toString(),
          roomId:      (bill as any).room_id.toString(),
          tenantId:    (bill as any).tenant_id.toString(),
          month:       (bill as any).month,
          year:        (bill as any).year,
          totalAmount: (bill as any).total_amount,
        });
        enqueued++;
      } catch (err: any) {
        this.logger.error(
          `[Cron] Failed to enqueue reminder for bill ${(bill._id as Types.ObjectId).toString()}`,
          err.message,
        );
      }
    }
 
    this.logger.log(`[Cron] Bill reminders enqueued: ${enqueued}/${unpaidBills.length}`);
  }
}


//
// ═══════════════════════════════════════════════════════════════════
// BILLS SERVICE — Task 4.2 + 4.3
// ═══════════════════════════════════════════════════════════════════
//
// Business rules:
//   - Tạo bill: snapshot tenant name + phone tại thời điểm tạo
//   - Unique constraint: 1 bill / phòng / tháng (MongoDB unique index)
//   - Xác nhận thanh toán: atomic update với $ne guard tránh double-pay
//   - Cron job: ngày 25 hàng tháng → quét unpaid bills → enqueue nhắc nợ
//
// Công thức tính tiền:
//   total = base_price + (electricity_index × 3500) + (water_index × 15000)
// ═══════════════════════════════════════════════════════════════════