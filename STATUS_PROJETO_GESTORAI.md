# Status do Projeto GestorAI

Data da análise: 14/04/2026

## 1. Resumo executivo

O projeto já possui uma base funcional relevante:

- Autenticação (cadastro/login com JWT).
- Interface web com páginas de login, cadastro e dashboard.
- Chat com LLM (Groq), com histórico de conversas e mensagens persistido no banco.
- Integração com Telegram via webhook.
- Importação e exportação de tarefas via CSV.
- Modelagem Prisma com entidades principais (`User`, `Task`, `Conversation`, `ChatMessage`).

Ao mesmo tempo, existem inconsistências e pendências que precisam ser tratadas antes de escalar novas features. O ponto principal é: há funcionalidade implementada, mas com dívida técnica de rotas, segurança, documentação e robustez.

---

## 2. O que está implementado hoje

### 2.1 Backend/API

- Registro de usuário em `src/app/(api)/api/auth/register/route.js`.
- Login em `src/app/(api)/api/auth/login/route.js` com geração de JWT.
- Criação de tarefa via endpoint em `src/app/(api)/api/token/route.js` (nome da rota não está semântico).
- Histórico de conversas (GET/POST) em `src/app/(api)/api/conversations/route.js`.
- Chat com IA em `src/app/(api)/api/chat/route.js`.
- Busca de mensagens por conversa em `src/app/(api)/api/chat/[conversationId]/route.js`.
- Exportação CSV em `src/app/(api)/api/export-tasks/route.js`.
- Importação CSV em `src/app/(api)/api/import-tasks/route.js`.
- Webhook Telegram em `src/app/(api)/api/telegram-webhook/route.js`.

### 2.2 Frontend/Web

- Tela de login em `src/app/(web)/login/page.jsx`.
- Tela de cadastro em `src/app/(web)/cadastro/page.jsx`.
- Dashboard com chat, histórico e ações de import/export em `src/app/(web)/dashboard/page.jsx`.

### 2.3 Infra/modelagem

- Prisma configurado para PostgreSQL + `DIRECT_URL` no `prisma/schema.prisma`.
- Migrações criadas para as entidades centrais em `prisma/migrations/`.
- Middleware de proteção de rotas em `src/middleware.js`.

---

## 3. Pendências e problemas identificados

## P0 (corrigir primeiro)

- Rota inicial quebrada: `src/app/page.js` redireciona para `/auth/login`, mas a rota existente é `/login`.
- Dashboard também usa `/auth/login` em redirecionamentos (`src/app/(web)/dashboard/page.jsx`), inconsistindo com o restante do app.
- Endpoint de tarefas com nome incorreto: `src/app/(api)/api/token/route.js` implementa criação de tarefa, mas o caminho sugere token/autenticação.

## P1 (alta prioridade)

- Segurança de autenticação no cliente:
- Token é salvo em cookie via JS (`document.cookie`), sem `HttpOnly` e sem `Secure`, aumentando risco em cenário de XSS.
- API e middleware usam estratégias distintas (cookie no middleware, Bearer token nos endpoints), exigindo padronização.

- Logs de debug em produção:
- Existem `console.log` de debug em rotas críticas de chat/telegram (`src/app/(api)/api/chat/route.js`, `src/app/(api)/api/telegram-webhook/route.js`).

- Integração Telegram pode falhar por autorização interna:
- O webhook cria token interno com id fixo (`external-telegram-user-id`) e chama `/api/chat`, mas o userId usado no chat depende do token e não do usuário telegram recém-criado.
- Isso pode causar inconsistência de ownership das conversas/mensagens e falhas futuras de autorização/histórico.

- README e `env.exemple` desalinhados:
- README menciona fluxo Supabase/Postgres.
- `env.exemple` ainda está em formato de SQLite e não inclui claramente `DIRECT_URL`/`TELEGRAM_BOT_TOKEN` como no README.

## P2 (média prioridade)

