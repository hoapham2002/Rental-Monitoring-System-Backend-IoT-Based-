//
// Protects all /devices/status routes.
// ESP32/Gateway must send header: x-api-key: <IOT_API_KEY from .env>
//
// For demo: single static key stored in .env (IOT_API_KEY).
// Production upgrade path: store hashed keys in a `device_api_keys` collection
// and look up on each request (add Redis cache with 60s TTL).
 
import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
 
@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}
 
  use(req: Request, _res: Response, next: NextFunction): void {
    const incoming = req.headers['x-api-key'];
    const expected = this.config.get<string>('IOT_API_KEY');
 
    if (!incoming || incoming !== expected) {
      throw new UnauthorizedException(
        'Invalid or missing API key. IoT devices must send x-api-key header.',
      );
    }
 
    next();
  }
}