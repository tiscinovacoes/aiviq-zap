# Arquitetura reutilizável: disparo em massa no WhatsApp (multi-instância, anti-ban)

> Este documento descreve padrões de arquitetura desenvolvidos neste projeto
> (AIVIQ-ZAP) para disparo em massa de mensagens no WhatsApp via Evolution
> API, pensados para serem **portáveis para outros projetos** que precisem
> da mesma coisa: mandar volume alto de mensagens por vários números sem
> levar ban. Não é código pronto pra copiar e colar — é o desenho das
> peças e por que cada uma existe, pra reconstruir mais rápido da próxima
> vez.

## 1. O problema de fundo

WhatsApp bane números que enviam mensagens de forma que pareça automatizada
ou de spam: rajadas, intervalo sempre idêntico, volume alto num número
recém-criado, todos os números saindo pelo mesmo IP, taxa alta de
"não existe"/"recusado". A arquitetura inteira gira em torno de imitar
comportamento humano plausível enquanto ainda processa volume real.

## 2. Peças da arquitetura

### 2.1 Pool de instâncias (chips) com revezamento

- Cada número de WhatsApp = uma "instância" no serviço de envio (aqui,
  Evolution API/Baileys). Todas ficam registradas com um `instanceName`.
- Uma tabela de controle por instância (`dispatch_instance_control` aqui)
  guarda: maturidade (`novo`/`maduro`, controla o teto do dia), contadores
  de falha, `cooldown_ate`/`cooldown_motivo`, se participa do pool
  (`dispatch_enabled`).
- A fila de disparo divide os contatos entre as instâncias do pool
  (round-robin na hora da importação, carimbando `assigned_instance` por
  contato) — **nunca** deixa dois chips diferentes disputarem o mesmo
  contato ao mesmo tempo.
- **Armadilha comum**: quando um chip novo entra no pool com a fila já
  carimbada nos chips antigos, ele não recebe nada até alguém liberar
  `assigned_instance = NULL` dos pendentes. Vale a pena já nascer com essa
  rotina de "redistribuir fila" em vez de descobrir isso em produção.

### 2.2 Intervalo fixo por chip + escalonamento entre chips

- Intervalo entre dois envios do MESMO chip = janela útil do dia (ex:
  8h–21h) dividida pelo teto diário daquele chip. Isso espalha os envios
  ao longo do dia inteiro em vez de rajada seguida de silêncio.
- Chips diferentes NUNCA disparam no mesmo instante — um pequeno
  espaçamento fixo entre chips (ex: 60s) evita que o servidor receba N
  disparos simultâneos que, vistos de fora, parecem operação em massa.
- Chip em warm-up (número novo) recebe teto menor no início e cresce dia a
  dia; chip "maduro" usa o teto de regime completo.

### 2.3 Dois tipos de falha, dois circuit breakers diferentes

Isso foi a lição mais cara deste projeto — vale muito replicar a
distinção:

1. **Falha ao ENVIAR** (erro/timeout na chamada de API de envio). Conta em
   `falhas_seguidas`; N falhas seguidas → cooldown curto (chip continua no
   pool, só espera).
2. **Falha ao ENTREGAR**, reportada de forma assíncrona pelo próprio
   WhatsApp via webhook de ACK (`status: ERROR`). Isso é o WhatsApp
   recusando ativamente — sinal bem mais sério de possível restrição no
   número. N recusas de entrega seguidas → **tira o chip do pool
   inteiramente** (`dispatch_enabled = false`), não só cooldown, por mais
   tempo.
- **Número que simplesmente não existe no WhatsApp** (`exists:false`) não
  deve contar para NENHUM dos dois contadores — não é falha do chip, é
  dado ruim na lista.
- **Armadilha comum**: uma função "liberar cooldown" manual que só limpa
  `cooldown_ate` mas esquece de religar `dispatch_enabled` deixa o chip
  "invisível" — sem erro na tela, só nunca mais recebe contato. Testar
  explicitamente esse caminho.
- **Armadilha de UI**: rotular os dois tipos de cooldown com o mesmo badge
  genérico esconde a gravidade real (recusa de entrega é bem mais sério
  que erro de envio). Rotule cada motivo (`cooldown_motivo`) com o texto
  certo.

### 2.4 IP dedicado por instância (proxy)

- Sem proxy, TODAS as instâncias saem pelo mesmo IP do servidor —
  um número "quente" recém-conectado herda a reputação (ruim) de todos os
  outros. Cada instância deve ter seu próprio proxy dedicado configurado
  na API de envio.
