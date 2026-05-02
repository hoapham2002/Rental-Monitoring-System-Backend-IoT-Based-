import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { applySecurityMiddleware } from './common/middleware/security.middleware';
import { loggerConfig } from './config/logger.config';

async function bootstrap() {
  // ── Winston logger ────────────────────────────────────────────────────────
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(loggerConfig),
  });

  // ── API prefix /api/v1 ────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Security middleware (Helmet, rate-limit, CORS, mongo-sanitize) ────────
  applySecurityMiddleware(app);

  // ── Global validation pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,
      forbidNonWhitelisted: true,
      transform:            true,
      transformOptions:     { enableImplicitConversion: true },
    }),
  );

  // ── Global exception filter → uniform JSON errors ─────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ── Swagger UI at /api/v1/docs ────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('IoT Rental System API')
    .setDescription(
      [
        'Backend API cho hệ thống quản lý nhà trọ thông minh.',
        '',
        '**Roles:** admin | owner | tenant',
        '',
        '**Auth:** Sử dụng Bearer JWT cho tất cả endpoint (trừ /auth/login).',
        'IoT devices dùng header `x-api-key` thay JWT.',
        '',
        '**Socket.io events (client lắng nghe):**',
        '- `alert`         → cảnh báo cháy/bảo mật realtime',
        '- `device-update` → thiết bị đổi trạng thái',
        '- `notification`  → thông báo cá nhân',
        '- `command`       → lệnh điều khiển thiết bị (Gateway Script)',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'IoT-API-Key')
    .addTag('Auth',          'Đăng nhập, tạo tài khoản, profile')
    .addTag('Rooms',         'Quản lý phòng')
    .addTag('Devices',       'Thiết bị IoT — trạng thái, điều khiển, lịch sử')
    .addTag('Alerts',        'Cảnh báo cháy/bảo mật')
    .addTag('Bills',         'Hóa đơn tháng')
    .addTag('Notifications', 'Thông báo in-app')
    .addTag('Stats',         'Thống kê dashboard')
    .addTag('Health',        'Health check')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter:           'alpha',
      operationsSorter:     'alpha',
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`\n🚀 Server:  http://localhost:${port}/api/v1`);
  console.log(`📄 Swagger: http://localhost:${port}/api/v1/docs`);
  console.log(`❤️  Health:  http://localhost:${port}/api/v1/health`);
  console.log(`🔌 Socket:  ws://localhost:${port}\n`);
}

bootstrap();