//
// Applied ONCE in main.ts before any route handler.
// Covers: Helmet headers, rate-limiting, CORS whitelist, NoSQL-injection sanitisation.
 
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
//import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import { NextFunction } from 'express';
 
/**
 * Apply all global security middleware to the running NestJS app.
 * Call this inside bootstrap() in main.ts BEFORE app.listen().
 */
export function applySecurityMiddleware(app: INestApplication): void {
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
 
  // ── 1. CORS ─────────────────────────────────────────────────────────────
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      // const allowedOrigins = [
      //   'http://localhost:3000/',
      //   'http://localhost:5173',
      // ];
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin "${origin}" not allowed`));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true,
  });
 
  // ── 2. Helmet (security headers) ────────────────────────────────────────
  app.use(
    helmet({
      hidePoweredBy: true,          // Remove X-Powered-By: Express
      xssFilter: true,              // X-XSS-Protection
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: {
        maxAge: 31_536_000,         // 1 year HSTS
        includeSubDomains: true,
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
 
  // ── 3. Global rate limiter (IP-based: 100 req / 1 min) ──────────────────
  app.use(
    rateLimit({
      windowMs: 60 * 1_000,         // 1 minute
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        statusCode: 429,
        message: 'Too many requests, please try again later.',
      },
    }),
  );
 
  // ── 4. Stricter limiter for auth endpoints (20 req / 15 min) ────────────
  app.use(
    '/api/v1/auth',
    rateLimit({
      windowMs: 15 * 60 * 1_000,   // 15 minutes
      max: 20,
      message: {
        statusCode: 429,
        message: 'Too many auth attempts, please try again later.',
      },
    }),
  );
 
  // ── 5. NoSQL injection sanitisation ─────────────────────────────────────
  // Strips keys that start with '$' or contain '.' from req.body / req.query
  //app.use(mongoSanitize({ allowDots: true, replaceWith: '_' }));
  // Thay thế express-mongo-sanitize
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const sanitize = (obj: any) => {
      if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          if (key.startsWith('$') || key.includes('.')) {
            delete obj[key];
          } else {
            sanitize(obj[key]);
          }
        }
      }
    };
    sanitize(req.body);
    next();
  });
}
 