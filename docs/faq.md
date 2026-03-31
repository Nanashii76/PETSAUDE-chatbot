
# FAQ

## 1) O chat envia, mas não recebe resposta

Possíveis causas:

- `VITE_N8N_WEBHOOK_URL` apontando para uma URL inválida
- Webhook do n8n desativado/inexistente
- CORS bloqueando a requisição no navegador

Como diagnosticar:

- abrir o DevTools do navegador e verificar a aba Network
- conferir o status HTTP e o body de resposta

## 2) Recebo “Recebido (sem conteúdo no output).”

Isso acontece quando o n8n responde sem a chave `output`.

Verifique no workflow:

- nodes **Respond to Webhook** / **Respond to Webhook1** estão retornando `{"output": ...}`
- o node **Code in JavaScript** está preenchendo `texto_resposta`

## 3) O agente responde, mas o texto fica vazio

O node **Code in JavaScript** mapeia a resposta do agente para `texto_resposta`.

Se o agente estiver retornando outra chave (ex.: `text` em vez de `texto_resposta`), o mapeamento pode deixar `texto_resposta` vazio.

Solução:

- padronizar os prompts para sempre retornar `texto_resposta`, ou
- ajustar o mapeamento no node **Code in JavaScript**.

## 4) O roteador não direciona corretamente

O **Switch** compara o output do roteador com strings específicas.

Se o roteador retornar variações (maiúsculas, acentos, sem aspas), o Switch pode não casar.

Solução:

- ajustar o prompt do roteador para retornar exatamente uma das opções esperadas;
- ajustar as regras do Switch para o formato real do output.

## 5) Como “resetar” uma conversa

O identificador de sessão é armazenado no navegador.

Opções:

- limpar o `localStorage` do site (chave `chat_user_id`), ou
- abrir em janela anônima (gera novo `user`).

## 6) Como testar o webhook sem o frontend

Use `curl` conforme descrito em `docs/execucao.md`.

