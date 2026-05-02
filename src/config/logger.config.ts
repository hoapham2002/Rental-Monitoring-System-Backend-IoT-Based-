//
// Winston logger — structured JSON logs.
//
// Transports:
//   development  → colorized console (human-readable)
//   production   → JSON console + error.log file
//
// Usage in main.ts:
//   const logger = WinstonModule.createLogger(loggerConfig);
//   const app = await NestFactory.create(AppModule, { logger });
 
import { utilities as nestWinstonUtilities, WinstonModule } from 'nest-winston';
import * as winston from 'winston';
 
const { combine, timestamp, json, errors, colorize, printf } = winston.format;
 
// ── Development format: readable + colorized ─────────────────────────────────
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  nestWinstonUtilities.format.nestLike('IoT-Rental', {
    prettyPrint: true,
    colors: true,
  }),
);
 
// ── Production format: JSON with correlation ──────────────────────────────────
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);
 
const isDev = process.env.NODE_ENV !== 'production';
 
export const loggerConfig = {
  transports: [
    // Console transport (always on)
    new winston.transports.Console({
      level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
      format: isDev ? devFormat : prodFormat,
    }),
 
    // File transport: all errors (production only)
    ...(isDev
      ? []
      : [
          new winston.transports.File({
            filename: 'logs/error.log',
            level:    'error',
            format:   prodFormat,
            maxsize:  10 * 1024 * 1024, // 10MB
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            level:    'info',
            format:   prodFormat,
            maxsize:  10 * 1024 * 1024,
            maxFiles: 5,
          }),
        ]),
  ],
};
 