- **Regra de ouro**: proxy **fixo/estático** (mesmo IP sempre), nunca
  rotativo — um número trocando de "localização" de rede a cada mensagem
  é, sozinho, um padrão de risco. E nunca reaproveitar a mesma
  porta/proxy em duas instâncias diferentes (isso reintroduz o mesmo
  problema do IP compartilhado).

### 2.5 Filas separadas por importação ("lotes")

- Cada importação de lista (planilha) vira um **lote** próprio
  (`id`, `nome`, `status`), e cada contato na fila carrega o `lote_id` de
  onde veio.
- Cancelar um lote cancela só os pendentes DAQUELE lote — outras filas em
  andamento continuam intocadas. Sem isso, um "Parar" genérico cancela
  literalmente tudo que está pendente, mesmo leads de uma campanha sem
  nada a ver.

### 2.6 Fechamento diário de campanha (cron)

- No fim da janela útil do dia, um job agendado:
  1. Calcula métricas reais do dia (enviados, responderam, falharam) —
     nunca número fabricado.
  2. Cria/fecha o registro da campanha do dia (status `completed`) numa
     tabela de campanhas, pra dar pra comparar dia a dia.
  3. Cancela o que sobrou pendente em qualquer fila ativa (não carrega
     para o dia seguinte).
  4. Reseta os marcadores de saúde de todos os chips (falhas, cooldown)
     para começarem o dia seguinte limpos.
  5. **Só faz tudo isso se de fato teve alguma atividade no dia** — não
     cria registro vazio nem mexe em nada em dia parado (fim de semana
     etc.).
- Protegido com o mesmo esquema de auth do cron de disparo (Bearer
  `CRON_SECRET` da hospedagem + fallback pra chamada autenticada/dev).

### 2.7 Segurança de saída (opt-out) e "banco de erros"

- Toda campanha de disparo em massa via WhatsApp precisa de um jeito
  simples de sair ("responda SAIR") — LGPD e também anti-ban na prática
  (quem consegue sair não usa o botão de denunciar/bloquear, que é o que
  realmente derruba um chip).
- Número que já deu erro definitivo (não existe no WhatsApp, rejeitou)
  fica bloqueado pra sempre em reimportações futuras — reinsistir nele é
  puro risco sem ganho.

## 3. Padrões de UI que valeram a pena

- **Legenda dos badges/status**: quando o número de estados cresce
  (conectado/conectando/desconectado, IP próprio/compartilhado, sem
  webhook, resfriando/entrega recusada, aquecido/warm-up...), um botão
  "Legenda" com painel explicativo evita ficar respondendo a mesma
  pergunta toda hora.
- **Seletor de instância com opções desabilitadas** (não escondidas):
  mostrar todos os chips no disparo manual, mas desabilitar os
  desconectados/em cooldown, deixa claro por que uma opção não está
  disponível em vez de simplesmente sumir com ela.
- **Ordenar listas por atividade mais recente**, não por ordem de
  inserção — em qualquer painel operacional (funil, filas), quem mudou de
  estado por último é o que o operador mais precisa ver sem rolar a tela
  inteira.

## 4. Armadilhas de banco que vale evitar desde o início

- **Trigger de `updated_at` incondicional** (`NEW.updated_at := now()` em
  QUALQUER UPDATE): se você faz um UPDATE de manutenção/backfill numa
  coluna não relacionada a "atividade" (ex: preencher um campo histórico),
  esse trigger reescreve o timestamp de última atividade real do registro
  — quebra silenciosamente qualquer ordenação por "mais recente". Ou o
  trigger fica condicional (só dispara se um campo de atividade de fato
  mudou), ou desabilite a trigger manualmente ao redor de UPDATEs de
  manutenção em massa.
- **Coluna que o código tenta usar mas nunca existiu na migration
  aplicada**: o padrão "salva com o campo, se der erro salva sem ele" é
  uma rede de segurança traiçoeira — mascara silenciosamente que uma
  feature inteira (ex: "qual chip atendeu esse contato") nunca funcionou.
  Prefira migration idempotente (`add column if not exists`) aplicada de
  verdade, e deixe o INSERT falhar alto se a coluna não existir.
- **RLS**: toda tabela nova de operação multi-tenant precisa da mesma
  policy "mesma organização" das tabelas irmãs desde a migration que a
  cria — fácil de esquecer numa tabela adicionada depois.

---

*Gerado a partir do trabalho de disparo em massa/anti-ban do AIVIQ-ZAP
(pesquisa eleitoral via WhatsApp). Sinta-se livre para copiar trechos
deste documento ao começar um projeto novo com necessidade parecida.*
