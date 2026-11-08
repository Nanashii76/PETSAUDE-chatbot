import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const errorRate = new Rate('internal_errors');
export const dbLatency = new Trend('internal_db_latency_ms');

export const options = {
  scenarios: {
    internal_stress_100_vus: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '15s', target: 100 }, // 100 concurrent users
        { duration: '25s', target: 100 }, // peak hold
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<100'],
    'internal_errors': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const vuId = __VU;
  const iter = __ITER;
  const profId = `stress_int_${vuId}`;

  // 1. Session create / get
  const t0 = Date.now();
  const identRes = http.post(`${BASE_URL}/api/identificacao`, JSON.stringify({
    identificador: profId,
    nome: `Dr. Carga ${vuId}`,
    unidade_cnes: '0010537',
  }), { headers: { 'Content-Type': 'application/json' } });

  const ok1 = check(identRes, { 'ident 200': (r) => r.status === 200 });
  if (!ok1) errorRate.add(1);

  // 2. Query Dashboard Analytics
  const pRes = http.get(`${BASE_URL}/api/painel?periodo=30d`);
  const ok2 = check(pRes, { 'painel 200': (r) => r.status === 200 });
  if (!ok2) errorRate.add(1);

  // 3. Query Encaminhamentos
  const eRes = http.get(`${BASE_URL}/api/encaminhamentos?periodo=30d`);
  const ok3 = check(eRes, { 'enc 200': (r) => r.status === 200 });
  if (!ok3) errorRate.add(1);

  dbLatency.add(Date.now() - t0);

  sleep(0.05); // Rapid cycling to stress event loop and pool
}
