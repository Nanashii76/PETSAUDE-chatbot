import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

export const errorRate = new Rate('errors');
export const sessionCreationTrend = new Trend('session_creation_ms');
export const dashboardTrend = new Trend('dashboard_ms');
export const encaminhamentosTrend = new Trend('encaminhamentos_ms');

export const options = {
  scenarios: {
    concurrency_50_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 25 },
        { duration: '15s', target: 50 }, // reach 50 simultaneous users
        { duration: '30s', target: 50 }, // hold 50 simultaneous users
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<1500'], // 95% of requests should be below 1.5s
    'errors': ['rate<0.05'],            // error rate < 5%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const vuId = __VU;
  const iter = __ITER;
  const profId = `prof_sgest_${vuId}`;

  // 1. Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health status is 200': (r) => r.status === 200 });

  // 2. Identificação do Profissional
  const identPayload = JSON.stringify({
    identificador: profId,
    nome: `Dra. Profissional ${vuId}`,
    unidade_cnes: '0010537', // UBS 1 Asa Sul
  });

  const identRes = http.post(`${BASE_URL}/api/identificacao`, identPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  const identSuccess = check(identRes, {
    'identificacao status 200': (r) => r.status === 200,
  });
  if (!identSuccess) errorRate.add(1);

  // 3. Nova Triagem / Sessão
  const sessPayload = JSON.stringify({ remetente_id: profId });
  const startSess = Date.now();
  const sessRes = http.post(`${BASE_URL}/api/sessao/nova`, sessPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  sessionCreationTrend.add(Date.now() - startSess);
  const sessSuccess = check(sessRes, {
    'sessao status 200': (r) => r.status === 200,
  });
  if (!sessSuccess) errorRate.add(1);

  // 4. Consulta ao Painel / Indicadores
  const startPainel = Date.now();
  const painelRes = http.get(`${BASE_URL}/api/painel?periodo=30d`);
  dashboardTrend.add(Date.now() - startPainel);
  const painelSuccess = check(painelRes, {
    'painel status 200': (r) => r.status === 200,
  });
  if (!painelSuccess) errorRate.add(1);

  // 5. Consulta Encaminhamentos Recentes
  const startEnc = Date.now();
  const encRes = http.get(`${BASE_URL}/api/encaminhamentos?periodo=30d`);
  encaminhamentosTrend.add(Date.now() - startEnc);
  const encSuccess = check(encRes, {
    'encaminhamentos status 200': (r) => r.status === 200,
  });
  if (!encSuccess) errorRate.add(1);

  sleep(1);
}
