# 🚀 Guia de Deploy em Staging & Conexão Vercel / GitHub — Poli 2.0

Este guia orienta o provisionamento do repositório remoto no GitHub, conexão do monorepo com a Vercel e homologação com Supabase em ambiente de Staging.

---

## 1. Conectar o Repositório Local ao GitHub

No diretório do projeto (`f:\Projetos\Poli\poli-app`), execute os seguintes comandos no terminal:

```bash
# 1. Crie um novo repositório vazio na sua conta GitHub (ex: https://github.com/SEU-USUARIO/poli-app)
# 2. Adicione o remote 'origin':
git remote add origin https://github.com/SEU-USUARIO/poli-app.git

# 3. Defina a branch principal e envie os commits:
git branch -M master
git push -u origin master
```

---

## 2. Deploy na Vercel (Monorepo)

A Vercel suporta nativamente o deploy do monorepo através do arquivo [`vercel.json`](../vercel.json) ou configurando a pasta raiz do projeto.

### Opção A: Via Vercel Dashboard
1. Acesse [vercel.com](https://vercel.com) e clique em **"Add New... -> Project"**;
2. Importe o repositório GitHub `poli-app`;
3. Na seção **"Root Directory"**, selecione `apps/web` (ou mantenha na raiz caso use as instruções do `vercel.json`);
4. Defina o Framework Preset como **Next.js**;
5. Preencha as Variáveis de Ambiente listadas abaixo e clique em **Deploy**.

### Opção B: Via Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --cwd apps/web
```

---

## 3. Variáveis de Ambiente Obrigatórias para Staging

Configure as seguintes chaves no painel **Settings -> Environment Variables** da Vercel (escopos *Preview* e *Production*):

| Variável | Descrição / Exemplo | Obrigatório? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do seu projeto Supabase (`https://xxxx.supabase.co`) | ✅ Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública `anon` do Supabase | ✅ Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privada `service_role` (para backend seguro) | ✅ Sim |
| `WHATSAPP_CLOUD_API_TOKEN` | Token de acesso de usuário do sistema da Meta | 🟡 Produção |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador do número de telefone no WhatsApp Business | 🟡 Produção |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Token para validação de handshake do Webhook | 🟡 Produção |

---

## 4. Execução de Migrações no Banco de Dados Supabase

No painel do Supabase (**SQL Editor**), execute os arquivos de migração na ordem correta:

1. [`db/migrations/001_initial_schema.sql`](../db/migrations/001_initial_schema.sql)
   - Cria as tabelas base (`organizations`, `profiles`, `inboxes`, `contacts`, `conversations`, `messages`) com RLS inicial.
2. [`db/migrations/002_security_and_membership_hardening.sql`](../db/migrations/002_security_and_membership_hardening.sql)
   - Cria o schema `private`, a função `private.current_account_id()`, as tabelas de membros (`teams`, `team_members`, `inbox_members`), os índices de deduplicação e o isolamento RLS otimizado.

---

## 5. Testes de Homologação em Staging

Após o primeiro build na Vercel:
1. Abra a URL gerada (ex: `https://poli-staging.vercel.app`);
2. Teste a criação de uma organização e login de agente;
3. Inspecione os cookies de sessão (`poli_token`) verificando as flags `httpOnly`, `secure` e `sameSite=lax`;
4. Valide a renderização de todas as telas principais:
   - `/inbox` — Caixa de entrada omnichannel;
   - `/contacts` — Diretório de contatos e atributos;
   - `/crm` — Pipeline de negociações Kanban;
   - `/bots` e `/bots/[id]` — Editor visual e simulador de fluxo;
   - `/campaigns` — Wizard de disparos em massa;
   - `/reports` — Painel executivo com SLAs, CSAT e volumetria.
