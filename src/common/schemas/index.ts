// ─────────────────────────────────────────────────────────────────────────────
// ALL 7 Mongoose schemas derived from Database V6 spec.
// Import individual schemas from here into their respective modules.
// ─────────────────────────────────────────────────────────────────────────────
 
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
 
// ══════════════════════════════════════════════════════════════
// 1. USERS
// ══════════════════════════════════════════════════════════════
export type UserDocument = User & Document;
 
@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true })
  name!: string;
 
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;
 
  @Prop({ required: true, select: false }) // never returned in queries by default
  password!: string;
 
  @Prop({ trim: true })
  phone!: string;
 
  @Prop({ type: String, enum: ['admin', 'owner', 'tenant'], required: true })
  role!: 'admin' | 'owner' | 'tenant';
 
  @Prop({ type: Types.ObjectId, ref: 'Room', default: null })
  room_id!: Types.ObjectId | null;
}
 
export const UserSchema = SchemaFactory.createForClass(User);
 
// ══════════════════════════════════════════════════════════════
// 2. ROOMS
// ══════════════════════════════════════════════════════════════
export type RoomDocument = Room & Document;
 
@Schema({ timestamps: true, collection: 'rooms' })
export class Room {
  @Prop({ required: true, trim: true })
  name!: string;
 
  @Prop({ required: true })
  floor!: number;
 
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner_id!: Types.ObjectId;
 
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  current_tenant_id!: Types.ObjectId | null;
 
  @Prop({
    type: String,
    enum: ['empty', 'occupied', 'maintenance'],
    default: 'empty',
  })
  status!: 'empty' | 'occupied' | 'maintenance';
 
  @Prop({ required: true, min: 0 })
  base_price!: number;
}
 
export const RoomSchema = SchemaFactory.createForClass(Room);
 
// ══════════════════════════════════════════════════════════════
// 3. DEVICES
// ══════════════════════════════════════════════════════════════
export type DeviceDocument = Device & Document;
 
@Schema({ timestamps: true, collection: 'devices' })
export class Device {
  // Custom _id: e.g. "LOCK_001" – set manually on creation
  @Prop({ type: String, required: true })
  _id!: string;
 
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true })
  room_id!: Types.ObjectId;
 
  @Prop({ type: String, enum: ['lock', 'light', 'fire_sensor'], required: true })
  type!: 'lock' | 'light' | 'fire_sensor';
 
  // Only populated for type === 'lock'; null otherwise
  @Prop({ type: String, default: null, select: false })
  password_hash!: string | null;
 
  @Prop({ type: String, enum: ['online', 'offline'], default: 'offline' })
  status!: 'online' | 'offline';
 
  @Prop({ type: String, default: null })
  last_state!: string | null;
 
  @Prop({ type: Date, default: null })
  last_seen!: Date | null;
}
 
export const DeviceSchema = SchemaFactory.createForClass(Device);
 
// ══════════════════════════════════════════════════════════════
// 4. DEVICE LOGS
// ══════════════════════════════════════════════════════════════
export type DeviceLogDocument = DeviceLog & Document;
 
@Schema({ collection: 'device_logs' })
export class DeviceLog {
  @Prop({ type: String, required: true, index: true })
  device_id!: string;
 
  @Prop({ required: true })
  event!: string;
 
  @Prop({ type: Object }) // Mixed – can be string, number, or object
  value: unknown;
 
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  user_id!: Types.ObjectId | null;
 
  @Prop({ type: Date, default: () => new Date(), index: -1 })
  ts!: Date;
}
 
export const DeviceLogSchema = SchemaFactory.createForClass(DeviceLog);
 
// ══════════════════════════════════════════════════════════════
// 5. BILLS
// ══════════════════════════════════════════════════════════════
export type BillDocument = Bill & Document;
 
@Schema({ timestamps: true, collection: 'bills' })
export class Bill {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true })
  room_id!: Types.ObjectId;
 
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenant_id!: Types.ObjectId;
 
  // Snapshot: frozen at bill creation time, survives tenant changes
  @Prop({ required: true })
  tenant_name_snapshot!: string;
 
  @Prop({ required: true })
  tenant_phone_snapshot!: string;
 
  @Prop({ required: true, min: 1, max: 12 })
  month!: number;
 
  @Prop({ required: true, min: 2000 })
  year!: number;
 
  @Prop({ required: true, min: 0 })
  electricity_index!: number;
 
  @Prop({ required: true, min: 0 })
  water_index!: number;
 
  @Prop({ required: true, min: 0 })
  total_amount!: number;
 
  @Prop({
    type: String,
    enum: ['unpaid', 'paid', 'pending'],
    default: 'unpaid',
  })
  status!: 'unpaid' | 'paid' | 'pending';
 
  @Prop({ type: Date, default: null })
  paid_at!: Date | null;
}
 
export const BillSchema = SchemaFactory.createForClass(Bill);
 
// Compound index: fast history query by room → year → month
BillSchema.index({ room_id: 1, year: -1, month: -1 });
 
// Unique constraint: one bill per room per month/year
BillSchema.index({ room_id: 1, month: 1, year: 1 }, { unique: true });
 
// ══════════════════════════════════════════════════════════════
// 6. ALERTS
// ══════════════════════════════════════════════════════════════
export type AlertDocument = Alert & Document;
 
@Schema({ collection: 'alerts' })
export class Alert {
  @Prop({ type: String, required: true })
  device_id!: string;
 
  // Denormalized from Device for fast room-based queries (no JOIN needed)
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true })
  room_id!: Types.ObjectId;
 
  @Prop({ type: String, enum: ['fire', 'security', 'system'], required: true })
  type!: 'fire' | 'security' | 'system';
 
  @Prop({
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info',
  })
  severity!: 'info' | 'warning' | 'critical';
 
  @Prop({ required: true })
  message!: string;
 
  @Prop({ type: Boolean, default: false })
  resolved!: boolean;
 
  @Prop({ type: Date, default: () => new Date() })
  ts!: Date;
}
 
export const AlertSchema = SchemaFactory.createForClass(Alert);
 
// Compound index: "unresolved alerts for room X, newest first"
AlertSchema.index({ room_id: 1, resolved: 1, ts: -1 });
 
// ══════════════════════════════════════════════════════════════
// 7. NOTIFICATIONS
// ══════════════════════════════════════════════════════════════
export type NotificationDocument = Notification & Document;
 
@Schema({ collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user_id!: Types.ObjectId;
 
  @Prop({ type: String, enum: ['bill', 'alert', 'system'], required: true })
  type!: 'bill' | 'alert' | 'system';
 
  // Deep-link target: ObjectId of the Bill or Alert this notification refers to
  @Prop({ type: Types.ObjectId, default: null })
  ref_id!: Types.ObjectId | null;
 
  @Prop({ required: true })
  title!: string;
 
  @Prop({ required: true })
  body!: string;
 
  @Prop({ type: Boolean, default: false })
  read!: boolean;
 
  @Prop({ type: Date, default: () => new Date() })
  ts!: Date;
}
 
export const NotificationSchema = SchemaFactory.createForClass(Notification);
 
// Compound index: "unread notifications for user X, newest first"
NotificationSchema.index({ user_id: 1, read: 1, ts: -1 });