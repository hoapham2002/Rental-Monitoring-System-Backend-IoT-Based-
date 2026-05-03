// src/integration/iot-flow.integration.spec.ts
//
// ═══════════════════════════════════════════════════════════════════
// INTEGRATION TEST — Task 6.2
// ═══════════════════════════════════════════════════════════════════
//
// Test flow hoàn chỉnh: POST /devices/status → DB → Socket.io
// Dùng mongodb-memory-server (không cần MongoDB thật).
// Redis/BullMQ được mock để không cần Redis thật.
//
// CÁCH CHẠY:
//   npm run test:integration
//   (hoặc: npx jest --testPathPattern=integration)
//
// Cài thêm:
//   npm install --save-dev mongodb-memory-server supertest @types/supertest
// ═══════════════════════════════════════════════════════════════════

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { AuthModule }          from '../auth/auth.module';
import { GatewayModule }       from '../gateway/gateway.module';
import { DevicesModule }       from '../devices/devices.module';
import { AlertsModule }        from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GlobalExceptionFilter } from '../common/filters/http-exception.filter';
import {
  User,  UserSchema,
  Room,  RoomSchema,
  Device, DeviceSchema,
  Alert, AlertSchema,
  DeviceLog, DeviceLogSchema,
  Notification, NotificationSchema,
  Bill, BillSchema,
} from '../common/schemas';

