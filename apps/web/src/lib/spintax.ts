// Spintax puro (sem dependências de servidor) — seguro no bundle do cliente.
// Resolve `{a|b|c}` escolhendo variantes; com `seed`, a escolha é determinística
// (mesmo lead → mesma redação, estável em retry).

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function spin(template: string, seed?: string): string {
  const rand = seed ? seededRandom(seed) : Math.random;
  let out = template;
  let guard = 0;
  const re = /\{([^{}]*)\}/;
  while (re.test(out) && guard < 100) {
    out = out.replace(re, (_m, group: string) => {
      const opts = group.split('|');
      return opts[Math.floor(rand() * opts.length)];
    });
    guard++;
  }
  return out;
}

const OPT_OUT = ['parar', 'pare', 'sair', 'cancelar', 'remover', 'descadastrar', 'stop', 'nao quero', 'não quero'];
export function isOptOut(text: string): boolean {
  const t = (text || '').toLowerCase().trim();
  if (!t) return false;
  return OPT_OUT.some((k) => t === k || t.startsWith(k + ' ') || t === k + '.');
}
