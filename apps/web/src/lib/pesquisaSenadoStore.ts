import { RespostaEleitor, EtapaPesquisa, CANDIDATOS_SENADO_MS } from './pesquisaSenado';

declare global {
  // eslint-disable-next-line no-var
  var __aiviq_pesquisa_senado: RespostaEleitor[] | undefined;
}

const SEED_RESPOSTAS: RespostaEleitor[] = [
  {
    id: 'ps-001',
    phone: '5567991234001',
    name: 'Marcos Vinicius Rezende',
    bairro: 'Jardim dos Estados, Campo Grande',
    etapa: 'concluido',
    voto1Id: 5,
    voto1Nome: 'Reinaldo Azambuja',
    voto2Id: 2,
    voto2Nome: 'Capitão Contar',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 23).toISOString(),
  },
  {
    id: 'ps-002',
    phone: '5567992345002',
    name: 'Luciana M. Albuquerque',
    bairro: 'Chácara Cachoeira, Campo Grande',
    etapa: 'concluido',
    voto1Id: 7,
    voto1Nome: 'Soraya Thronicke',
    voto2Id: 1,
    voto2Nome: 'Beto do Movimento',
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 17).toISOString(),
  },
  {
    id: 'ps-003',
    phone: '5567993456003',
    name: 'Carlos Eduardo Fontes',
    bairro: 'Centro, Dourados',
    etapa: 'concluido',
    voto1Id: 2,
    voto1Nome: 'Capitão Contar',
    voto2Id: 5,
    voto2Nome: 'Reinaldo Azambuja',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 11).toISOString(),
  },
  {
    id: 'ps-004',
    phone: '5567994567004',
    name: 'Ana Paula Siqueira',
    bairro: 'Vila Santo André, Três Lagoas',
    etapa: 'concluido',
    voto1Id: 10,
    voto1Nome: 'Vander Loubet',
    voto2Id: 3,
    voto2Nome: 'Daniel Junior',
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 7).toISOString(),
  },
  {
    id: 'ps-005',
    phone: '5567995678005',
    name: 'Roberto Antunes Dias',
    bairro: 'Universitário, Corumbá',
    etapa: 'concluido',
    voto1Id: 5,
    voto1Nome: 'Reinaldo Azambuja',
    voto2Id: 7,
    voto2Nome: 'Soraya Thronicke',
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'ps-006',
    phone: '5567996789006',
    name: 'Mariana Duarte Prado',
    bairro: 'Taveirópolis, Campo Grande',
    etapa: 'aguardando_voto2',
    voto1Id: 6,
    voto1Nome: 'Roberto Oshiro',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: 'ps-007',
    phone: '5567997890007',
    name: 'Fernando Guimarães',
    bairro: 'Vila Alba, Ponta Porã',
    etapa: 'aguardando_voto1',
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'ps-008',
    phone: '5567998901008',
    name: 'Juliana Castro Bueno',
    bairro: 'Tiradentes, Campo Grande',
    etapa: 'disparado',
    createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 1).toISOString(),
  },
  {
    id: 'ps-009',
    phone: '5567999012009',
    name: 'Thiago Mendes Ramos',
    bairro: 'Guanandi, Campo Grande',
    etapa: 'concluido',
    voto1Id: 11,
    voto1Nome: 'Branco/nulo',
    voto2Id: 11,
    voto2Nome: 'Branco/nulo',
    createdAt: new Date(Date.now() - 3600000 * 15).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 14).toISOString(),
  },
  {
    id: 'ps-010',
    phone: '5567990123010',
    name: 'Beatriz Vasconcelos',
    bairro: 'Parque Alvorada, Dourados',
    etapa: 'concluido',
    voto1Id: 2,
    voto1Nome: 'Capitão Contar',
    voto2Id: 8,
    voto2Nome: 'Valderi Garcia',
    createdAt: new Date(Date.now() - 3600000 * 10).toISOString(),
    lastMessageAt: new Date(Date.now() - 3600000 * 9).toISOString(),
  },
];

if (!global.__aiviq_pesquisa_senado) {
  global.__aiviq_pesquisa_senado = [...SEED_RESPOSTAS];
}

export function getPesquisaSessions(): RespostaEleitor[] {
  return global.__aiviq_pesquisa_senado || [];
}

export function getPesquisaSessionByPhone(phone: string): RespostaEleitor | undefined {
  const clean = phone.replace(/\D/g, '');
  return (global.__aiviq_pesquisa_senado || []).find((s) => {
    const sClean = s.phone.replace(/\D/g, '');
    return sClean === clean || sClean.endsWith(clean) || clean.endsWith(sClean);
  });
}

