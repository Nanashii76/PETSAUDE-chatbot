
# Execução

## Requisitos

- Node.js + npm
- Acesso a um workflow do n8n publicado/ativo (Webhook)

## Variáveis de ambiente (frontend)

O frontend usa a variável:

- `VITE_N8N_WEBHOOK_URL`

Ela deve apontar para a URL do webhook do n8n (produção ou teste), por exemplo:

```
VITE_N8N_WEBHOOK_URL=https://seu-dominio/webhook/<id>
```

## Rodar localmente

Na raiz do projeto:

```bash
npm install
npm run dev
```

Depois acesse a URL exibida pelo Vite.

## Contrato de API (frontend → n8n)

O frontend envia um `POST` com `Content-Type: application/json`.

Body:

```json
{
	"so": "Linux",
	"user": "user_abc123",
	"content": "texto da mensagem",
	"timestamp": "2026-03-24T20:06:14.460Z"
}
```

No n8n, isso chega como `$json.body.*` (ex.: `$json.body.content`).

## Contrato de API (n8n → frontend)

O workflow responde com JSON:

```json
{ "output": "texto da resposta" }
```

O frontend renderiza esse texto com suporte a Markdown.

## Teste rápido sem frontend (curl)

```bash
curl -X POST "$VITE_N8N_WEBHOOK_URL" \
	-H 'Content-Type: application/json' \
	-d '{"so":"Linux","user":"user_teste","content":"Olá","timestamp":"2026-03-25T00:00:00.000Z"}'
```

