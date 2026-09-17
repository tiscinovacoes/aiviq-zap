// Tipos compartilhados do motor de disparo em lote da Pesquisa.
// O disparo em si é dirigido pelo CLIENTE (aba aberta = relógio; serverless não
// sustenta setTimeout/estado global), então estes tipos vivem num módulo puro,
// sem lógica de servidor, para o componente e as rotas os reusarem.

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
  segundosRestantesProximo: number;
  contatoAtual?: { name: string; phone: string };
  fila: ItemFilaDisparo[];
}
