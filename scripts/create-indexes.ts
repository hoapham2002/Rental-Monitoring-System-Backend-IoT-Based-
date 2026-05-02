// Run: npx ts-node scripts/create-indexes.ts
// Creates all compound + unique indexes defined in V6 schema.
// Safe to re-run (MongoDB ignores existing indexes).
 
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();
 
async function createIndexes() {
  const uri = process.env.DB_URI;
  if (!uri) throw new Error('DB_URI not set in .env');
 
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
 
  // ── Device_Logs ────────────────────────────────────────────
  await db.collection('device_logs').createIndex(
    { device_id: 1 },
    { background: true },
  );
  await db.collection('device_logs').createIndex(
    { ts: -1 },
    { background: true },
  );
  console.log('✅ device_logs: indexes created');
 
  // ── Bills ─────────────────────────────────────────────────
  await db.collection('bills').createIndex(
    { room_id: 1, year: -1, month: -1 },
    { background: true },
  );
  await db.collection('bills').createIndex(
    { room_id: 1, month: 1, year: 1 },
    { unique: true, background: true },
  );
  console.log('✅ bills: indexes created');
 
  // ── Alerts ────────────────────────────────────────────────
  await db.collection('alerts').createIndex(
    { room_id: 1, resolved: 1, ts: -1 },
    { background: true },
  );
  console.log('✅ alerts: indexes created');
 
  // ── Notifications ─────────────────────────────────────────
  await db.collection('notifications').createIndex(
    { user_id: 1, read: 1, ts: -1 },
    { background: true },
  );
  console.log('✅ notifications: indexes created');
 
  // ── Rooms ─────────────────────────────────────────────────
  await db.collection('rooms').createIndex(
    { owner_id: 1 },
    { background: true },
  );
  await db.collection('rooms').createIndex(
    { current_tenant_id: 1 },
    { background: true },
  );
  console.log('✅ rooms: indexes created');
 
  // ── Users ─────────────────────────────────────────────────
  await db.collection('users').createIndex(
    { email: 1 },
    { unique: true, background: true },
  );
  console.log('✅ users: unique email index created');
 
  // ── Devices ───────────────────────────────────────────────
  await db.collection('devices').createIndex(
    { room_id: 1 },
    { background: true },
  );
  console.log('✅ devices: index created');
 
  await mongoose.disconnect();
  console.log('\n🎉 All indexes created successfully!');
}
 
createIndexes().catch((err) => {
  console.error('❌ Error creating indexes:', err);
  process.exit(1);
});