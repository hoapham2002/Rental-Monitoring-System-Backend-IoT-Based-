<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

# IoT Rental System — Backend
 
NestJS + MongoDB + Socket.io + BullMQ · **All Phases Complete (Phase 1–6)**
 
---
 
## Quick Start
 
```bash
# 1. Install dependencies
npm install
 
# 2. Setup environment
cp .env.example .env
# → Điền DB_URI, JWT_SECRET (32+ chars), IOT_API_KEY
 
# 3. Create MongoDB indexes (chạy 1 lần)
npm run create-indexes
 
# 4. Seed demo data
npm run seed
 
# 5. Start dev server
npm run start:dev
```
 
| URL | Mô tả |
|-----|-------|
| `http://localhost:3000/api/v1` | REST API |
| `http://localhost:3000/api/v1/docs` | Swagger UI |
| `http://localhost:3000/api/v1/health` | Health check |
| `ws://localhost:3000` | Socket.io |
 
---
 
## Demo Credentials (sau khi seed)
 
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@demo.com | demo1234 |
| Owner | owner@demo.com | demo1234 |
| Tenant | tenant1@demo.com | demo1234 |
 
---
 
## Project Structure
 
```
src/
├── auth/              Phase 1  — JWT login, 3 roles, profile
├── gateway/           Phase 2  — Socket.io realtime hub
├── devices/           Phase 2  — IoT status, control, device logs
├── alerts/            Phase 2  — Fire/security alert management
├── notifications/     Phase 3  — BullMQ queue + worker + API
├── rooms/             Phase 4  — CRUD + 3-layer integrity guard
├── bills/             Phase 4  — Billing + atomic pay + cron reminder
├── stats/             Phase 5  — Aggregation pipelines + Redis cache
├── health/            Phase 5  — @nestjs/terminus health checks
├── integration/       Phase 6  — End-to-end integration tests
└── common/
    ├── schemas/       7 Mongoose schemas (V6 spec, all indexes)
    ├── guards/        JwtAuthGuard + RolesGuard
    ├── middleware/    Security + ApiKey
    ├── filters/       GlobalExceptionFilter
    └── decorators/    @Roles()
 
scripts/
├── create-indexes.ts  MongoDB index setup (run once)
├── seed.ts            Demo data (3 rooms, 4 users, 5 devices...)
└── k6-stress-test.js  Load test — 50 devices × 5 min
 
iot-gateway-script/
└── gateway.js         Arduino/Proteus → HTTP + Socket.io bridge
```
 
---
 
## All API Endpoints
 
### Auth `/auth`
| Method | Path | Guard | |
|--------|------|-------|-|
| POST | /login | Public | Login → JWT |
| GET | /profile | JWT | User hiện tại |
| POST | /invite-owner | JWT+Admin | Tạo Owner |
| POST | /register-tenant | JWT+Owner | Tạo Tenant + gán phòng |
 
### Rooms `/rooms`
| Method | Path | Guard | |
|--------|------|-------|-|
| GET | / | JWT | Danh sách (auto-filter by role) |
| POST | / | JWT+Owner/Admin | Tạo phòng |
| PATCH | /:id/assign | JWT+Owner/Admin | Gán tenant |
| PATCH | /:id/status | JWT+Owner/Admin | Cập nhật status |
| DELETE | /:id | JWT+Owner/Admin | Xóa (3 integrity checks) |
 
### Devices `/devices`
| Method | Path | Guard | |
|--------|------|-------|-|
| GET | / | JWT | Danh sách (auto-filter) |
| GET | /:id/logs | JWT | Lịch sử hoạt động |
| POST | /status | x-api-key | IoT Gateway gửi data |
| POST | /control | JWT | Điều khiển từ xa |
 
### Alerts `/alerts`
| Method | Path | Guard | |
|--------|------|-------|-|
| GET | / | JWT | Danh sách + filter |
| PATCH | /:id/resolve | JWT+Owner/Admin | Đánh dấu đã xử lý |
 
