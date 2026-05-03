import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────
const alertsCreated   = new Counter('alerts_created');
const requestDuration = new Trend('request_duration_ms', true);
const errorRate       = new Rate('error_rate');

// ── Config ────────────────────────────────────────────────────────────────────
const API_URL   = __ENV.API_URL   || 'http://localhost:3000';
const IOT_KEY   = __ENV.IOT_API_KEY || 'super_secret_iot_api_key_change_me';

// 50 thiết bị (5 phòng × 10 devices)
const DEVICES = [
  // Room 101
  'FIRE_101', 'LOCK_101', 'LIGHT_101',
  // Room 102
  'FIRE_102', 'LOCK_102', 'LIGHT_102',
  // Room 103
  'FIRE_103', 'LOCK_103', 'LIGHT_103',
  // Thêm device giả để đủ 50
  ...Array.from({ length: 41 }, (_, i) => `DEVICE_${String(i + 1).padStart(3, '0')}`),
];

// Events có thể gửi (tỷ lệ: mostly normal, thỉnh thoảng alert)
const EVENTS = [
  { value: 'NORMAL',        weight: 40 },
  { value: 'DOOR_OPEN',     weight: 20 },
  { value: 'DOOR_LOCKED',   weight: 15 },
  { value: 'MOTION_ON',     weight: 10 },
  { value: 'MOTION_OFF',    weight: 10 },
  { value: 'PASSWORD_FAIL', weight: 3  },
  { value: 'FIRE',          weight: 2  },  // fire alert — ít nhất
];

function weightedRandom(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) return item.value;
  }
  return items[0].value;
}

// ── Test options ──────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Scenario 1: 50 devices gửi mỗi 5 giây trong 5 phút
    iot_devices: {
      executor:  'constant-vus',
      vus:       50,           // 50 virtual users = 50 thiết bị
      duration:  '5m',
      tags:      { scenario: 'iot_devices' },
    },

    // Scenario 2: Load test API endpoints (FE users)
    api_users: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '1m', target: 10 },  // ramp up
        { duration: '3m', target: 10 },  // sustained
        { duration: '1m', target: 0  },  // ramp down
      ],
      tags:      { scenario: 'api_users' },
    },
  },

  thresholds: {
    // 95% requests dưới 500ms
    http_req_duration: ['p(95)<500'],
    // Error rate dưới 5%
    error_rate:        ['rate<0.05'],
    // Tất cả requests dưới 1s
    'http_req_duration{scenario:iot_devices}': ['p(99)<1000'],
  },
};

// ── IoT Device scenario ───────────────────────────────────────────────────────
function runIoTDevice() {
  const deviceId = DEVICES[Math.floor(Math.random() * DEVICES.length)];
  const value    = weightedRandom(EVENTS);

  const payload = JSON.stringify({
    deviceId,
    value,
    ts: new Date().toISOString(),
  });

  const res = http.post(
    `${API_URL}/api/v1/devices/status`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key':    IOT_KEY,
      },
      timeout: '10s',
    },
  );

  const success = check(res, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'ok field is true':     (r) => {
      try { return JSON.parse(r.body).ok === true; } catch { return false; }
    },
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!success);
  requestDuration.add(res.timings.duration);

  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      if (body.alert_created) alertsCreated.add(1);
    } catch {}
  }

  // Mỗi device gửi mỗi 5 giây
  sleep(5);
}

// ── API User scenario ─────────────────────────────────────────────────────────
function runApiUser(authToken) {
  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${authToken}`,
  };

  // Random: xem overview stats hoặc alerts
  const endpoints = [
    '/api/v1/stats/overview',
    '/api/v1/stats/devices',
    '/api/v1/alerts?resolved=false',
    '/api/v1/notifications',
  ];
  const url = endpoints[Math.floor(Math.random() * endpoints.length)];

  const res = http.get(`${API_URL}${url}`, { headers, timeout: '5s' });

  check(res, {
    'API status 200': (r) => r.status === 200,
    'API < 1s':       (r) => r.timings.duration < 1000,
  });

  sleep(Math.random() * 3 + 1); // 1-4 giây giữa các requests
}

// ── Setup: login để lấy token ─────────────────────────────────────────────────
export function setup() {
  const res = http.post(
    `${API_URL}/api/v1/auth/login`,
    JSON.stringify({ email: 'owner@demo.com', password: 'demo1234' }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 200 && res.status !== 201) {
    console.warn(`Login failed: ${res.status} — API user scenario will skip auth calls`);
    return { token: null };
  }

  const body = JSON.parse(res.body);
  return { token: body.access_token };
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function (data) {
  const scenario = __ENV.K6_SCENARIO_NAME || 'iot_devices';

  if (scenario === 'api_users' && data.token) {
    runApiUser(data.token);
  } else {
    runIoTDevice();
  }
}

// ── Teardown: in summary ──────────────────────────────────────────────────────
export function teardown(data) {
  console.log('\n══════════════════════════════════════');
  console.log('  K6 STRESS TEST COMPLETE');
  console.log('══════════════════════════════════════');
  console.log(`  Alerts created during test: ${alertsCreated.name}`);
  console.log('  Check BullMQ dashboard for queue depth');
  console.log('══════════════════════════════════════\n');
}



//
// ═══════════════════════════════════════════════════════════════════
// K6 STRESS TEST — Task 6.3
// ═══════════════════════════════════════════════════════════════════
//
// Giả lập 50 thiết bị gửi status update mỗi 5 giây trong 5 phút.
//
// CÁCH CHẠY:
//   1. Cài k6: https://k6.io/docs/getting-started/installation/
//   2. Start backend: npm run start:dev
//   3. Chạy seed: npx ts-node scripts/seed.ts
//   4. Chạy test:
//      k6 run scripts/k6-stress-test.js
//
// Hoặc với biến môi trường:
//   API_URL=http://localhost:3000 IOT_API_KEY=your_key k6 run scripts/k6-stress-test.js
//
// THRESHOLDS (pass/fail criteria):
//   - 95% requests hoàn thành dưới 500ms
//   - Error rate < 5%
//   - Queue depth không vượt ngưỡng (kiểm tra qua BullMQ dashboard)
// ═══════════════════════════════════════════════════════════════════
