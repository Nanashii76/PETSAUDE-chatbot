import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const audioData = open('./sample_audio.wav', 'b');

export const triageLatency = new Trend('stress_triage_latency_ms');
export const audioLatency = new Trend('stress_audio_latency_ms');
export const dashboardLatency = new Trend('stress_dashboard_latency_ms');
export const dbQueryLatency = new Trend('stress_db_latency_ms');
export const timeoutCount = new Counter('stress_timeouts');
export const rateLimitCount = new Counter('stress_rate_limits');
export const serverErrorCount = new Counter('stress_server_5xx');
export const successRate = new Rate('stress_success_rate');

export const options = {
  scenarios: {
    worst_case_burst: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '10s', target: 25 },
        { duration: '15s', target: 50 },  // 50 simultaneous users (nominal target)
        { duration: '15s', target: 100 }, // 100 simultaneous users (WORST CASE STRESS PEAK - 2x)
        { duration: '30s', target: 100 }, // Hold worst-case stress
        { duration: '10s', target: 0 },   // Cool down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // Collect all data without aborting prematurely so we map the complete failure envelope
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const CLINICAL_CASES = [
  'Paciente 68a masculino com dor retroesternal em aperto iniciada em repouso há 40 minutos, sudorese fria e náuseas.',
  'Criança 4a sexo feminino com estridor laríngeo, tiragem intercostal e febre alta 39.5C iniciada há 6h.',
  'Mulher 35a com cefaleia súbita de forte intensidade ("pior da vida") acompanhada de rigidez de nuca.',
  'Homem 50a diabético com lesão ulcerada profunda em pé direito com secreção purulenta e crepitação aos tecidos.',
  'Gestante 28 semanas com PA 160x110 mmHg, proteinúria de fita +++, queixando-se de escotomas cintilantes.'
];

export default function () {
  const vuId = __VU;
  const iter = __ITER;
  const profId = `stress_prof_${vuId}`;

  // Step 1: Rapid identification on first iteration
  if (iter === 0) {
    const identRes = http.post(`${BASE_URL}/api/identificacao`, JSON.stringify({
      identificador: profId,
      nome: `Médico Stress Test ${vuId}`,
      unidade_cnes: '0010537'
    }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s'
    });
    check(identRes, { 'ident success': (r) => r.status === 200 });
  }

  // Workload mix simulating worst-case surge (shift change / crisis peak)
  const actionSelector = Math.random();

  if (actionSelector < 0.35) {
    // 35% Worst-case Audio Dictation (Heavy multipart upload + memory parsing)
    const t0 = Date.now();
    const res = http.post(`${BASE_URL}/api/transcrever-audio`, {
      audio: http.file(audioData, `stress_rec_${vuId}_${iter}.wav`, 'audio/wav'),
    }, { timeout: '25s' });

    const elapsed = Date.now() - t0;
    audioLatency.add(elapsed);

    if (res.status === 200) {
      successRate.add(1);
    } else if (res.status === 429) {
      rateLimitCount.add(1);
    } else if (res.status === 0 || res.status === 504) {
      timeoutCount.add(1);
    } else {
      serverErrorCount.add(1);
    }

  } else if (actionSelector < 0.65) {
    // 30% Triage webhook (LLM inference + Postgres session locks + messages)
    const msg = CLINICAL_CASES[vuId % CLINICAL_CASES.length];
    const t0 = Date.now();
    const res = http.post(`${BASE_URL}/api/webhook`, JSON.stringify({
      remetente_id: profId,
      mensagem: `${msg} [Req ${iter}]`
    }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '25s'
    });

    const elapsed = Date.now() - t0;
    triageLatency.add(elapsed);

    if (res.status === 200) {
      successRate.add(1);
    } else if (res.status === 429) {
      rateLimitCount.add(1);
    } else if (res.status === 0 || res.status === 504) {
      timeoutCount.add(1);
    } else {
      serverErrorCount.add(1);
    }

  } else {
    // 35% High-throughput DB Queries: Painel + Encaminhamentos + Baseline checks
    const t0 = Date.now();
    const painelRes = http.get(`${BASE_URL}/api/painel?periodo=30d`, { timeout: '10s' });
    const encRes = http.get(`${BASE_URL}/api/encaminhamentos?periodo=30d`, { timeout: '10s' });
    const elapsed = Date.now() - t0;

    dashboardLatency.add(elapsed);
    dbQueryLatency.add(elapsed);

    const ok = (painelRes.status === 200 && encRes.status === 200);
    if (ok) {
      successRate.add(1);
    } else {
      if (painelRes.status >= 500 || encRes.status >= 500) {
        serverErrorCount.add(1);
      } else if (painelRes.status === 0 || encRes.status === 0) {
        timeoutCount.add(1);
      }
    }
  }

  // Minimal think time in worst-case stress: 200ms - 600ms
  sleep(0.2 + Math.random() * 0.4);
}
