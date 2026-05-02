// Run: npx ts-node scripts/seed.ts
// Populates the DB with demo data for presentation/testing.
 
import mongoose, { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
dotenv.config();
 
async function seed() {
  await mongoose.connect(process.env.DB_URI!);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  console.log('🌱 Seeding demo data...\n');
 
  // Clean existing data
  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('rooms').deleteMany({}),
    db.collection('devices').deleteMany({}),
    db.collection('alerts').deleteMany({}),
    db.collection('bills').deleteMany({}),
    db.collection('notifications').deleteMany({}),
    db.collection('device_logs').deleteMany({}),
  ]);
 
  const HASH = await bcrypt.hash('demo1234', 10);
 
  // ── Users ────────────────────────────────────────────────────────────────
  const adminId  = new Types.ObjectId();
  const ownerId  = new Types.ObjectId();
  const tenant1Id = new Types.ObjectId();
  const tenant2Id = new Types.ObjectId();
 
  const room101Id = new Types.ObjectId();
  const room102Id = new Types.ObjectId();
  const room103Id = new Types.ObjectId();
 
  await db.collection('users').insertMany([
    { _id: adminId,   name: 'Admin System', email: 'admin@demo.com',   password: HASH, phone: '0900000000', role: 'admin',  room_id: null },
    { _id: ownerId,   name: 'Nguyen Van A', email: 'owner@demo.com',   password: HASH, phone: '0911111111', role: 'owner',  room_id: null },
    { _id: tenant1Id, name: 'Tran Thi B',   email: 'tenant1@demo.com', password: HASH, phone: '0922222222', role: 'tenant', room_id: room101Id },
    { _id: tenant2Id, name: 'Le Van C',     email: 'tenant2@demo.com', password: HASH, phone: '0933333333', role: 'tenant', room_id: room102Id },
  ]);
  console.log('✅ Users seeded (admin / owner / 2 tenants) — password: demo1234');
 
  // ── Rooms ────────────────────────────────────────────────────────────────
  await db.collection('rooms').insertMany([
    { _id: room101Id, name: 'Phòng 101', floor: 1, owner_id: ownerId, current_tenant_id: tenant1Id, status: 'occupied',    base_price: 2_500_000 },
    { _id: room102Id, name: 'Phòng 102', floor: 1, owner_id: ownerId, current_tenant_id: tenant2Id, status: 'occupied',    base_price: 2_500_000 },
    { _id: room103Id, name: 'Phòng 103', floor: 2, owner_id: ownerId, current_tenant_id: null,      status: 'empty',       base_price: 3_000_000 },
  ]);
  console.log('✅ Rooms seeded (101 occupied, 102 occupied, 103 empty)');
 
  // ── Devices ──────────────────────────────────────────────────────────────
  await db.collection('devices').insertMany([
    { _id: 'LOCK_101' as any,  room_id: room101Id, type: 'lock',        password_hash: HASH, status: 'online',  last_state: 'LOCKED', last_seen: new Date() },
    { _id: 'LIGHT_101' as any, room_id: room101Id, type: 'light',       password_hash: null, status: 'online',  last_state: 'OFF',    last_seen: new Date() },
    { _id: 'FIRE_101' as any,  room_id: room101Id, type: 'fire_sensor', password_hash: null, status: 'online',  last_state: 'NORMAL', last_seen: new Date() },
    { _id: 'LOCK_102' as any,  room_id: room102Id, type: 'lock',        password_hash: HASH, status: 'online',  last_state: 'LOCKED', last_seen: new Date() },
    { _id: 'FIRE_102' as any,  room_id: room102Id, type: 'fire_sensor', password_hash: null, status: 'offline', last_state: 'NORMAL', last_seen: new Date(Date.now() - 3_600_000) },
  ]);
  console.log('✅ Devices seeded (5 devices across 2 rooms)');
 
  // ── Bills (2 months) ─────────────────────────────────────────────────────
  const now = new Date();
  await db.collection('bills').insertMany([
    {
      room_id: room101Id, tenant_id: tenant1Id,
      tenant_name_snapshot: 'Tran Thi B', tenant_phone_snapshot: '0922222222',
      month: now.getMonth() === 0 ? 12 : now.getMonth(), year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
      electricity_index: 85, water_index: 6,
      total_amount: 2_500_000 + 85 * 3_500 + 6 * 15_000,
      status: 'paid', paid_at: new Date(Date.now() - 86_400_000 * 5),
    },
    {
      room_id: room101Id, tenant_id: tenant1Id,
      tenant_name_snapshot: 'Tran Thi B', tenant_phone_snapshot: '0922222222',
      month: now.getMonth() + 1, year: now.getFullYear(),
      electricity_index: 102, water_index: 7,
      total_amount: 2_500_000 + 102 * 3_500 + 7 * 15_000,
      status: 'unpaid', paid_at: null,
    },
    {
      room_id: room102Id, tenant_id: tenant2Id,
      tenant_name_snapshot: 'Le Van C', tenant_phone_snapshot: '0933333333',
      month: now.getMonth() + 1, year: now.getFullYear(),
      electricity_index: 78, water_index: 5,
      total_amount: 2_500_000 + 78 * 3_500 + 5 * 15_000,
      status: 'pending', paid_at: null,
    },
  ]);
  console.log('✅ Bills seeded (1 paid, 1 unpaid, 1 pending)');
 
  // ── Alerts ────────────────────────────────────────────────────────────────
  await db.collection('alerts').insertMany([
    {
      device_id: 'FIRE_101', room_id: room101Id,
      type: 'fire', severity: 'critical',
      message: 'Phát hiện cháy tại Phòng 101!', resolved: true,
      ts: new Date(Date.now() - 86_400_000 * 2),
    },
    {
      device_id: 'LOCK_102', room_id: room102Id,
      type: 'security', severity: 'warning',
      message: 'Nhập sai mật khẩu 3 lần tại Phòng 102', resolved: false,
      ts: new Date(Date.now() - 3_600_000),
    },
  ]);
  console.log('✅ Alerts seeded (1 resolved fire, 1 unresolved security)');
 
  // ── Notifications ─────────────────────────────────────────────────────────
  await db.collection('notifications').insertMany([
    {
      user_id: tenant1Id, type: 'bill', ref_id: null,
      title: 'Hóa đơn tháng mới', body: 'Hóa đơn tháng này đã được tạo. Vui lòng thanh toán trước ngày 5.',
      read: false, ts: new Date(),
    },
    {
      user_id: tenant1Id, type: 'alert', ref_id: null,
      title: 'Cảnh báo cháy', body: 'Đã phát hiện cháy tại phòng bạn. Sự cố đã được xử lý.',
      read: true, ts: new Date(Date.now() - 86_400_000 * 2),
    },
  ]);
  console.log('✅ Notifications seeded');
 
  await mongoose.disconnect();
  console.log('\n🎉 Seed complete! Login with:');
  console.log('   admin@demo.com  / demo1234');
  console.log('   owner@demo.com  / demo1234');
  console.log('   tenant1@demo.com / demo1234');
}
 
seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});