export function savePesquisaSession(session: RespostaEleitor): RespostaEleitor {
  if (!global.__aiviq_pesquisa_senado) {
    global.__aiviq_pesquisa_senado = [];
  }
  const idx = global.__aiviq_pesquisa_senado.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    global.__aiviq_pesquisa_senado[idx] = { ...session, lastMessageAt: new Date().toISOString() };
    return global.__aiviq_pesquisa_senado[idx];
  } else {
    const created = {
      ...session,
      createdAt: session.createdAt || new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    };
    global.__aiviq_pesquisa_senado.unshift(created);
    return created;
  }
}

export function createOrUpdateSessionByPhone(
  phone: string,
  name: string,
  updates: Partial<RespostaEleitor>
): RespostaEleitor {
  let session = getPesquisaSessionByPhone(phone);
  if (!session) {
    session = {
      id: `ps-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      phone,
      name,
      etapa: 'disparado',
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      ...updates,
    };
  } else {
    session = {
      ...session,
      ...updates,
      name: name || session.name,
      lastMessageAt: new Date().toISOString(),
    };
  }
  return savePesquisaSession(session);
}

export interface PesquisaStats {
  totalEleitores: number;
  totalConcluidos: number;
  taxaConclusao: string;
  porEtapa: Record<EtapaPesquisa, number>;
  rankingVoto1: Array<{ id: number; nome: string; rotulo: string; votos: number; percentual: string }>;
  rankingVoto2: Array<{ id: number; nome: string; rotulo: string; votos: number; percentual: string }>;
  rankingGeral: Array<{ id: number; nome: string; rotulo: string; votos1: number; votos2: number; totalVotos: number; percentual: string }>;
}

export function getPesquisaStats(): PesquisaStats {
  const sessions = getPesquisaSessions();
  const totalEleitores = sessions.length;
  const concluidos = sessions.filter((s) => s.etapa === 'concluido');
  const totalConcluidos = concluidos.length;
  const taxaConclusao =
    totalEleitores > 0 ? `${((totalConcluidos / totalEleitores) * 100).toFixed(1)}%` : '0%';

  const porEtapa: Record<EtapaPesquisa, number> = {
    disparado: 0,
    aguardando_voto1: 0,
    aguardando_voto2: 0,
    concluido: 0,
    recusado: 0,
  };

  sessions.forEach((s) => {
    porEtapa[s.etapa] = (porEtapa[s.etapa] || 0) + 1;
  });

  // Mapas de votos
  const mapVoto1: Record<number, number> = {};
  const mapVoto2: Record<number, number> = {};

  concluidos.forEach((s) => {
    if (s.voto1Id) {
      mapVoto1[s.voto1Id] = (mapVoto1[s.voto1Id] || 0) + 1;
    }
    if (s.voto2Id) {
      mapVoto2[s.voto2Id] = (mapVoto2[s.voto2Id] || 0) + 1;
    }
  });

  const rankingVoto1 = CANDIDATOS_SENADO_MS.map((c) => {
    const votos = mapVoto1[c.id] || 0;
    const percentual = totalConcluidos > 0 ? `${((votos / totalConcluidos) * 100).toFixed(1)}%` : '0.0%';
    return { id: c.id, nome: c.nome, rotulo: c.rotulo, votos, percentual };
  }).sort((a, b) => b.votos - a.votos);

  const rankingVoto2 = CANDIDATOS_SENADO_MS.map((c) => {
    const votos = mapVoto2[c.id] || 0;
    const percentual = totalConcluidos > 0 ? `${((votos / totalConcluidos) * 100).toFixed(1)}%` : '0.0%';
    return { id: c.id, nome: c.nome, rotulo: c.rotulo, votos, percentual };
  }).sort((a, b) => b.votos - a.votos);

  const totalVotosCombinados = totalConcluidos * 2;
  const rankingGeral = CANDIDATOS_SENADO_MS.map((c) => {
    const votos1 = mapVoto1[c.id] || 0;
    const votos2 = mapVoto2[c.id] || 0;
    const totalVotos = votos1 + votos2;
    const percentual =
      totalVotosCombinados > 0
        ? `${((totalVotos / totalVotosCombinados) * 100).toFixed(1)}%`
        : '0.0%';
    return { id: c.id, nome: c.nome, rotulo: c.rotulo, votos1, votos2, totalVotos, percentual };
  }).sort((a, b) => b.totalVotos - a.totalVotos);

  return {
    totalEleitores,
    totalConcluidos,
    taxaConclusao,
    porEtapa,
    rankingVoto1,
    rankingVoto2,
    rankingGeral,
  };
}
