import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const audioData = open('./sample_audio.wav', 'b');

export const errorRate = new Rate('audio_errors');
export const audioUploadTrend = new Trend('audio_upload_duration_ms');

export const options = {
  scenarios: {
    audio_upload_concurrency: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 },
        { duration: '15s', target: 50 }, // 50 simultaneous voice uploads
        { duration: '30s', target: 50 }, // hold steady 50 uploads
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    'audio_errors': ['rate<0.15'], // allow for external API rate-limit detection
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const vuId = __VU;

  const data = {
    audio: http.file(audioData, `gravacao_prof_${vuId}.wav`, 'audio/wav'),
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/transcrever-audio`, data, {
    timeout: '30s',
  });
  const duration = Date.now() - start;
  audioUploadTrend.add(duration);

  const success = check(res, {
    'audio status is 200 or 504': (r) => r.status === 200 || r.status === 504,
    'audio returned json': (r) => {
      try {
        const j = JSON.parse(r.body);
        return j !== null;
      } catch (e) {
        return false;
      }
    },
  });

  if (!success || res.status >= 500) {
    errorRate.add(1);
  }

  sleep(2);
}
