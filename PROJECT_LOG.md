# PROJECT LOG\n
---

## DATA: 16/09/2026 — Abertura Imediata de Conversa do Lead ao Assumir no CRM (v2.4.6)

### Antigravity
- ✅ Concluído:
  - [x] **Eliminação de Concorrência no Inbox (`useInboxStore.ts`)**:
    - Corrigida a condição de corrida em `fetchConversations()` e background polling (`syncConversations()`) que sobrescrevia a conversa ativa com `conversations[0]` ou limpava para `null` quando o eleitor selecionado ainda não estava na listagem inicial.
    - Conversas abertas pelo CRM são agora fixadas e preservadas no topo da lista sem perda de seleção.
  - [x] **Seleção Prioritária Instantânea (`apps/web/src/app/inbox/page.tsx`)**:
    - Ao acessar o Inbox com parâmetros na URL (`conversationId` ou `phone`) ou via `sessionStorage`, a interface carrega e seleciona imediatamente o lead alvo antes de qualquer listagem genérica.
  - [x] **Navegação Confiável do Kanban (`PesquisaSenadoKanban.tsx`)**:
    - O botão "Ver conversa / Assumir" prepara os dados do lead no servidor (`/api/conversations/ensure`), salva no `sessionStorage` e redireciona via router Next.js com fallback robusto.
  - [x] **Encoding Seguro de URLs (`conversationService.ts`)**:
    - Aplicação de `encodeURIComponent` para identificadores com `@` (ex: `5567996789006@s.whatsapp.net`), garantindo compatibilidade total com o roteador dinâmico do Next.js.
  - [x] **Reconstrução Dinâmica de Mensagens (`/api/conversations/[id]/messages/route.ts`)**:
    - Fallback resiliente para recompor todo o diálogo de pesquisa sob demanda caso executado em workers serverless sem estado prévio em memória.
- 🎯 Próxima ação:
  - [ ] Acompanhar atendimentos iniciados pelo CRM e validação em tempo real.

---

## DATA: 16/09/2026 — Saudação Limpa Sem Nome Genérico "Eleitor" na Msg 1 (v2.4.7)

### Antigravity
- ✅ Concluído:
  - [x] **Supressão da Palavra "Eleitor" na Saudação Inicial (`pesquisaSenado.ts`)**:
    - Ajustada a função `extrairPrimeiroNome` para desconsiderar placeholders genéricos ("Eleitor", "Eleitor 1234", "Contato", "WhatsApp" ou números de telefone).
    - Quando o lead **não possui nome**, a saudação gerada é limpa e natural:
      `Olá, boa noite\ntudo bem?` (ou `Olá, bom dia` / `Olá, boa tarde`).
    - Quando o lead **possui nome cadastrado** (ex: Mariana), a saudação permanece personalizada:
      `Olá Mariana, boa noite\ntudo bem?`.
  - [x] **Ajuste na Fila e Store (`conversationStore.ts`, `pesquisaSenadoDisparador.ts`, `PesquisaSenadoKanban.tsx`)**:
    - Removido o fallback que preenchia "Eleitor" no nome de contatos importados sem coluna de nome na planilha Excel.
    - Sincronizado o histórico do Inbox para exibir a saudação sem o termo genérico.
- 🎯 Próxima ação:
  - [ ] Acompanhar disparos para contatos sem nome em produção.
