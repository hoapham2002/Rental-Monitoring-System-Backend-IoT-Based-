import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import {
  Alert,  AlertDocument,
  Bill,   BillDocument,
  Device, DeviceDocument,
  Room,   RoomDocument,
} from '../common/schemas';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    @InjectModel(Room.name)   private readonly roomModel:   Model<RoomDocument>,
    @InjectModel(Bill.name)   private readonly billModel:   Model<BillDocument>,
    @InjectModel(Alert.name)  private readonly alertModel:  Model<AlertDocument>,
    @InjectModel(Device.name) private readonly deviceModel: Model<DeviceDocument>,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // GET /stats/overview
  // Dashboard summary: 4 queries chạy SONG SONG với Promise.all
  // ══════════════════════════════════════════════════════════════════════════
  async getOverview(userRole: string, userId: string) {
    const roomFilter   = await this.buildRoomFilter(userRole, userId);
    const roomIds      = await this.getRoomIds(roomFilter);
    const roomIdFilter = roomIds.length > 0 ? { room_id: { $in: roomIds } } : {};

    const [
      totalRooms,
      roomsByStatus,
      activeAlerts,
      unpaidBills,
      devicesOffline,
      todayAlerts,
    ] = await Promise.all([
      // 1. Tổng phòng
      this.roomModel.countDocuments(roomFilter),

      // 2. Phòng theo trạng thái
      this.roomModel.aggregate([
        { $match: roomFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // 3. Alert chưa xử lý
      this.alertModel.countDocuments({ ...roomIdFilter, resolved: false }),

      // 4. Bill chưa thanh toán
      this.billModel.countDocuments({ ...roomIdFilter, status: { $ne: 'paid' } }),

      // 5. Thiết bị offline
      this.deviceModel.countDocuments({ ...roomIdFilter, status: 'offline' }),

      // 6. Alert hôm nay
      this.alertModel.countDocuments({
        ...roomIdFilter,
        ts: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
    ]);

    // Format roomsByStatus thành object dễ dùng
    const statusMap: Record<string, number> = {
      empty: 0, occupied: 0, maintenance: 0,
    };
    for (const s of roomsByStatus) statusMap[s._id] = s.count;

    return {
      total_rooms:     totalRooms,
      rooms_by_status: statusMap,
      active_alerts:   activeAlerts,
      today_alerts:    todayAlerts,
      unpaid_bills:    unpaidBills,
      devices_offline: devicesOffline,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /stats/revenue?year=2025
  // Doanh thu từng tháng trong năm (aggregation $group by month)
  // ══════════════════════════════════════════════════════════════════════════
  async getRevenue(userRole: string, userId: string, year: number) {
    const roomFilter = await this.buildRoomFilter(userRole, userId);
    const roomIds    = await this.getRoomIds(roomFilter);

    const pipeline: PipelineStage[] = [
      // Match bills của year + paid status + thuộc owner
      {
        $match: {
          year,
          status: 'paid',
          ...(roomIds.length > 0 && { room_id: { $in: roomIds } }),
        },
      },
      // Group theo tháng
      {
        $group: {
          _id:            '$month',
          total_revenue:  { $sum: '$total_amount' },
          bill_count:     { $sum: 1 },
          avg_bill:       { $avg: '$total_amount' },
        },
      },
      // Sort theo tháng tăng dần
      { $sort: { _id: 1 } },
      // Rename _id → month
      {
        $project: {
          _id:           0,
          month:         '$_id',
          total_revenue: 1,
          bill_count:    1,
          avg_bill:      { $round: ['$avg_bill', 0] },
        },
      },
    ];

    const monthlyData = await this.billModel.aggregate(pipeline);

    // Đảm bảo đủ 12 tháng (các tháng không có data → 0)
    const fullYear = Array.from({ length: 12 }, (_, i) => {
      const found = monthlyData.find((d: any) => d.month === i + 1);
      return {
        month:         i + 1,
        total_revenue: found?.total_revenue ?? 0,
        bill_count:    found?.bill_count    ?? 0,
        avg_bill:      found?.avg_bill      ?? 0,
      };
    });

    const totalRevenue = fullYear.reduce((sum, m) => sum + m.total_revenue, 0);

    return {
      year,
      total_revenue: totalRevenue,
      monthly:       fullYear,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /stats/alerts?days=7
  // Thống kê cảnh báo: theo loại + theo ngày trong N ngày gần nhất
  // ══════════════════════════════════════════════════════════════════════════
  async getAlertStats(userRole: string, userId: string, days: number = 7) {
    const roomFilter = await this.buildRoomFilter(userRole, userId);
    const roomIds    = await this.getRoomIds(roomFilter);
    const roomIdFilter = roomIds.length > 0 ? { room_id: { $in: roomIds } } : {};

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const dateFilter = { ts: { $gte: since } };
    const baseMatch  = { ...roomIdFilter, ...dateFilter };

    const [byType, bySeverity, byDay, totalUnresolved] = await Promise.all([
      // 1. Theo loại (fire/security/system)
      this.alertModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $project: { _id: 0, type: '$_id', count: 1 } },
      ]),

      // 2. Theo severity
      this.alertModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
        { $project: { _id: 0, severity: '$_id', count: 1 } },
      ]),

      // 3. Theo ngày (timeline chart)
      this.alertModel.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$ts' },
            },
            count:    { $sum: 1 },
            critical: {
              $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1, critical: 1 } },
      ]),

      // 4. Tổng chưa xử lý
      this.alertModel.countDocuments({ ...roomIdFilter, resolved: false }),
    ]);

    return {
      period_days:     days,
      total_unresolved: totalUnresolved,
      by_type:         byType,
      by_severity:     bySeverity,
      by_day:          byDay,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /stats/devices
  // Trạng thái thiết bị: online ratio + breakdown theo type
  // ══════════════════════════════════════════════════════════════════════════
  async getDeviceStats(userRole: string, userId: string) {
    const roomFilter = await this.buildRoomFilter(userRole, userId);
    const roomIds    = await this.getRoomIds(roomFilter);
    const roomIdFilter = roomIds.length > 0 ? { room_id: { $in: roomIds } } : {};

    const [byStatus, byType, lastSeenOld] = await Promise.all([
      // 1. Online vs offline
      this.deviceModel.aggregate([
        { $match: roomIdFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { _id: 0, status: '$_id', count: 1 } },
      ]),

      // 2. Theo type (lock/light/fire_sensor) + status
      this.deviceModel.aggregate([
        { $match: roomIdFilter },
        {
          $group: {
            _id:     '$type',
            total:   { $sum: 1 },
            online:  { $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] } },
            offline: { $sum: { $cond: [{ $eq: ['$status', 'offline'] }, 1, 0] } },
          },
        },
        { $project: { _id: 0, type: '$_id', total: 1, online: 1, offline: 1 } },
      ]),

      // 3. Thiết bị không ping >1 giờ (có thể mất kết nối)
      this.deviceModel.countDocuments({
        ...roomIdFilter,
        last_seen: { $lt: new Date(Date.now() - 60 * 60 * 1_000) },
      }),
    ]);

    const totalOnline  = byStatus.find((s: any) => s.status === 'online')?.count  ?? 0;
    const totalOffline = byStatus.find((s: any) => s.status === 'offline')?.count ?? 0;
    const total        = totalOnline + totalOffline;
    const onlineRatio  = total > 0 ? Math.round((totalOnline / total) * 100) : 0;

    return {
      total,
      online:       totalOnline,
      offline:      totalOffline,
      online_ratio: `${onlineRatio}%`,
      stale_devices: lastSeenOld,  // không ping >1h
      by_type:      byType,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════════

  // Xây filter cho Room dựa theo role
  private async buildRoomFilter(
    userRole: string,
    userId:   string,
  ): Promise<Record<string, unknown>> {
    if (userRole === 'admin') return {};
    if (userRole === 'owner') {
      return { owner_id: new Types.ObjectId(userId) };
    }
    throw new ForbiddenException('Tenant không có quyền xem thống kê.');
  }

  // Lấy danh sách roomIds từ filter (dùng để filter Bills, Alerts, Devices)
  private async getRoomIds(
    roomFilter: Record<string, unknown>,
  ): Promise<Types.ObjectId[]> {
    if (Object.keys(roomFilter).length === 0) {
      // Admin: không cần filter room_id
      return [];
    }
    const rooms = await this.roomModel
      .find(roomFilter)
      .select('_id')
      .lean();
    return rooms.map((r: any) => r._id);
  }
}

//
// ═══════════════════════════════════════════════════════════════════
// STATS SERVICE — Task 5.1
// ═══════════════════════════════════════════════════════════════════
//
// Endpoints:
//   GET /stats/overview   → Dashboard summary card (4 queries parallel)
//   GET /stats/revenue    → Doanh thu theo tháng (aggregation pipeline)
//   GET /stats/alerts     → Thống kê cảnh báo theo loại và theo ngày
//   GET /stats/devices    → Trạng thái thiết bị (online/offline ratio)
//
// Pattern:
//   - Tất cả dùng Promise.all để chạy song song, không await tuần tự
//   - Owner chỉ thấy data của phòng mình
//   - Admin thấy toàn bộ hệ thống
// ═══════════════════════════════════════════════════════════════════
