//
// ═══════════════════════════════════════════════════════════════════
// WEBSOCKET CLIENT TEST — Task 2.4
// ═══════════════════════════════════════════════════════════════════
// Test thủ công flow hoàn chỉnh:
//   1. Kết nối Socket.io tới backend
//   2. Join room theo roomId
//   3. Lắng nghe sự kiện 'alert' và 'device-update'
//   4. Giả lập IoT gửi FIRE event qua HTTP POST → kiểm tra socket nhận được
//
// CÁCH CHẠY (khi backend đã start):
//   npx ts-node src/gateway/ws-client.test.ts
// ═══════════════════════════════════════════════════════════════════
 
import { io, Socket } from 'socket.io-client';
import * as https from 'https';
import * as http from 'http';
 
const API_URL = process.env.API_URL || 'http://localhost:3000';
const IOT_API_KEY = process.env.IOT_API_KEY || 'super_secret_iot_api_key_change_me';
 
// Room ID phải khớp với seed data
const TEST_ROOM_ID = process.env.TEST_ROOM_ID || '';
 
// ── Logger ────────────────────────────────────────────────────────────────────
function log(icon: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${icon} ${msg}`, data ? JSON.stringify(data, null, 2) : '');
}
 
// ── HTTP helper ───────────────────────────────────────────────────────────────
function postStatus(deviceId: string, value: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ deviceId, value, ts: new Date().toISOString() });
    const url = new URL(`${API_URL}/api/v1/devices/status`);
    const lib = url.protocol === 'https:' ? https : http;
 
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || 3000,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-api-key': IOT_API_KEY,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(JSON.parse(body)));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
 
// ── Main test flow ────────────────────────────────────────────────────────────
async function runTest() {
  log('🚀', 'Starting WebSocket client test...');
  log('📡', `Connecting to ${API_URL}`);
 
  if (!TEST_ROOM_ID) {
    log('⚠️ ', 'TEST_ROOM_ID not set. Set it to a valid room ObjectId from seed data.');
    log('💡', 'Example: TEST_ROOM_ID=665f... npx ts-node src/gateway/ws-client.test.ts');
    process.exit(1);
  }
 
  const socket: Socket = io(API_URL, {
    transports: ['websocket'],
    timeout: 5000,
  });
 
  // ── Received events tracking ───────────────────────────────────────────────
  const received: { event: string; data: unknown }[] = [];
 
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('❌ Test timeout: no events received within 15s'));
    }, 15_000);
 
    // ── 1. On connect ──────────────────────────────────────────────────────
    socket.on('connect', () => {
      log('✅', `Connected! Socket ID: ${socket.id}`);
 
      // ── 2. Join room ──────────────────────────────────────────────────
      log('🚪', `Joining room: ${TEST_ROOM_ID}`);
      socket.emit('join-room', { roomId: TEST_ROOM_ID });
    });
 
    socket.on('joined-room', (data: any) => {
      log('✅', `Joined room: ${data.roomId}`);
 
      // ── 3. Simulate IoT sending FIRE event ───────────────────────────
      setTimeout(async () => {
        log('🔥', 'Simulating IoT → POST /devices/status with FIRE event...');
        try {
          const result = await postStatus('FIRE_101', 'FIRE');
          log('📬', 'Backend responded:', result);
        } catch (err: any) {
          log('❌', 'POST failed:', err.message);
        }
      }, 500);
    });
 
    // ── 4. Listen for alert event ──────────────────────────────────────
    socket.on('alert', (data: any) => {
      log('🚨', 'ALERT received via Socket.io!', data);
      received.push({ event: 'alert', data });
 
      // Validate shape
      const requiredFields = ['alertId', 'type', 'severity', 'message', 'device_id', 'room_id'];
      const missing = requiredFields.filter((f) => !(f in data));
      if (missing.length > 0) {
        log('❌', `Alert payload missing fields: ${missing.join(', ')}`);
      } else {
        log('✅', 'Alert payload shape is correct');
      }
    });
 
    // ── 5. Listen for device-update event ─────────────────────────────
    socket.on('device-update', (data: any) => {
      log('🔄', 'DEVICE UPDATE received!', data);
      received.push({ event: 'device-update', data });
    });
 
    socket.on('connected', (data: any) => {
      log('📡', 'Server welcome:', data);
    });
 
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(new Error(`Connection failed: ${err.message}`));
    });
 
    socket.on('disconnect', () => {
      log('🔌', 'Disconnected from server');
    });
 
    // ── 6. After 8s, print summary and exit ───────────────────────────
    setTimeout(() => {
      clearTimeout(timeout);
 
      log('', '');
      log('📊', '══════════ TEST SUMMARY ══════════');
      log('📊', `Total events received: ${received.length}`);
 
      const alertEvents = received.filter((e) => e.event === 'alert');
      const updateEvents = received.filter((e) => e.event === 'device-update');
 
      log(alertEvents.length > 0 ? '✅' : '❌', `Alert events: ${alertEvents.length}`);
      log(updateEvents.length > 0 ? '✅' : '❌', `Device-update events: ${updateEvents.length}`);
 
      if (alertEvents.length > 0 && updateEvents.length > 0) {
        log('🎉', 'ALL TESTS PASSED — WebSocket flow working correctly!');
      } else {
        log('⚠️ ', 'Some events not received. Check backend logs.');
      }
 
      socket.disconnect();
      resolve();
    }, 8_000);
  });
}
 
runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });