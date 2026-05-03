import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule }       from './config/config.module';
import { AuthModule }            from './auth/auth.module';
import { GatewayModule }         from './gateway/gateway.module';
import { DevicesModule }         from './devices/devices.module';
import { AlertsModule }          from './alerts/alerts.module';
import { NotificationsModule }   from './notifications/notifications.module';
import { RoomsModule }           from './rooms/rooms.module';
import { BillsModule }           from './bills/bills.module';
import { StatsModule }           from './stats/stats.module';
import { HealthModule }          from './health/health.module';
import { ApiKeyMiddleware }      from './common/middleware/api-key.middleware';

@Module({
  imports: [
    // ── Config (global) ───────────────────────────────────────────────────────
    AppConfigModule,

    // ── MongoDB ───────────────────────────────────────────────────────────────
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('DB_URI'),
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }),
    }),

    // ── Scheduler (global — đăng ký 1 lần duy nhất ở đây) ───────────────────
    ScheduleModule.forRoot(),

    // ── Phase 1: Auth ─────────────────────────────────────────────────────────
    AuthModule,

    // ── Phase 2: IoT + Realtime ───────────────────────────────────────────────
    GatewayModule,       // Socket.io — @Global(), import trước DevicesModule
    DevicesModule,       // /devices — IoT status, control, logs
    AlertsModule,        // /alerts — list, resolve

    // ── Phase 3: Notifications ────────────────────────────────────────────────
    NotificationsModule, // BullMQ queue + worker + /notifications API

    // ── Phase 4: Business Logic ───────────────────────────────────────────────
    RoomsModule,         // /rooms — CRUD + integrity guard
    BillsModule,         // /bills — create, list, pay + cron reminder

    // ── Phase 5: Stats + Observability ────────────────────────────────────────
    StatsModule,         // /stats — aggregation pipelines + Redis cache
    HealthModule,        // /health — liveness + readiness probes
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // API Key middleware — chỉ cho POST /devices/status (IoT Gateway)
    consumer
      .apply(ApiKeyMiddleware)
      .forRoutes({ path: 'devices/status', method: RequestMethod.POST });
  }
}