// ── Mock BullMQ so we don't need real Redis ───────────────────────────────────
jest.mock('bullmq', () => ({
  Queue:  jest.fn().mockImplementation(() => ({
    add:   jest.fn().mockResolvedValue({ id: 'mock-job' }),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on:    jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('IoT Flow Integration', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;

  // Test data
  let authToken: string;
  let ownerId: string;
  let roomId: string;
  let deviceId: string;

  const IOT_API_KEY = 'test_iot_key_integration';

  // ── Setup ─────────────────────────────────────────────────────────────────
  beforeAll(async () => {
    // Start in-memory MongoDB
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({
            DB_URI:             mongoUri,
            JWT_SECRET:         'test_jwt_secret_must_be_32_chars!!',
            JWT_EXPIRES_IN:     '15m',
            IOT_API_KEY:        IOT_API_KEY,
            CORS_ORIGINS:       'http://localhost:3000',
            REDIS_HOST:         '127.0.0.1',
            REDIS_PORT:         6379,
            REDIS_PASSWORD:     '',
            LOG_LEVEL:          'error', // suppress logs during tests
          })],
          validationSchema: undefined, // skip Joi in test
        }),
        MongooseModule.forRoot(mongoUri),
        MongooseModule.forFeature([
          { name: User.name,         schema: UserSchema },
          { name: Room.name,         schema: RoomSchema },
          { name: Device.name,       schema: DeviceSchema },
          { name: Alert.name,        schema: AlertSchema },
          { name: DeviceLog.name,    schema: DeviceLogSchema },
          { name: Notification.name, schema: NotificationSchema },
          { name: Bill.name,         schema: BillSchema },
        ]),
        AuthModule,
        GatewayModule,
        DevicesModule,
        AlertsModule,
        NotificationsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    // ── Seed test data ──────────────────────────────────────────────────────
    const userModel   = moduleRef.get<Model<any>>(getModelToken(User.name));
    const roomModel   = moduleRef.get<Model<any>>(getModelToken(Room.name));
    const deviceModel = moduleRef.get<Model<any>>(getModelToken(Device.name));

    const hashedPw = await bcrypt.hash('test1234', 10);

    const owner = await userModel.create({
      name: 'Test Owner', email: 'owner@integration.test',
      password: hashedPw, phone: '0900000000', role: 'owner',
    });
    ownerId = owner._id.toString();

    const tenant = await userModel.create({
      name: 'Test Tenant', email: 'tenant@integration.test',
      password: hashedPw, phone: '0911111111', role: 'tenant',
    });

    const room = await roomModel.create({
      name: 'Phòng 101', floor: 1, base_price: 2_500_000,
      owner_id: owner._id,
      current_tenant_id: tenant._id,
      status: 'occupied',
    });
    roomId = room._id.toString();

    const device = await deviceModel.create({
      _id:        'FIRE_INT_01',
      room_id:    room._id,
      type:       'fire_sensor',
      status:     'online',
      last_state: 'NORMAL',
    });
    deviceId = device._id;
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  // ── Tests ─────────────────────────────────────────────────────────────────

  // 1. Login
  describe('POST /auth/login', () => {
    it('returns JWT token for valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'owner@integration.test', password: 'test1234' })
        .expect(201);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body.role).toBe('owner');
      authToken = res.body.access_token;
    });

    it('returns 401 for wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'owner@integration.test', password: 'wrong' })
        .expect(401);
    });
  });

  // 2. GET /auth/profile
  describe('GET /auth/profile', () => {
    it('returns current user info with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.email).toBe('owner@integration.test');
      expect(res.body).not.toHaveProperty('password');
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .expect(401);
    });
  });

  // 3. POST /devices/status — normal event
  describe('POST /devices/status (normal)', () => {
    it('logs device event and returns ok:true', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/status')
        .set('x-api-key', IOT_API_KEY)
        .send({ deviceId: 'FIRE_INT_01', value: 'NORMAL' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.alert_created).toBe(false);
      expect(res.body.event).toBe('status_normal');
    });

    it('returns 401 without API key', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/devices/status')
        .send({ deviceId: 'FIRE_INT_01', value: 'NORMAL' })
        .expect(401);
    });

    it('returns 404 for unknown device', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/devices/status')
        .set('x-api-key', IOT_API_KEY)
        .send({ deviceId: 'GHOST_999', value: 'FIRE' })
        .expect(404);
    });
  });

  // 4. POST /devices/status — FIRE event creates Alert
  describe('POST /devices/status (FIRE)', () => {
    it('creates Alert and returns alert_created:true', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/status')
        .set('x-api-key', IOT_API_KEY)
        .send({ deviceId: 'FIRE_INT_01', value: 'FIRE' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.alert_created).toBe(true);
    });

    // 5. Verify Alert was saved in DB
    it('fire alert is visible in GET /alerts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.total).toBeGreaterThan(0);
      const fireAlert = res.body.data.find((a: any) => a.type === 'fire');
      expect(fireAlert).toBeDefined();
      expect(fireAlert.resolved).toBe(false);
    });
  });

  // 6. PATCH /alerts/:id/resolve
  describe('PATCH /alerts/:id/resolve', () => {
    it('marks fire alert as resolved', async () => {
      // Get alert ID first
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/alerts')
        .set('Authorization', `Bearer ${authToken}`);

      const fireAlert = listRes.body.data.find((a: any) => a.type === 'fire');
      expect(fireAlert).toBeDefined();

      const resolveRes = await request(app.getHttpServer())
        .patch(`/api/v1/alerts/${fireAlert._id}/resolve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ note: 'Test resolved' })
        .expect(200);

      expect(resolveRes.body.ok).toBe(true);
      expect(resolveRes.body.alert.resolved).toBe(true);
    });
  });

  // 7. GET /devices
  describe('GET /devices', () => {
    it('returns device list for authenticated owner', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).not.toHaveProperty('password_hash');
    });
  });

  // 8. GET /devices/:id/logs
  describe('GET /devices/:id/logs', () => {
    it('returns device logs', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/devices/${deviceId}/logs`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // Should have at least the NORMAL and FIRE logs we sent
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });
  });

  // 9. Validation tests
  describe('Input validation', () => {
    it('rejects POST /devices/status with missing deviceId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/devices/status')
        .set('x-api-key', IOT_API_KEY)
        .send({ value: 'FIRE' })  // missing deviceId
        .expect(400);
    });

    it('rejects login with invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'pass' })
        .expect(400);
    });
  });
});
