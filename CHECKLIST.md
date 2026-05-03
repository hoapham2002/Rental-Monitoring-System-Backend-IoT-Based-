# ✅ Go-Live Checklist — IoT Rental System Backend

> Review với product owner trước khi deploy demo/defense.

---

## 1. Environment Variables

- [ ] `DB_URI` trỏ đúng MongoDB Atlas cluster
- [ ] `JWT_SECRET` đủ 32+ ký tự, random string (không dùng default)
- [ ] `IOT_API_KEY` đã thay đổi khỏi giá trị mặc định
- [ ] `CORS_ORIGINS` chỉ chứa đúng domain FE/Mobile
- [ ] `REDIS_HOST` / `REDIS_PORT` trỏ đúng Redis instance
- [ ] `NODE_ENV=production` được set
- [ ] `.env` không được commit lên Git (kiểm tra `.gitignore`)

---

## 2. Database

- [ ] Chạy `npm run create-indexes` để tạo đủ indexes
- [ ] Chạy `npm run seed` để có dữ liệu demo
- [ ] MongoDB Atlas: IP Whitelist đã thêm server IP
- [ ] MongoDB Atlas: Database user có đúng quyền (readWrite)
- [ ] Backup được bật trên Atlas

---

## 3. Health Check

- [ ] `GET /api/v1/health` trả về `status: "ok"`
- [ ] MongoDB indicator: `up`
- [ ] Redis indicator: `up`
- [ ] Memory heap < 300MB

---

## 4. Security

- [ ] `helmet` headers hiện diện trong response (kiểm tra bằng curl)
- [ ] Rate limiting hoạt động (thử > 100 req/min → nhận 429)
- [ ] CORS chặn origin không trong whitelist
- [ ] `POST /devices/status` trả 401 nếu thiếu `x-api-key`
- [ ] `GET /stats/overview` trả 401 nếu thiếu JWT

---

## 5. API Endpoints

- [ ] Swagger UI load được tại `/api/v1/docs`
- [ ] Login 3 roles thành công (admin, owner, tenant)
- [ ] `GET /auth/profile` trả đúng user (không có password field)
- [ ] `POST /devices/status` với `value: FIRE` → tạo Alert + emit socket
- [ ] `GET /alerts` owner chỉ thấy phòng mình
- [ ] `POST /bills` tạo bill + snapshot đúng tenant info
- [ ] `PATCH /bills/:id/status` atomic update paid_at
- [ ] `GET /stats/overview` trả đủ 6 fields

---

## 6. Realtime (Socket.io)

- [ ] Kết nối socket thành công từ FE/Mobile
- [ ] `join-room` event hoạt động
- [ ] Gửi FIRE event → FE nhận `alert` event trong < 1 giây
- [ ] Gateway Script kết nối socket thành công

---

## 7. Background Jobs (BullMQ)

- [ ] Redis kết nối thành công khi start app (kiểm tra log)
- [ ] Notification worker khởi động (log: "Notification worker started")
- [ ] Sau khi tạo Alert FIRE → Notification được lưu vào DB
- [ ] `GET /notifications` trả đúng notification cho tenant

---

## 8. Cron Job

- [ ] `@nestjs/schedule` module loaded (log: "Scheduler started")
- [ ] Cron job `bill-reminder` đăng ký thành công
- [ ] Test thủ công: gọi `billsService.sendBillReminders()` trực tiếp → log "Found N unpaid bills"

---

## 9. Demo Data

- [ ] 3 phòng tồn tại (101 occupied, 102 occupied, 103 empty)
- [ ] 4 users (admin, owner, 2 tenants) với password `demo1234`
- [ ] 5 devices (3 phòng 101, 2 phòng 102)
- [ ] 2 alerts (1 resolved fire, 1 unresolved security)
- [ ] 3 bills (1 paid, 1 unpaid, 1 pending)
- [ ] 2 notifications cho tenant1

---

## 10. Demo Script (Kịch bản Demo)

### Kịch bản chính: Fire Detection Flow

```
1. Mở Swagger UI → Login với owner@demo.com
2. Chạy IoT Gateway Script ở Simulation Mode:
     cd iot-gateway-script && SIMULATE=true node gateway.js
3. Chờ script gửi FIRE event (sau ~60s)
4. Mở GET /alerts → thấy alert mới với type: "fire", resolved: false
5. Mở GET /notifications → tenant đã nhận notification
6. PATCH /alerts/:id/resolve → đánh dấu đã xử lý
7. GET /stats/overview → active_alerts giảm
```

### Kịch bản phụ: Tạo hóa đơn

```
1. Login owner → POST /bills với room_id phòng 101, tháng hiện tại
2. Swagger hiển thị bill với tenant_name_snapshot
3. GET /notifications (login tenant1) → nhận bill notification
4. PATCH /bills/:id/status → xác nhận paid, paid_at được set
```

---

## 11. Performance Baseline (trước khi demo)

- [ ] `GET /stats/overview` response time < 200ms (cold)
- [ ] `GET /stats/overview` response time < 50ms (sau cache hit)
- [ ] `POST /devices/status` response time < 100ms
- [ ] WebSocket alert latency < 500ms từ lúc gửi đến lúc FE nhận

---

*Last updated: Phase 6 complete*
