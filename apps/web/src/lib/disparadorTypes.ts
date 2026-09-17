// Tipos compartilhados do motor de disparo em lote da Pesquisa.
// O disparo roda no SERVIDOR: fila persistente (dispatch_queue) consumida pelo
// cron /api/pesquisa/senado/tick. A aba só enfileira e espelha o progresso.
// Módulo puro (sem lógica de servidor) para o componente e as rotas reusarem.

export interface ItemFilaDisparo {
  id: string;
  name: string;
  phone: string;
  bairro?: string;
  status: 'pendente' | 'enviado' | 'erro';
  enviadoEm?: string;
  erroMsg?: string;
}

export interface EstadoDisparador {
  ativo: boolean;
  pausado: boolean;
  total: number;
  enviados: number;
  erros: number;
  /** Pendentes que ja falharam ao menos uma vez e seguem em retentativa. */
  emRetentativa?: number;
  segundosRestantesProximo: number;
  contatoAtual?: { name: string; phone: string };
  fila: ItemFilaDisparo[];
}
