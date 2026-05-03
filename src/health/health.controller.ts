import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private redis: Redis;

  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
  ) {
    this.redis = new Redis({
      host:        config.get<string>('REDIS_HOST', '127.0.0.1'),
      port:        config.get<number>('REDIS_PORT', 6379),
      password:    config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
  }

  // GET /api/v1/health
  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Health check — MongoDB + Redis + memory',
    description: 'Used for Kubernetes liveness/readiness probes.',
  })
  check() {
    return this.health.check([
      // 1. MongoDB
      () => this.mongoose.pingCheck('mongodb', { connection: this.connection }),

      // 2. Redis — custom check via ioredis ping
      async () => {
        const key = 'redis';
        try {
          await this.redis.ping();
          return { [key]: { status: 'up' } };
        } catch (err: any) {
          return { [key]: { status: 'down', message: err.message } };
        }
      },

      // 3. Memory heap < 300MB
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
    ]);
  }
}


//
// GET /api/v1/health  →  liveness + readiness check
//
// Checks:
//   mongodb   → mongoose ping
//   redis     → ioredis ping (BullMQ connection)
//   memory    → heap < 300MB
//
// Response shape:
//   { status: 'ok'|'error', info: {...}, error: {...}, details: {...} }

