# Poli 2.0 — Customer Experience Platform

Plataforma unificada de atendimento multicanal com CRM integrado, automação no-code e inteligência artificial.

## Stack Tecnológica
- **Frontend / Fullstack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend / API:** Next.js Route Handlers + Supabase Database / Auth
- **Database:** PostgreSQL (Supabase) com Row Level Security (RLS) multi-tenant
- **Realtime:** Supabase Realtime & Webhooks
- **Prototipagem:** Stitch (Designs & UI Flows)

## Estrutura do Monorepo
```
poli-app/
├── apps/
│   └── web/            # Aplicação web principal (Next.js)
├── packages/           # Pacotes compartilhados (ui, config, types)
├── docs/               # Documentação técnica e ADRs
│   ├── adr/            # Architecture Decision Records
│   └── designs/        # Especificações de design e wireframes
├── db/                 # Banco de dados e migrations
│   └── migrations/     # Migrações SQL versionadas
└── scripts/            # Scripts de automação e setup
```

## Como Iniciar
```bash
# Entrar na aplicação web
cd apps/web

# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev
```

## Documentação
- [Especificação Funcional e Arquitetural](../../ESPECIFICACAO.md)
- [Plano de Ação Claude](../../CLAUDE_ACTION_PLAN.md)
- [Plano de Ação Antigravity](../../ANTIGRAVITY_ACTION_PLAN.md)
- [Log de Projeto](../../PROJECT_LOG.md)
