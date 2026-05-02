# IoT Gateway Script

Script chạy trên máy tính, làm cầu nối giữa Arduino/Proteus và backend cloud.

## Luồng dữ liệu

```
Arduino/Proteus
     │  Serial (USB)
     ▼
gateway.js  ──── POST /api/v1/devices/status ──► Backend NestJS
     │                                                │
     │◄─── Socket.io 'command' event ────────────────┘
     │
     ▼  Serial write
Arduino (thực thi lệnh: mở khóa, bật đèn...)
```

## Cài đặt

```bash
cd iot-gateway-script
npm install
cp .env.example .env
# Điền SERIAL_PORT, API_URL, IOT_API_KEY
```

## Chạy với Proteus thật

```bash
node gateway.js
```

## Chạy Simulation Mode (không cần Arduino)

```bash
# Windows
set SIMULATE=true && node gateway.js

# Linux/Mac
SIMULATE=true node gateway.js
# hoặc
npm run simulate
```

Simulation mode sẽ tự động gửi các events sau theo chu kỳ 10 giây:
```
FIRE_101:NORMAL
LOCK_101:DOOR_LOCKED
LIGHT_101:MOTION_ON
LIGHT_101:MOTION_OFF
LOCK_101:PASSWORD_FAIL   ← tạo security alert
FIRE_101:FIRE            ← tạo fire alert + push notification
FIRE_101:NORMAL
```

## Format dữ liệu Arduino gửi lên Serial

Arduino phải gửi đúng format: `DEVICE_ID:VALUE\n`

```cpp
// Arduino code mẫu
Serial.println("FIRE_101:FIRE");       // cháy
Serial.println("FIRE_101:NORMAL");     // bình thường
Serial.println("LOCK_101:DOOR_OPEN");  // mở cửa
Serial.println("LOCK_101:DOOR_LOCKED");// đóng cửa
Serial.println("LOCK_101:PASSWORD_FAIL"); // sai mật khẩu
Serial.println("LIGHT_101:MOTION_ON"); // phát hiện chuyển động
Serial.println("LIGHT_101:MOTION_OFF");// hết chuyển động
```

## Nhận lệnh từ backend (điều khiển từ xa)

Khi FE/Mobile gọi `POST /devices/control`, backend sẽ emit Socket.io event `command`.
Gateway nhận và ghi xuống Serial:

```
CMD:UNLOCK\n
CMD:LOCK\n
CMD:LIGHT_ON\n
CMD:LIGHT_OFF\n
```

Arduino đọc và xử lý lệnh này.