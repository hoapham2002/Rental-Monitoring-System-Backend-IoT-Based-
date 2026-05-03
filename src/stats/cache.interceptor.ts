import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of, from } from 'rxjs';
import { tap } from 'rxjs/operators';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

const CACHE_TTL_SECONDS = 300; // 5 phút

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);
  private redis: Redis | null = null;

  constructor(private readonly config: ConfigService) {
    this.initRedis();
  }

  private initRedis(): void {
    try {
      this.redis = new Redis({
        host:     this.config.get<string>('REDIS_HOST', '127.0.0.1'),
        port:     this.config.get<number>('REDIS_PORT', 6379),
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 2000,
      });

      this.redis.on('error', (err) => {
        this.logger.warn(`Redis error (cache degraded): ${err.message}`);
      });
    } catch {
      this.logger.warn('Redis not available — cache disabled');
      this.redis = null;
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Nếu Redis không khả dụng → bypass cache
    if (!this.redis) return next.handle();

    const req    = context.switchToHttp().getRequest();
    const userId = req.user?._id?.toString() ?? 'anon';
    const route  = req.route?.path ?? req.url;
    const query  = JSON.stringify(req.query ?? {});
    const cacheKey = `stats:${userId}:${route}:${query}`;

    return new Observable((subscriber) => {
      from(this.tryGetCache(cacheKey)).subscribe({
        next: (cached) => {
          if (cached !== null) {
            // Cache HIT → trả về ngay
            this.logger.debug(`Cache HIT: ${cacheKey}`);
            subscriber.next(cached);
            subscriber.complete();
            return;
          }

          // Cache MISS → gọi handler thật, lưu kết quả vào cache
          this.logger.debug(`Cache MISS: ${cacheKey}`);
          next.handle().pipe(
            tap((data) => {
              this.trySetCache(cacheKey, data, CACHE_TTL_SECONDS).catch(() => {});
            }),
          ).subscribe({
            next:     (v) => subscriber.next(v),
            error:    (e) => subscriber.error(e),
            complete: ()  => subscriber.complete(),
          });
        },
        error: () => {
          // Redis error → bypass cache, gọi handler thật
          next.handle().subscribe({
            next:     (v) => subscriber.next(v),
            error:    (e) => subscriber.error(e),
            complete: ()  => subscriber.complete(),
          });
        },
      });
    });
  }

  private async tryGetCache(key: string): Promise<any | null> {
    try {
      const raw = await this.redis!.get(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async trySetCache(key: string, data: any, ttl: number): Promise<void> {
    try {
      await this.redis!.setex(key, ttl, JSON.stringify(data));
    } catch {
      // Không throw — cache fail không phải lỗi nghiêm trọng
    }
  }
}

//
// ═══════════════════════════════════════════════════════════════════
// REDIS CACHE INTERCEPTOR — Task 5.3
// ═══════════════════════════════════════════════════════════════════
//
// Caching layer cho các endpoint /stats/* nặng.
// TTL = 5 phút (300 giây).
//
// Cache key = `stats:{userId}:{route}:{queryString}`
// → Mỗi user có cache riêng, khác query param thì khác cache key.
//
// Graceful degradation:
//   Nếu Redis không khả dụng → bỏ qua cache, gọi handler thật
//   → Không crash app chỉ vì cache fail.
// ═══════════════════════════════════════════════════════════════════