import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
 
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // ── Joi schema: app crashes immediately if a required var is missing ──
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),
        API_PREFIX: Joi.string().default('api/v1'),
 
        DB_URI: Joi.string().required(),
 
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_SECRET: Joi.string().min(32).optional(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
 
        IOT_API_KEY: Joi.string().min(16).required(),
 
        CORS_ORIGINS: Joi.string().required(),
 
        REDIS_HOST: Joi.string().default('127.0.0.1'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').default(''),
 
        LOG_LEVEL: Joi.string()
          .valid('error', 'warn', 'info', 'debug', 'verbose')
          .default('debug'),
      }),
      validationOptions: {
        abortEarly: true, // stop at first missing var for clear error messages
      },
    }),
  ],
})
export class AppConfigModule {}