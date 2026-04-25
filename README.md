# GestorAI

GestorAI e um assistente virtual de produtividade com interface web (Next.js), persistencia via Prisma/PostgreSQL (Supabase) e automacao conversacional com Groq + Telegram.

- Deploy: https://gestor-ai.vercel.app
- Bot Telegram: https://t.me/GestoAI_Bot

## Stack e arquitetura

- Frontend: Next.js App Router (`src/app/(web)/*`)
- Backend API: Route Handlers (`src/app/(api)/api/*`)
- ORM: Prisma (`prisma/schema.prisma`)
- Banco: PostgreSQL (Supabase)
- IA: Groq (`src/app/(api)/api/chat/route.js` e triagem no webhook Telegram)
- Autenticacao: JWT em cookie HttpOnly + validacao de assinatura no servidor

## Variaveis de ambiente

Copie `env.exemple` para `.env` e preencha:

```bash
cp env.exemple .env
```

```env
# Banco PostgreSQL
DATABASE_URL="postgresql://<usuario>@<pooler_url>:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://<usuario>:<senha>@<db_host>:5432/postgres"

# Seguranca
JWT_SECRET="chave_jwt_longa_e_aleatoria"
LOG_RETENTION_DAYS="15"

# Integracoes
GROQ_API_KEY="chave_groq"
TELEGRAM_BOT_TOKEN="token_bot_telegram"
TELEGRAM_WEBHOOK_SECRET="segredo_opcional_webhook"
```

## Como rodar localmente

1. Instale dependencias:

```bash
npm install
```

2. Execute as migracoes do banco:

```bash
npx prisma migrate deploy
```

3. Rode em desenvolvimento:

```bash
npm run dev
```

4. Abra no navegador:

```text
http://localhost:3000
```

## Configuracao do webhook Telegram

Configure o webhook para sua URL publica (Vercel, por exemplo):

```bash
curl -F "url=https://gestor-ai.vercel.app/api/telegram-webhook" \
  -F "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook"
```

## Controles OWASP aplicados

Os seguintes controles de seguranca foram aplicados no projeto:

- A01 Broken Access Control:
rotas web e API protegidas por middleware + validacao de token em backend.
- A02 Cryptographic Failures:
JWT assinado com `JWT_SECRET`; cookies de sessao com `HttpOnly`, `Secure` (producao) e `SameSite=Strict`.
- A03 Injection:
Prisma ORM para acesso ao banco; validacao e normalizacao de entradas CSV com Zod.
- A05 Security Misconfiguration:
segredo opcional para webhook Telegram (`x-telegram-bot-api-secret-token`).
- A09 Security Logging and Monitoring Failures:
`systemLog` centralizado com redacao de campos sensiveis e retencao configuravel.

## Padroes do projeto

- APIs retornam erros genericos para clientes externos e registram detalhes saneados internamente.
- Mensagens do Telegram usam vinculo persistente por `telegram_id` unico.
- Fluxo de handover usa status da conversa (`active`, `handover_pending`, `handover_in_progress`) e modo operacional (`Automatizado`/`Manual`).
