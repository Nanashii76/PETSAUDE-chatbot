import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const audioData = open('./sample_audio.wav', 'b');

export const triageLatency = new Trend('triage_response_time_ms');
export const audioLatency = new Trend('audio_transcribe_time_ms');
export const dashboardLatency = new Trend('dashboard_time_ms');
export const failureRate = new Rate('overall_failures');

export const options = {
  scenarios: {
    sgest_50_professionals_pilot: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '15s', target: 30 },
        { duration: '15s', target: 50 }, // reach full 50 concurrent professionals
        { duration: '45s', target: 50 }, // sustained 50 users test
        { duration: '15s', target: 0 },  // ramp down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    'overall_failures': ['rate<0.10'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const CLINICAL_CASES = [
  'Paciente de 54 anos com dor torácica atípica há 3 semanas, sem irradiação. ECG normal na UBS.',
  'Criança de 6 anos com febre e tosse produtiva há 5 dias, sem sinais de esforço respiratório.',
  'Mulher de 42 anos com nódulo palpável em mama direita, indolor, móvel, medindo aprox 2cm.',
  'Homem de 65 anos com queixa de lombalgia crônica que piora ao esforço físico, sem perda de força.',
  'Paciente com hipertensão de difícil controle em uso de 3 anti-hipertensivos em doses máximas.'
];

export default function () {
  const vuId = __VU;
  const profId = `sgest_medico_${vuId}`;

  // Step 1: Identificação (inicial ou periódica)
  if (__ITER === 0) {
    const identRes = http.post(`${BASE_URL}/api/identificacao`, JSON.stringify({
      identificador: profId,
      nome: `Profissional SUS ${vuId}`,
      unidade_cnes: '0010537'
    }), { headers: { 'Content-Type': 'application/json' } });
    check(identRes, { 'ident status is 200': (r) => r.status === 200 });
  }

  // Behavior distribution based on VU ID to simulate diverse professional roles:
  const role = vuId % 5;

  if (role === 0 || role === 1) {
    // 40% of users: Audio dictation for clinical case entry
    const startAudio = Date.now();
    const audioRes = http.post(`${BASE_URL}/api/transcrever-audio`, {
      audio: http.file(audioData, `audio_relato_${vuId}.wav`, 'audio/wav'),
    }, { timeout: '35s' });

    audioLatency.add(Date.now() - startAudio);
    const audioOk = check(audioRes, {
      'audio ok or handled': (r) => r.status === 200 || r.status === 504 || r.status === 429,
    });
    if (!audioOk || audioRes.status >= 500 && audioRes.status !== 504) failureRate.add(1);

  } else if (role === 2 || role === 3) {
    // 40% of users: Case triage via chatbot message
    const msg = CLINICAL_CASES[vuId % CLINICAL_CASES.length];
    const startTriage = Date.now();
    const triageRes = http.post(`${BASE_URL}/api/webhook`, JSON.stringify({
      remetente_id: profId,
      mensagem: msg
    }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '35s'
    });

    triageLatency.add(Date.now() - startTriage);
    const triageOk = check(triageRes, {
      'triage responded': (r) => r.status === 200 || r.status === 504 || r.status === 429,
    });
    if (!triageOk || triageRes.status >= 500 && triageRes.status !== 504) failureRate.add(1);

  } else {
    // 20% of users: Regulatory physicians & supervisors checking referrals and metrics
    const startDash = Date.now();
    const pRes = http.get(`${BASE_URL}/api/painel?periodo=30d`);
    const eRes = http.get(`${BASE_URL}/api/encaminhamentos?periodo=30d`);
    dashboardLatency.add(Date.now() - startDash);

    const ok = check(pRes, { 'painel 200': (r) => r.status === 200 }) &&
               check(eRes, { 'encaminhamentos 200': (r) => r.status === 200 });
    if (!ok) failureRate.add(1);
  }

  // Realistic think time between clinical actions
  sleep(2 + Math.random() * 2);
}
