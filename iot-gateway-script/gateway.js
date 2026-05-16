require('dotenv').config();
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { io } = require('socket.io-client');
const https = require('https');
const http = require('http');

const CONFIG = {
  SERIAL_PORT: process.env.SERIAL_PORT || 'COM3',
  BAUD_RATE: parseInt(process.env.BAUD_RATE || '9600'),
  API_URL: process.env.API_URL || 'http://localhost:3000',
  API_KEY: process.env.IOT_API_KEY || '',
  RECONNECT_INTERVAL_MS: 3000,
};

let serialPort = null;
let socketClient = null;

function log(level, msg, data = '') {
  const ts = new Date().toISOString();
  const prefix = { INFO: '📡', WARN: '⚠️ ', ERROR: '❌', OK: '✅' }[level] || '  ';
  console.log(`[${ts}] ${prefix} [${level}] ${msg}`, data || '');
}

function postToBackend(deviceId, value) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ deviceId, value, ts: new Date().toISOString() });
    const url = new URL(`${CONFIG.API_URL}/api/v1/devices/status`);
    const lib = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 3000),
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
      res.on('end', () => res.statusCode < 300 ? resolve(JSON.parse(body)) : reject(new Error(body)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function handleSerialData(line) {
  const rawLine = line.toString().trim();
  if (!rawLine || !rawLine.includes(':')) return;

  // Tách ID và Giá trị chuẩn xác (Lấy dấu : đầu tiên)
  const firstColonIndex = rawLine.indexOf(':');
  const deviceId = rawLine.substring(0, firstColonIndex);
  const value = rawLine.substring(firstColonIndex + 1);

  log('INFO', `Dữ liệu từ Arduino: ${deviceId} = ${value}`);
  try {
    const result = await postToBackend(deviceId, value);
    log('OK', `Backend đã nhận: ${deviceId}:${value}`);
  } catch (err) {
    log('ERROR', `Lỗi gửi Backend: ${err.message}`);
  }
}

function setupSerial() {
  log('INFO', `Đang mở cổng ${CONFIG.SERIAL_PORT}...`);
  serialPort = new SerialPort({ path: CONFIG.SERIAL_PORT, baudRate: CONFIG.BAUD_RATE, autoOpen: false });
  const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
  serialPort.open((err) => {
    if (err) {
      log('ERROR', `KHÔNG MỞ ĐƯỢC CỔNG: ${err.message}`);
      setTimeout(setupSerial, CONFIG.RECONNECT_INTERVAL_MS);
    } else {
      log('OK', `Cổng ${CONFIG.SERIAL_PORT} đã mở thành công!`);
    }
  });
  parser.on('data', handleSerialData);
}

function setupSocket() {
  log('INFO', `Đang kết nối Socket.io: ${CONFIG.API_URL}`);
  socketClient = io(CONFIG.API_URL, { transports: ['websocket'] });
  
  socketClient.on('connect', () => log('OK', `Đã kết nối Socket.io: ${socketClient.id}`));
  
  // LẮNG NGHE LỆNH TỪ WEB QUA BACKEND
  socketClient.on('command', (payload) => {
    log('INFO', `🎮 NHẬN LỆNH TỪ WEB:`, JSON.stringify(payload));
    if (serialPort && serialPort.isOpen && payload.command) {
      const msg = `CMD:${payload.command}\n`;
      serialPort.write(msg, () => log('OK', `📤 Đã gửi xuống Arduino: ${msg.trim()}`));
    } else {
      log('WARN', `⚠️ Không thể gửi lệnh (Cổng Serial chưa mở hoặc lệnh rỗng)`);
    }
  });

  socketClient.on('connect_error', (err) => log('ERROR', `Lỗi kết nối Socket: ${err.message}`));
}

setupSerial();
setupSocket();