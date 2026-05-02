import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Alert, AlertDocument } from '../common/schemas';
import { GetAlertsQueryDto, ResolveAlertDto } from './dto/alerts.dto';
 
@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert.name)
    private readonly alertModel: Model<AlertDocument>,
  ) {}
 
  // ── GET /alerts ───────────────────────────────────────────────────────────
  async getAlerts(
    query: GetAlertsQueryDto,
    userRole: string,
    userId: string,
  ) {
    const filter: Record<string, unknown> = {};
 
    // Phân quyền theo role
    if (userRole === 'tenant') {
      // Tenant: chỉ xem alert của phòng mình
      const User = this.alertModel.db.model('User');
      const user = await User.findById(userId).select('room_id').lean() as any;
      if (!user?.room_id) return { data: [], total: 0, unresolved: 0 };
      filter.room_id = user.room_id;
    } else if (userRole === 'owner') {
      // Owner: chỉ xem alert của phòng mình quản lý
      const Room = this.alertModel.db.model('Room');
      const rooms = await Room.find({ owner_id: new Types.ObjectId(userId) })
        .select('_id')
        .lean();
      filter.room_id = { $in: rooms.map((r: any) => r._id) };
      if (query.room_id) filter.room_id = new Types.ObjectId(query.room_id);
    } else {
      // Admin: thấy tất cả
      if (query.room_id) filter.room_id = new Types.ObjectId(query.room_id);
    }
 
    // Apply filters từ query params
    if (query.resolved !== undefined) filter.resolved = query.resolved;
    if (query.type) filter.type = query.type;
    if (query.severity) filter.severity = query.severity;
 
    const limit = query.limit ?? 20;
 
    const [data, total, unresolved] = await Promise.all([
      this.alertModel.find(filter).sort({ ts: -1 }).limit(limit).lean(),
      this.alertModel.countDocuments(filter),
      this.alertModel.countDocuments({ ...filter, resolved: false }),
    ]);
 
    return { data, total, unresolved };
  }
 
  // ── PATCH /alerts/:id/resolve ─────────────────────────────────────────────
  async resolveAlert(
    alertId: string,
    dto: ResolveAlertDto,
    userRole: string,
    userId: string,
  ) {
    if (!Types.ObjectId.isValid(alertId)) {
      throw new NotFoundException('Invalid alert ID.');
    }
 
    const alert = await this.alertModel.findById(alertId).lean();
    if (!alert) throw new NotFoundException(`Alert ${alertId} not found.`);
 
    // Owner chỉ resolve alert của phòng mình
    if (userRole === 'owner') {
      const Room = this.alertModel.db.model('Room');
      const room = await Room.findById(alert.room_id).lean() as any;
      if (!room || room.owner_id.toString() !== userId) {
        throw new ForbiddenException('Access denied: alert does not belong to your rooms.');
      }
    }
 
    const updated = await this.alertModel
      .findByIdAndUpdate(
        alertId,
        { $set: { resolved: true } },
        { new: true },
      )
      .lean();
 
    return {
      ok: true,
      alert: updated,
      note: dto.note ?? null,
      resolved_at: new Date().toISOString(),
    };
  }
}