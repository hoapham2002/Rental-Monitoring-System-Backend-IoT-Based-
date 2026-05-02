//
// ═══════════════════════════════════════════════════════════════════
// IoT GATEWAY SCRIPT — Task 2.3
// ═══════════════════════════════════════════════════════════════════
// Chạy trên máy tính, đọc dữ liệu từ cổng Serial (Proteus Virtual
// Serial Port) rồi forward lên backend API.
//
// Đồng thời kết nối Socket.io để nhận lệnh điều khiển từ backend
// (FE/Mobile gọi POST /devices/control → backend emit 'command' →
//  script này nhận và ghi xuống Serial cho Arduino/ESP32 xử lý).
//
// CÁCH DÙNG:
//   1. npm install (trong thư mục iot-gateway-script)
//   2. Copy .env.example → .env, điền PORT và API_URL
//   3. node gateway.js
//
// FORMAT DỮ LIỆU TỪ ARDUINO (1 dòng kết thúc \n):
//   DEVICE_ID:VALUE
//   Ví dụ:
//     FIRE_101:FIRE
//     LOCK_101:DOOR_OPEN
//     LOCK_101:PASSWORD_FAIL
//     LIGHT_101:MOTION_ON
//     FIRE_101:NORMAL
// ═══════════════════════════════════════════════════════════════════
 
require('dotenv').config();
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { io } = require('socket.io-client');
const https = require('https');
const http = require('http');
 
// ── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  // Serial port — đổi theo máy bạn
  // Windows: 'COM3', 'COM4'...  Linux/Mac: '/dev/ttyUSB0', '/dev/ttyACM0'
  SERIAL_PORT: process.env.SERIAL_PORT || 'COM3',
  BAUD_RATE: parseInt(process.env.BAUD_RATE || '9600'),
 
  // Backend
  API_URL: process.env.API_URL || 'http://localhost:3000',
  API_KEY: process.env.IOT_API_KEY || '',
 
  // Retry
  RECONNECT_INTERVAL_MS: 3000,
  MAX_RETRIES: 5,
};
 
if (!CONFIG.API_KEY) {
  console.error('❌ IOT_API_KEY is not set in .env. Exiting.');
  process.exit(1);
}
 
// ── State ────────────────────────────────────────────────────────────────────
let serialPort = null;
let socketClient = null;
let isShuttingDown = false;
 
// ── Logger ───────────────────────────────────────────────────────────────────
function log(level, msg, data = '') {
  const ts = new Date().toISOString();
  const prefix = { INFO: '📡', WARN: '⚠️ ', ERROR: '❌', OK: '✅' }[level] || '  ';
  console.log(`[${ts}] ${prefix} [${level}] ${msg}`, data || '');
}
 
// ── HTTP POST to backend ─────────────────────────────────────────────────────
function postToBackend(deviceId, value) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      deviceId,
      value,
      ts: new Date().toISOString(),
    });
 
    const url = new URL(`${CONFIG.API_URL}/api/v1/devices/status`);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
 
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 3000),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-api-key': CONFIG.API_KEY,
      },
    };
 
    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
 
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
 
    req.write(payload);
    req.end();
  });
}
 
// ── Parse Serial line ─────────────────────────────────────────────────────────
// Format: "DEVICE_ID:VALUE"   e.g. "FIRE_101:FIRE"
function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes(':')) return null;
 
  const colonIdx = trimmed.indexOf(':');
  const deviceId = trimmed.substring(0, colonIdx).trim();
  const value = trimmed.substring(colonIdx + 1).trim();
 
  if (!deviceId || !value) return null;
  return { deviceId, value };
}
 
// ── Handle incoming serial data ───────────────────────────────────────────────
async function handleSerialData(line) {
  const parsed = parseLine(line);
  if (!parsed) {
    log('WARN', `Unrecognised serial data: "${line}"`);
    return;
  }
 
  const { deviceId, value } = parsed;
  log('INFO', `Serial → device=${deviceId} value=${value}`);
 
  try {
    const result = await postToBackend(deviceId, value);
    log('OK', `Backend ACK → ${deviceId}:${value}`, `alert_created=${result.alert_created}`);
  } catch (err) {
    log('ERROR', `Failed to POST ${deviceId}:${value}`, err.message);
  }
}
 
// ── Write command to Serial (backend → Arduino) ───────────────────────────────
function writeToSerial(command) {
  if (!serialPort || !serialPort.isOpen) {
    log('WARN', 'Cannot write to serial: port not open');
    return;
  }
  // Format gửi xuống Arduino: "CMD:UNLOCK\n"
  const msg = `CMD:${command}\n`;
  serialPort.write(msg, (err) => {
    if (err) {
      log('ERROR', 'Serial write failed', err.message);
    } else {
      log('OK', `Sent to Arduino: ${msg.trim()}`);
    }
  });
}
 
