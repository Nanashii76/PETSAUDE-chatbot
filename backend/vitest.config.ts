import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Sem isso, depois de um "npm run build" os .test.js compilados em dist/ são descobertos junto
    // com os .test.ts de src/ e cada teste roda em dobro (dist/ não é commitado — só aparece depois
    // de um build local ou de CI, como o novo workflow backend-ci.yml faz antes de rodar os testes).
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/integration/**'],
  },
});