- Layout/metadata ainda de template:
- `src/app/layout.js` mantém metadata padrão de "Create Next App".

- CSS global inconsistente:
- `globals.css` define variáveis e fontes, mas o `body` sobrescreve com `Arial`, anulando a proposta de tipografia base.

- Dashboard com pequenos anti-patterns:
- Uso de `<img>` direto para ícone (`/out.svg`) em vez de `next/image`.
- Chave de lista por índice no histórico (`key={index}`), melhor usar `conv.id`.
- Uso de `onKeyPress` (padrão antigo; preferível `onKeyDown`).

- Endpoint de importação CSV espera campos `title` e `isCompleted` enquanto o export usa cabeçalhos em português (`Título da Tarefa`, `Concluída`), podendo quebrar round-trip import/export sem transformação.

## P3 (baixa prioridade)

- Comentários antigos e rótulos inconsistentes no código (ex.: caminhos nos cabeçalhos de comentário não refletem diretórios reais).
- Nomenclatura do `package.json` ainda genérica (`my-app`).

---

## 4. Riscos para novas implementações

- Adicionar novas features sem corrigir rotas e autenticação tende a aumentar bugs de navegação e sessão.
- Sem padronizar auth, novas APIs podem repetir lógica de verificação e ampliar dívida técnica.
- A integração Telegram precisa de revisão antes de adicionar comandos avançados (tarefas por bot, automações, etc.).
- A falta de documentação técnica atualizada torna onboarding e manutenção mais lentos.

---

## 5. Plano recomendado de evolução

### Fase 1: Estabilização (rápida)

- Corrigir todos os redirecionamentos `/auth/login` para `/login`.
- Renomear/reorganizar endpoint de tarefas (`/api/token` -> `/api/tasks`).
- Remover logs de debug sensíveis.
- Ajustar metadata e branding base.

### Fase 2: Segurança e consistência

- Padronizar autenticação:
- Preferencial: cookie `HttpOnly` emitido no backend de login + leitura unificada no middleware e APIs.
- Alternativa: Bearer token em todo fluxo, removendo dependência de cookie para auth real.

- Criar utilitário único para verificar JWT (evitar repetição da função `verificarToken` em múltiplas rotas).

### Fase 3: Qualidade de domínio (tarefas/chat)

- Implementar CRUD completo de tarefas (listar, atualizar, excluir) com paginação.
- Ajustar import/export CSV para round-trip compatível (mesmos nomes de colunas ou mapeamento explícito).
- Revisar vínculo usuário/conversa no fluxo Telegram para consistência com autorização.

### Fase 4: Produto e manutenção

- Revisar README (setup real, variáveis reais, fluxos de deploy/teste).
- Criar documentação de arquitetura e APIs.
- Adicionar testes automatizados mínimos:
- API: auth, chat, conversations, import/export.
- UI: smoke test de login e fluxo de chat.

---

## 6. Checklist rápido de pendências

- [ ] Corrigir rotas `/auth/login` para `/login`.
- [ ] Renomear `/api/token` para endpoint semântico de tarefas.
- [ ] Padronizar estratégia de autenticação (cookie HttpOnly ou Bearer-only).
- [ ] Remover logs de debug sensíveis.
- [ ] Revisar fluxo Telegram para vincular corretamente usuário/conversa/token.
- [ ] Harmonizar `README.md` e `env.exemple`.
- [ ] Atualizar metadata/branding global.
- [ ] Ajustar inconsistências de import/export CSV.
- [ ] Definir testes mínimos automatizados.

---

## 7. Estado geral final

Classificação atual do projeto: **MVP funcional com dívida técnica moderada/alta**.

- Funciona para demonstração e uso controlado.
- Ainda não está pronto para evolução acelerada sem antes estabilizar autenticação, rotas e documentação.
- Com a Fase 1 + Fase 2 concluídas, o projeto fica em bom ponto para implementar novas features com segurança.