// ── Setup Serial Port ─────────────────────────────────────────────────────────
function setupSerial() {
  log('INFO', `Opening serial port ${CONFIG.SERIAL_PORT} @ ${CONFIG.BAUD_RATE} baud`);
 
  serialPort = new SerialPort({
    path: CONFIG.SERIAL_PORT,
    baudRate: CONFIG.BAUD_RATE,
    autoOpen: false,
  });
 
  const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
 
  serialPort.open((err) => {
    if (err) {
      log('ERROR', `Cannot open serial port: ${err.message}`);
      log('INFO', `Retrying in ${CONFIG.RECONNECT_INTERVAL_MS}ms...`);
      setTimeout(setupSerial, CONFIG.RECONNECT_INTERVAL_MS);
      return;
    }
    log('OK', `Serial port ${CONFIG.SERIAL_PORT} opened`);
  });
 
  parser.on('data', handleSerialData);
 
  serialPort.on('error', (err) => {
    log('ERROR', 'Serial port error', err.message);
  });
 
  serialPort.on('close', () => {
    if (isShuttingDown) return;
    log('WARN', 'Serial port closed. Reconnecting...');
    setTimeout(setupSerial, CONFIG.RECONNECT_INTERVAL_MS);
  });
}
 
// ── Setup Socket.io (nhận lệnh từ backend) ────────────────────────────────────
function setupSocket() {
  log('INFO', `Connecting to Socket.io at ${CONFIG.API_URL}`);
 
  socketClient = io(CONFIG.API_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: CONFIG.RECONNECT_INTERVAL_MS,
  });
 
  socketClient.on('connect', () => {
    log('OK', `Socket.io connected: ${socketClient.id}`);
  });
 
  socketClient.on('disconnect', (reason) => {
    log('WARN', `Socket.io disconnected: ${reason}`);
  });
 
  // Nhận lệnh điều khiển từ backend
  // Khi FE gọi POST /devices/control → backend emit 'command' event
  socketClient.on('command', (payload) => {
    log('INFO', `Command received from backend`, JSON.stringify(payload));
    if (payload?.command) {
      writeToSerial(payload.command);
    }
  });
 
  socketClient.on('connect_error', (err) => {
    log('ERROR', 'Socket.io connection error', err.message);
  });
}
 
// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown() {
  isShuttingDown = true;
  log('INFO', 'Shutting down gateway...');
  if (socketClient) socketClient.disconnect();
  if (serialPort && serialPort.isOpen) {
    serialPort.close(() => {
      log('OK', 'Serial port closed cleanly');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}
 
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
 
// ── SIMULATION MODE (khi không có Serial port thực) ──────────────────────────
// Dùng khi test backend mà không có Proteus/Arduino
// Gửi 1 event FIRE mỗi 10 giây để test flow
function runSimulationMode() {
  log('INFO', '🔵 Running in SIMULATION MODE (no serial port)');
  log('INFO', 'Sending simulated events every 10s...\n');
 
  const simulatedEvents = [
    { deviceId: 'FIRE_101', value: 'NORMAL' },
    { deviceId: 'LOCK_101', value: 'DOOR_LOCKED' },
    { deviceId: 'LIGHT_101', value: 'MOTION_ON' },
    { deviceId: 'LIGHT_101', value: 'MOTION_OFF' },
    { deviceId: 'LOCK_101', value: 'PASSWORD_FAIL' },
    { deviceId: 'FIRE_101', value: 'FIRE' },      // ← trigger fire alert!
    { deviceId: 'FIRE_101', value: 'NORMAL' },
  ];
 
  let idx = 0;
  const interval = setInterval(async () => {
    if (isShuttingDown) {
      clearInterval(interval);
      return;
    }
 
    const event = simulatedEvents[idx % simulatedEvents.length];
    log('INFO', `[SIM] Sending → ${event.deviceId}:${event.value}`);
 
    try {
      const result = await postToBackend(event.deviceId, event.value);
      log('OK', `[SIM] Backend ACK`, `alert_created=${result.alert_created}`);
    } catch (err) {
      log('ERROR', `[SIM] POST failed`, err.message);
    }
 
    idx++;
  }, 10_000);
}
 
// ── MAIN ──────────────────────────────────────────────────────────────────────
log('INFO', '═══════════════════════════════════════');
log('INFO', '  IoT Gateway Script — Rental System   ');
log('INFO', '═══════════════════════════════════════');
log('INFO', `API URL  : ${CONFIG.API_URL}`);
log('INFO', `Serial   : ${CONFIG.SERIAL_PORT} @ ${CONFIG.BAUD_RATE}`);
 
setupSocket(); // luôn kết nối Socket.io để nhận lệnh
 
if (process.env.SIMULATE === 'true') {
  runSimulationMode();
} else {
  setupSerial();
}