### Bills `/bills`
| Method | Path | Guard | |
|--------|------|-------|-|
| POST | / | JWT+Owner | Tạo bill + auto-snapshot |
| GET | / | JWT+Owner/Admin | Danh sách |
| GET | /my-bill | JWT+Tenant | Hóa đơn của mình |
| PATCH | /:id/status | JWT+Owner | Xác nhận thanh toán (atomic) |
 
### Notifications `/notifications`
| Method | Path | Guard | |
|--------|------|-------|-|
| GET | / | JWT | Danh sách + unread count |
| PATCH | /:id/read | JWT | Đánh dấu đã đọc |
| PATCH | /read-all | JWT | Đánh dấu tất cả đã đọc |
 
### Stats `/stats`
| Method | Path | Guard | |
|--------|------|-------|-|
| GET | /overview | JWT+Owner/Admin | Dashboard summary |
| GET | /revenue | JWT+Owner/Admin | Doanh thu theo tháng |
| GET | /alerts | JWT+Owner/Admin | Thống kê cảnh báo |
| GET | /devices | JWT+Owner/Admin | Device online ratio |
 
### Health `/health`
| Method | Path | Guard | |
|--------|------|-------|-|
| GET | / | Public | MongoDB + Redis + Memory |
 
---
 
## Socket.io Events
 
**Client → Server:**
```
join-room   { roomId }   Subscribe vào room channel
leave-room  { roomId }   Unsubscribe
```
 
**Server → Client:**
```
alert          Cảnh báo cháy/bảo mật realtime
device-update  Thiết bị đổi trạng thái
notification   Thông báo cá nhân (bill, alert)
command        Lệnh điều khiển → Gateway Script nhận
connected      Welcome message khi connect
```
 
---
 
## Testing
 
```bash
# Unit tests (mock DB/Redis)
npm test
 
# Unit tests với coverage report
npm run test:cov
 
# Integration tests (dùng mongodb-memory-server, không cần real DB)
npm run test:integration
 
# Load test — 50 thiết bị × 5 phút (cần cài k6)
k6 run scripts/k6-stress-test.js
```
 
---
 
## IoT Gateway Script
 
```bash
cd iot-gateway-script
npm install
cp .env.example .env   # điền SERIAL_PORT, API_URL, IOT_API_KEY
 
# Với Arduino/Proteus thật
node gateway.js
 
# Simulation mode — không cần phần cứng
SIMULATE=true node gateway.js
```
 
**Arduino Serial format:** `DEVICE_ID:VALUE\n`
```
FIRE_101:FIRE          → tạo fire alert + push notification
LOCK_101:DOOR_OPEN     → log door open event
LOCK_101:PASSWORD_FAIL → tạo security alert
LIGHT_101:MOTION_ON    → log motion detected
```
 
---
 
## Security Checklist
 
- ✅ Helmet — XSS, HSTS, CSP, referrer policy
- ✅ Rate limiting — 100 req/min global, 20 req/15min on /auth
- ✅ CORS whitelist — từ `CORS_ORIGINS` env
- ✅ mongo-sanitize — chặn NoSQL injection
- ✅ JWT — access token 15 phút
- ✅ API Key — riêng cho IoT (x-api-key header)
- ✅ RBAC — 3 roles với middleware guard
- ✅ Input validation — class-validator trên mọi DTO
- ✅ Atomic update — $ne guard chống double-pay
---
 
## Tech Stack
 
| | Technology |
|-|-----------|
| Framework | NestJS 10 + TypeScript 5 |
| Database | MongoDB Atlas + Mongoose 8 |
| Realtime | Socket.io 4 |
| Queue | BullMQ 5 + Redis |
| Auth | Passport.js + JWT |
| Validation | class-validator + class-transformer |
| Security | Helmet + express-rate-limit + mongo-sanitize |
| Docs | Swagger UI (OpenAPI 3) |
| Logging | Winston + nest-winston |
| Health | @nestjs/terminus |
| Scheduling | @nestjs/schedule |
| Testing | Jest + SuperTest + mongodb-memory-server |
| Load test | k6 |
 
