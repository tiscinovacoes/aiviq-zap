'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  Smartphone,
  MessageSquare,
  Users,
  Vote,
  BarChart3,
  Send,
  Download,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Phone,
  MapPin,
  HelpCircle,
  XCircle,
  Sparkles,
  FileSpreadsheet,
  UploadCloud,
  Play,
  Pause,
  Square,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  RespostaEleitor,
  CANDIDATOS_SENADO_MS,
  EtapaPesquisa,
} from '@/lib/pesquisaSenado';
import type { PesquisaStats } from '@/lib/pesquisaSenadoStore';
import type { EstadoDisparador, ItemFilaDisparo } from '@/lib/disparadorTypes';

type VisaoModo = 'funil' | 'voto1' | 'voto2' | 'geral';

const etapaLabels: Record<EtapaPesquisa, { label: string; cor: string; bg: string }> = {
  disparado: { label: 'Msg 1: Disparado', cor: 'text-amber-700 border-amber-300', bg: 'bg-amber-50' },
  aguardando_voto1: { label: 'Msg 2/3: Aguardando 1º Voto', cor: 'text-blue-700 border-blue-300', bg: 'bg-blue-50' },
  aguardando_voto2: { label: 'Msg 4: Aguardando 2º Voto', cor: 'text-purple-700 border-purple-300', bg: 'bg-purple-50' },
  concluido: { label: 'Msg 5: Concluído', cor: 'text-emerald-700 border-emerald-300', bg: 'bg-emerald-50' },
  recusado: { label: 'Recusado', cor: 'text-rose-700 border-rose-300', bg: 'bg-rose-50' },
};

export default function PesquisaSenadoKanban() {
  const [sessions, setSessions] = useState<RespostaEleitor[]>([]);
  const [stats, setStats] = useState<PesquisaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [visao, setVisao] = useState<VisaoModo>('funil');

  // Modal de Disparo Único
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novoBairro, setNovoBairro] = useState('Campo Grande - MS');
  const [disparando, setDisparando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Modal e Estado de Importação de Planilha Excel/CSV
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [planilhaContatos, setPlanilhaContatos] = useState<Array<{ name: string; phone: string; bairro?: string }>>([]);
  const [planilhaNomeArquivo, setPlanilhaNomeArquivo] = useState<string>('');
  const [importando, setImportando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado do Motor de Disparos em Lote — agora a fila é PERSISTENTE no servidor
  // e um cron (Vercel) consome via /api/pesquisa/senado/tick. A aba só ENFILEIRA
  // e mostra o progresso (GET /queue); fechar a aba NÃO para mais o disparo.
  const [estadoDisparador, setEstadoDisparador] = useState<EstadoDisparador | null>(null);
  const [falhasList, setFalhasList] = useState<any[]>([]);
  const [porChip, setPorChip] = useState<Array<{ instancia: string; pendentes: number; enviados: number; erros: number }>>([]);
  const [isFalhasModalOpen, setIsFalhasModalOpen] = useState(false);
  const [reenfileirandoFalhas, setReenfileirandoFalhas] = useState(false);

  const router = useRouter();
  const [assumindoTelefone, setAssumindoTelefone] = useState<string | null>(null);

  const handleAssumirConversa = async (eleitor: RespostaEleitor) => {
    const cleanPhone = eleitor.phone.replace(/\D/g, '');
    setAssumindoTelefone(cleanPhone);
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('aiviq_target_conversa', cleanPhone);
      }
      await fetch('/api/conversations/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          name: eleitor.name,
          bairro: eleitor.bairro,
          etapa: eleitor.etapa,
          voto1Nome: eleitor.voto1Nome,
          voto1Id: eleitor.voto1Id,
          voto2Nome: eleitor.voto2Nome,
          voto2Id: eleitor.voto2Id,
        }),
      });
    } catch (e) {
      console.error('Erro ao preparar conversa no servidor:', e);
    } finally {
      setAssumindoTelefone(null);
    }
    const targetUrl = `/inbox?phone=${encodeURIComponent(cleanPhone)}&conversationId=${encodeURIComponent(cleanPhone + '@s.whatsapp.net')}`;
    router.push(targetUrl);
  };

  const fetchDados = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/pesquisa/senado?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error('Erro ao carregar pesquisa:', err);
    } finally {
      setLoading(false);
    }
  };

  const isFetchingRef = useRef(false);

  useEffect(() => {
    const carregarTudo = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        await Promise.all([fetchDados(), fetchQueueStatus()]);
      } finally {
        isFetchingRef.current = false;
      }
    };

    carregarTudo();
    const interval = setInterval(carregarTudo, 4000);

    // Escuta evento em tempo real despachado pelo GlobalDispatchRunner ao disparar em segundo plano
    const handleQueueUpdated = (e: any) => {
      if (e.detail?.status) {
        setEstadoDisparador(e.detail.status);
      }
      if (Array.isArray(e.detail?.falhas)) {
        setFalhasList(e.detail.falhas);
      }
      fetchDados();
    };

    window.addEventListener('aiviq:queue-updated', handleQueueUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('aiviq:queue-updated', handleQueueUpdated);
    };
  }, []);

  // Status da fila PERSISTENTE no servidor (consumida pelo runner/cron a 2 simultâneos/min).
  const fetchQueueStatus = async () => {
    try {
      const res = await fetch(`/api/pesquisa/senado/queue?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (data?.success && data.status) {
        const s = data.status;
        setEstadoDisparador({
          ativo: Boolean(s.ativo),
          pausado: Boolean(s.pausado),
          total: s.total || 0,
          enviados: s.enviados || 0,
          erros: s.erros || 0,
          emRetentativa: s.emRetentativa || 0,
          segundosRestantesProximo: s.segundosRestantesProximo || 0,
          contatoAtual: undefined,
          fila: [],
        });
        if (Array.isArray(data.porChip)) setPorChip(data.porChip);
        if (Array.isArray(data.falhas)) {
          setFalhasList(data.falhas);
        }
      }
    } catch {
      // silencioso em background
    }
  };

  const handleDispararPesquisa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTelefone.trim()) return;
    setDisparando(true);
    setMensagemSucesso(null);

    try {
      const res = await fetch('/api/pesquisa/senado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disparar',
          phone: novoTelefone.trim(),
          name: novoNome.trim(),
          bairro: novoBairro.trim(),
          sendWhatsApp: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMensagemSucesso(
          `Disparo enviado com sucesso! ${data.dispatchedWhatsApp ? 'WhatsApp notificado em tempo real.' : 'Registrado na fila.'}`
        );
        setNovoNome('');
        setNovoTelefone('');
        fetchDados();
        setTimeout(() => {
          setIsModalOpen(false);
          setMensagemSucesso(null);
        }, 2000);
      }
    } catch (err) {
      console.error('Erro ao disparar:', err);
    } finally {
      setDisparando(false);
    }
  };

  // Processamento Inteligente de Arquivo Excel (.xlsx, .xls) ou CSV (com ou sem cabeçalho)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPlanilhaNomeArquivo(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // 1. Lê a planilha como matriz bruta de linhas para não depender de cabeçalhos
        const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
        const contatosMapeados: Array<{ name: string; phone: string; bairro?: string }> = [];

        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!Array.isArray(row) || row.length === 0) continue;

          let nome = '';
          let telefone = '';
          let bairro = '';

          // Varre as colunas da linha procurando dados
          for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] ?? '').trim();
            const cleanDigits = cell.replace(/\D/g, '');

            // Se tem de 8 a 13 dígitos numéricos, é telefone
            if (cleanDigits.length >= 8 && cleanDigits.length <= 13 && !telefone) {
              telefone = cleanDigits;
            } 
            // Se tem texto com letras alfabéticas (ao menos 2 letras), é o nome
            else if (/[a-zA-ZÀ-ÿ]{2,}/.test(cell) && !nome) {
              nome = cell;
            }
            // Se já achou nome e telefone, e tem outro texto, pode ser bairro/cidade
            else if (cell && !bairro && !cell.includes('@')) {
              bairro = cell;
            }
          }

          // Se a linha for o cabeçalho textual (ex: "Nome", "Telefone"), pula
          if (
            nome &&
            /^(nome|name|eleitor|cidad[aã]o|contato)$/i.test(nome.trim()) &&
            (telefone.length < 8 || /tel|fone|cel/i.test(String(row[1] || '')))
          ) {
            continue;
          }

          // Se o telefone tem 10 ou 11 dígitos (ex: 67998532500), prefixa 55 (Brasil)
          if (telefone.length === 10 || telefone.length === 11) {
            telefone = '55' + telefone;
          }

          if (nome && telefone.length >= 10) {
            contatosMapeados.push({
              name: nome.trim(),
              phone: telefone,
              bairro: bairro ? bairro.trim() : 'Mato Grosso do Sul',
            });
          }
        }

        setPlanilhaContatos(contatosMapeados);
        console.log(`[Importador Excel] ${contatosMapeados.length} contatos extraídos com sucesso de "${file.name}"`);
      } catch (err) {
        console.error('Erro ao processar planilha Excel:', err);
        alert('Não foi possível ler o arquivo Excel. Verifique a formatação.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Enfileira os contatos na fila PERSISTENTE do servidor (o cron consome).
  const handleCarregarFilaDisparo = async () => {
    if (planilhaContatos.length === 0) return;
    setImportando(true);
    try {
      const res = await fetch('/api/pesquisa/senado/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enfileirar',
          contatos: planilhaContatos.map((c) => ({
            name: c.name?.trim() || '',
            phone: c.phone.replace(/\D/g, ''),
            bairro: c.bairro || 'Mato Grosso do Sul',
          })),
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setMensagemSucesso(
          `✅ ${data.enfileirados} contatos na fila (disparo em segundo plano: 1 lead por minuto em cada chip, continuando mesmo ao navegar no sistema).${data.ignorados ? ` ${data.ignorados} já estavam na fila.` : ''}${data.jaEnviados ? ` ${data.jaEnviados} foram pulados por já terem recebido a abordagem antes.` : ''}` +
          (data.divisaoPorChip && Object.keys(data.divisaoPorChip).length > 0
            ? ' Divisão da lista: ' +
              Object.entries(data.divisaoPorChip)
                .map(([chip, n]) => chip + ': ' + n)
                .join(' · ')
            : '')
        );
        setIsExcelModalOpen(false);
        setPlanilhaContatos([]);
        setPlanilhaNomeArquivo('');
        await fetchQueueStatus();
        setTimeout(() => setMensagemSucesso(null), 6000);
      }
    } catch (err) {
      console.error('Erro ao enfileirar:', err);
    } finally {
      setImportando(false);
    }
  };

  // Controles da fila (server-side): retomar / pausar / parar.
  const controlarFila = async (action: 'retomar' | 'pausar' | 'parar') => {
    try {
      await fetch('/api/pesquisa/senado/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await fetchQueueStatus();
    } catch (err) {
      console.error('Erro ao controlar fila:', err);
    }
  };

  const handleIniciarDisparos = () => controlarFila('retomar');
  const handlePausarDisparos = () => controlarFila('pausar');
  const handlePararDisparos = () => {
    if (!confirm('Deseja realmente cancelar os disparos pendentes da fila?')) return;
    controlarFila('parar');
  };

  const handleExportarFalhasCSV = () => {
    if (falhasList.length === 0) return;
    const headers = ['Telefone', 'Nome', 'Chip que tentou', 'Motivo da Falha', 'Situação', 'Tentativas', 'Data'];
    const rows = falhasList.map((f) => [
      `"${f.phone}"`,
      `"${(f.name || '').replace(/"/g, '""')}"`,
      `"${(f.instanceName || 'não registrado').replace(/"/g, '""')}"`,
      `"${(f.error || 'Falha de entrega').replace(/"/g, '""')}"`,
      `"${f.definitivo ? 'Definitiva' : 'Em retentativa'}"`,
      f.attempts || 1,
      `"${f.createdAt || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `falhas_disparo_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReenfileirarFalhas = async () => {
    setReenfileirandoFalhas(true);
    try {
      const res = await fetch('/api/pesquisa/senado/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reenfileirar_falhas' }),
      });
      const data = await res.json();
      if (data?.success) {
        setMensagemSucesso(`✅ ${data.reativados || 0} contatos com falha foram devolvidos para a fila de disparo!`);
        await fetchQueueStatus();
        setTimeout(() => setMensagemSucesso(null), 6000);
      }
    } catch (e) {
      console.error('Erro ao re-enfileirar falhas:', e);
    } finally {
      setReenfileirandoFalhas(false);
    }
  };

  const handleExportarCSV = () => {
    if (sessions.length === 0) return;
    const headers = ['ID', 'Nome', 'Telefone', 'Bairro', 'Status_Etapa', '1_Voto', '2_Voto', 'Data_Registro'];
    const rows = sessions.map((s) => [
      s.id,
      `"${s.name.replace(/"/g, '""')}"`,
      s.phone,
      `"${(s.bairro || '').replace(/"/g, '""')}"`,
      s.etapa,
      `"${s.voto1Nome || 'Pendente'}"`,
      `"${s.voto2Nome || 'Pendente'}"`,
      s.createdAt,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pesquisa_senado_ms_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // "Falhas no Disparo" = falhas definitivas (3 tentativas, status 'erro') +
  // falhas em retentativa automatica (ja erraram ao menos 1x e vao tentar de
  // novo sozinhas). Antes o card e o modal so contavam as definitivas, entao
  // uma falha que tinha acabado de acontecer ficava fora do KPI ate a 3a
  // tentativa -- mesmo com o motivo do erro ja gravado no banco.
  const totalFalhasDisparo = (estadoDisparador?.erros || 0) + (estadoDisparador?.emRetentativa || 0);
  const totalFalhasDefinitivas = falhasList.filter((f) => f.definitivo).length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Top Action & Sub-Tabs Bar */}
      <div className="px-8 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setVisao('funil')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              visao === 'funil'
                ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Funil de Coleta</span>
          </button>

          <button
            onClick={() => setVisao('voto1')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              visao === 'voto1'
                ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Vote className="w-3.5 h-3.5" />
            <span>1º Voto por Opção</span>
          </button>

          <button
            onClick={() => setVisao('voto2')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              visao === 'voto2'
                ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Vote className="w-3.5 h-3.5" />
            <span>2º Voto por Opção</span>
          </button>

          <button
            onClick={() => setVisao('geral')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              visao === 'geral'
                ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Resultado Consolidado</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchDados}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportarCSV}
            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => setIsExcelModalOpen(true)}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Importar Lista Excel</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Disparo Individual</span>
          </button>
        </div>
      </div>

      {/* BANNER DE FILA DE DISPARO ANTI-BAN ATIVA */}
      {estadoDisparador && estadoDisparador.total > 0 && (
        <div className="px-8 py-2.5 bg-emerald-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Fila Multi-Instâncias (Cluster Anti-Ban · 1 lead por minuto em cada chip · teto 480/dia por chip):</span>
            </div>
            {porChip.length > 0 && (
              <span className="flex items-center gap-1.5 flex-wrap">
                {porChip.map((c) => (
                  <span
                    key={c.instancia}
                    title={`${c.instancia}: ${c.enviados} enviados, ${c.pendentes} na fila, ${c.erros} falhas`}
                    className="px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-900 font-mono text-[11px] flex items-center gap-1"
                  >
                    <Smartphone className="w-3 h-3 text-emerald-600" />
                    {c.instancia}: <strong>{c.enviados}</strong>/{c.enviados + c.pendentes}
                    {c.erros > 0 && <span className="text-rose-600">·{c.erros}✕</span>}
                  </span>
                ))}
              </span>
            )}

            <span className="text-emerald-700">
              Progresso: <strong>{estadoDisparador.enviados}</strong> de <strong>{estadoDisparador.total}</strong> disparados
              {totalFalhasDisparo > 0 && ` (${totalFalhasDisparo} falhas)`}
            </span>

            {estadoDisparador.ativo && estadoDisparador.segundosRestantesProximo > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-200/70 text-emerald-900 font-mono font-bold flex items-center gap-1">
                <Clock className="w-3 h-3 animate-pulse" />
                Próximo em: {estadoDisparador.segundosRestantesProximo}s
              </span>
            )}

            {estadoDisparador.pausado && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                PAUSADO
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!estadoDisparador.ativo || estadoDisparador.pausado ? (
              <button
                onClick={handleIniciarDisparos}
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md font-semibold flex items-center gap-1"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{estadoDisparador.pausado ? 'Retomar' : 'Iniciar Fila'}</span>
              </button>
            ) : (
              <button
                onClick={handlePausarDisparos}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold flex items-center gap-1"
              >
                <Pause className="w-3 h-3 fill-current" />
                <span>Pausar</span>
              </button>
            )}

            <button
              onClick={handlePararDisparos}
              className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md font-semibold flex items-center gap-1"
            >
              <Square className="w-3 h-3" />
              <span>Parar</span>
            </button>
          </div>
        </div>
      )}

      {/* Hero KPIs Bar da Pesquisa — agora com card exclusivo de Falhas */}
      <div className="px-8 py-3 bg-white border-b border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-0.5">
            <span className="font-medium">Total de Contatos Disparados</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl font-bold text-slate-900">{stats?.totalEleitores || sessions.length}</p>
          <p className="text-[11px] text-slate-400">Eleitores abordados</p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-0.5">
            <span className="font-medium">Pesquisas Concluídas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-emerald-700">{stats?.totalConcluidos || 0}</p>
          <p className="text-[11px] text-emerald-600 font-medium">1º e 2º votos computados</p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-0.5">
            <span className="font-medium">Taxa de Conversão</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-xl font-bold text-blue-700">{stats?.taxaConclusao || '0%'}</p>
          <p className="text-[11px] text-slate-400">Completude do questionário</p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-0.5">
            <span className="font-medium">Em Andamento</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold text-amber-700">
            {(stats?.porEtapa.disparado || 0) +
              (stats?.porEtapa.aguardando_voto1 || 0) +
              (stats?.porEtapa.aguardando_voto2 || 0)}
          </p>
          <p className="text-[11px] text-slate-400">Aguardando resposta</p>
        </div>

        {/* KPI EXCLUSIVO DE FALHAS COM BOTÃO DE VERIFICAÇÃO — conta falhas definitivas (3 tentativas) + as que ja falharam e seguem em retentativa automatica */}
        <div
          onClick={() => setIsFalhasModalOpen(true)}
          className={`p-3 border rounded-xl cursor-pointer transition-all ${
            totalFalhasDisparo > 0
              ? 'bg-rose-50/70 border-rose-200 hover:bg-rose-100/60 shadow-xs'
              : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/80'
          }`}
          title="Clique para inspecionar números com falha"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-0.5">
            <span className="font-semibold text-rose-800">Falhas no Disparo</span>
            <AlertTriangle className={`w-4 h-4 ${totalFalhasDisparo > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-xl font-bold text-rose-700">{totalFalhasDisparo}</p>
            {totalFalhasDisparo > 0 && (
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-100/80 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-0.5">
                Verificar ➔
              </span>
            )}
          </div>
          <p className="text-[11px] text-rose-600/80 font-medium">
            Números s/ WhatsApp ou erro
            {(estadoDisparador?.emRetentativa || 0) > 0 && (
              <span className="block text-amber-700">
                {estadoDisparador?.erros || 0} definitivas · {estadoDisparador?.emRetentativa} em retentativa
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Main Kanban Content Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        {/* 1. VISÃO FUNIL DE COLETA */}
        {visao === 'funil' && (
          <div className="flex gap-4 h-full min-w-max pb-2">
            {[
              {
                id: 'disparado',
                label: '1. Disparado',
                desc: 'Aguardando resposta à saudação (Msg 1)',
                items: sessions.filter((s) => s.etapa === 'disparado'),
                cor: 'border-t-amber-500',
              },
              {
                id: 'aguardando_voto1',
                label: '2. Respondeu Saudação',
                desc: 'Aguardando escolha do 1º voto (Msg 3)',
                items: sessions.filter((s) => s.etapa === 'aguardando_voto1'),
                cor: 'border-t-blue-500',
              },
              {
                id: 'aguardando_voto2',
                label: '3. 1º Voto Registrado',
                desc: 'Aguardando escolha do 2º voto (Msg 4)',
                items: sessions.filter((s) => s.etapa === 'aguardando_voto2'),
                cor: 'border-t-purple-500',
              },
              {
                id: 'concluido',
                label: '4. Concluído',
                desc: 'Ambos votos computados (Msg 5 enviada)',
                items: sessions.filter((s) => s.etapa === 'concluido'),
                cor: 'border-t-emerald-500',
              },
            ].map((col) => (
              <div
                key={col.id}
                className={`w-80 flex flex-col bg-slate-100/80 rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden border-t-4 ${col.cor}`}
              >
                <div className="p-3.5 bg-white border-b border-slate-200/80 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-xs text-slate-900">{col.label}</h3>
                    <p className="text-[10px] text-slate-400">{col.desc}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {col.items.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {col.items.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-lg text-xs">
                      Nenhum contato nesta etapa
                    </div>
                  ) : (
                    col.items.map((s) => (
                      <div
                        key={s.id}
                        className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-xs text-slate-900">{s.name}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${etapaLabels[s.etapa].bg} ${etapaLabels[s.etapa].cor}`}
                          >
                            {s.phone.slice(-4)}
                          </span>
                        </div>

                        <div className="space-y-1 text-[11px] text-slate-500 mb-2">
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{s.phone}</span>
                          </div>
                          {s.bairro && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              <span className="truncate">{s.bairro}</span>
                            </div>
                          )}
                        </div>

                        {/* Votos se houver */}
                        {(s.voto1Nome || s.voto2Nome) && (
                          <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                            {s.voto1Nome && (
                              <div className="flex items-center justify-between text-blue-700 font-medium">
                                <span>1º Voto:</span>
                                <span className="font-bold">{s.voto1Nome}</span>
                              </div>
                            )}
                            {s.voto2Nome && (
                              <div className="flex items-center justify-between text-purple-700 font-medium">
                                <span>2º Voto:</span>
                                <span className="font-bold">{s.voto2Nome}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Link direto para ver conversa no Inbox ou assumir o atendimento */}
                        <button
                          type="button"
                          onClick={() => handleAssumirConversa(s)}
                          disabled={assumindoTelefone === s.phone.replace(/\D/g, '')}
                          className="mt-2.5 w-full py-1.5 px-2 rounded-lg bg-slate-50 hover:bg-emerald-50 active:bg-emerald-100 text-slate-700 hover:text-emerald-700 border border-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 shadow-2xs"
                          title="Abrir chat no Inbox para acompanhar ou assumir o atendimento"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{assumindoTelefone === s.phone.replace(/\D/g, '') ? 'Abrindo conversa...' : 'Ver conversa / Assumir'}</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 2. VISÃO 1º VOTO POR OPÇÃO */}
        {visao === 'voto1' && (
          <div className="flex gap-4 h-full min-w-max pb-2">
            {CANDIDATOS_SENADO_MS.map((cand) => {
              const eleitores = sessions.filter((s) => s.voto1Id === cand.id);
              const totalConcluidos = stats?.totalConcluidos || 1;
              const percentual = totalConcluidos > 0 ? ((eleitores.length / totalConcluidos) * 100).toFixed(1) : '0';

              return (
                <div
                  key={cand.id}
                  className="w-72 flex flex-col bg-slate-100/80 rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden border-t-4 border-t-blue-600"
                >
                  <div className="p-3 bg-white border-b border-slate-200/80">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-base">{cand.emoji}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {eleitores.length} ({percentual}%)
                      </span>
                    </div>
                    <h3 className="font-bold text-xs text-slate-900 leading-tight">{cand.rotulo}</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                    {eleitores.length === 0 ? (
                      <div className="h-28 flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-lg text-xs">
                        Sem votos registrados
                      </div>
                    ) : (
                      eleitores.map((e) => (
                        <div key={e.id} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                          <p className="font-semibold text-xs text-slate-900">{e.name}</p>
                          <p className="text-[11px] text-slate-500">{e.phone}</p>
                          {e.bairro && <p className="text-[10px] text-slate-400 truncate">{e.bairro}</p>}
                          {e.instanceName && (
                            <p className="mt-1 inline-flex items-center gap-1 text-[9px] font-mono text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5" title="Chip que abordou este eleitor">
                              <Smartphone className="w-2.5 h-2.5 text-emerald-600" />
                              {e.instanceName}
                            </p>
                          )}
                          {e.voto2Nome && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-600 flex justify-between">
                              <span>2º voto dado:</span>
                              <span className="font-semibold text-purple-700">{e.voto2Nome}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAssumirConversa(e)}
                            disabled={assumindoTelefone === e.phone.replace(/\D/g, '')}
                            className="mt-2 w-full py-1 px-1.5 rounded bg-slate-50 hover:bg-emerald-50 active:bg-emerald-100 text-slate-700 hover:text-emerald-700 border border-slate-200 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-60 shadow-2xs"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-600" />
                            <span>{assumindoTelefone === e.phone.replace(/\D/g, '') ? 'Abrindo...' : 'Ver chat / Assumir'}</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3. VISÃO 2º VOTO POR OPÇÃO */}
        {visao === 'voto2' && (
          <div className="flex gap-4 h-full min-w-max pb-2">
            {CANDIDATOS_SENADO_MS.map((cand) => {
              const eleitores = sessions.filter((s) => s.voto2Id === cand.id);
              const totalConcluidos = stats?.totalConcluidos || 1;
              const percentual = totalConcluidos > 0 ? ((eleitores.length / totalConcluidos) * 100).toFixed(1) : '0';

              return (
                <div
                  key={cand.id}
                  className="w-72 flex flex-col bg-slate-100/80 rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden border-t-4 border-t-purple-600"
                >
                  <div className="p-3 bg-white border-b border-slate-200/80">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-base">{cand.emoji}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                        {eleitores.length} ({percentual}%)
                      </span>
                    </div>
                    <h3 className="font-bold text-xs text-slate-900 leading-tight">{cand.rotulo}</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                    {eleitores.length === 0 ? (
                      <div className="h-28 flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-lg text-xs">
                        Sem votos registrados
                      </div>
                    ) : (
                      eleitores.map((e) => (
                        <div key={e.id} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                          <p className="font-semibold text-xs text-slate-900">{e.name}</p>
                          <p className="text-[11px] text-slate-500">{e.phone}</p>
                          {e.bairro && <p className="text-[10px] text-slate-400 truncate">{e.bairro}</p>}
                          {e.instanceName && (
                            <p className="mt-1 inline-flex items-center gap-1 text-[9px] font-mono text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5" title="Chip que abordou este eleitor">
                              <Smartphone className="w-2.5 h-2.5 text-emerald-600" />
                              {e.instanceName}
                            </p>
                          )}
                          {e.voto1Nome && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-600 flex justify-between">
                              <span>1º voto foi:</span>
                              <span className="font-semibold text-blue-700">{e.voto1Nome}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAssumirConversa(e)}
                            disabled={assumindoTelefone === e.phone.replace(/\D/g, '')}
                            className="mt-2 w-full py-1 px-1.5 rounded bg-slate-50 hover:bg-emerald-50 active:bg-emerald-100 text-slate-700 hover:text-emerald-700 border border-slate-200 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-60 shadow-2xs"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-600" />
                            <span>{assumindoTelefone === e.phone.replace(/\D/g, '') ? 'Abrindo...' : 'Ver chat / Assumir'}</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. VISÃO RESULTADO CONSOLIDADO */}
        {visao === 'geral' && stats && (
          <div className="max-w-4xl mx-auto h-full overflow-y-auto pr-2 pb-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base text-slate-900">
                  Placar Geral: Eleição Senado Federal MS 2026
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Somatório dos votos totais (1º Voto + 2º Voto) com percentual sobre os votos totais computados.
              </p>

              <div className="space-y-4">
                {stats.rankingGeral.map((item, index) => {
                  const maxVotos = Math.max(...stats.rankingGeral.map((r) => r.totalVotos), 1);
                  const barWidth = `${((item.totalVotos / maxVotos) * 100).toFixed(0)}%`;

                  return (
                    <div key={item.id} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              index === 0
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : index === 1
                                ? 'bg-slate-200 text-slate-800'
                                : index === 2
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {index + 1}º
                          </span>
                          <span className="font-bold text-xs text-slate-900">{item.rotulo}</span>
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-slate-500 font-medium">
                            1º V: <strong className="text-blue-700">{item.votos1}</strong> | 2º V:{' '}
                            <strong className="text-purple-700">{item.votos2}</strong>
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-xs">
                            {item.totalVotos} votos ({item.percentual})
                          </span>
                        </div>
                      </div>

                      {/* Barra de Progresso */}
                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden flex">
                        <div
                          className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                          style={{ width: barWidth }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Novo Disparo Individual */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">Novo Disparo de Pesquisa (WhatsApp)</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDispararPesquisa} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Eleitor</label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Número de WhatsApp (com DDD) *
                </label>
                <input
                  type="tel"
                  placeholder="Ex: 67999998888"
                  value={novoTelefone}
                  onChange={(e) => setNovoTelefone(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  O chatbot enviará a Msg 1 oficial com a saudação temporal correspondente ao horário de MS.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bairro / Município (MS)</label>
                <input
                  type="text"
                  placeholder="Ex: Afonso Pena, Campo Grande"
                  value={novoBairro}
                  onChange={(e) => setNovoBairro(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden"
                />
              </div>

              {mensagemSucesso && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs">
                  {mensagemSucesso}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={disparando}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {disparando ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Disparando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Iniciar Disparo</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importação de Planilha Excel/CSV */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Importar Planilha Excel / CSV</h3>
                  <p className="text-[11px] text-slate-500">Cadência de 1 envio por minuto em cada chip · teto de 480 mensagens/dia por chip</p>
                </div>
              </div>
              <button
                onClick={() => setIsExcelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-emerald-50/20 transition-all"
              >
                <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">
                  Clique para selecionar arquivo Excel (.xlsx, .xls) ou CSV
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  A planilha deve conter colunas de <strong>Nome</strong> e <strong>Telefone</strong>.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {planilhaNomeArquivo && (
                <div className="p-3 bg-slate-100 rounded-lg flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 truncate">{planilhaNomeArquivo}</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {planilhaContatos.length} eleitores detectados
                  </span>
                </div>
              )}

              {planilhaContatos.length > 0 && (
                <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-2">Nome</th>
                        <th className="p-2">Telefone</th>
                        <th className="p-2">Bairro/Cidade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {planilhaContatos.slice(0, 10).map((c, i) => (
                        <tr key={i}>
                          <td className="p-2 font-medium">{c.name}</td>
                          <td className="p-2 font-mono text-slate-600">{c.phone}</td>
                          <td className="p-2 text-slate-500">{c.bairro || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {planilhaContatos.length > 10 && (
                    <p className="p-2 text-[10px] text-slate-400 text-center bg-slate-50 border-t border-slate-100">
                      E mais {planilhaContatos.length - 10} contatos...
                    </p>
                  )}
                </div>
              )}

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-[11px] text-amber-800">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Cadência Anti-Ban:</strong> A lista é dividida entre os chips conectados na importação e cada chip dispara 1 eleitor por minuto da própria sub-lista, com teto rígido de 480 mensagens por chip por dia. Se um chip cair, sua sub-lista é redistribuída para os que estiverem de pé.
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExcelModalOpen(false)}
                  className="px-3.5 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={planilhaContatos.length === 0 || importando}
                  onClick={handleCarregarFilaDisparo}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {importando ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Carregando Fila...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Carregar Fila e Disparar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE INSPEÇÃO E AUDITORIA DE FALHAS */}
      {isFalhasModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shadow-xs">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900">Auditoria de Falhas de Disparo</h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                      {falhasList.length} registros
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Contatos que falharam ao enviar WhatsApp (número inexistente, sem WhatsApp ou timeout) — inclui quem já falhou e segue em retentativa automática
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFalhasModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 text-sm font-bold flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Ações Rápidas */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600 font-medium">
                Verifique o motivo da falha ou reative os números para tentar novamente.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportarFalhasCSV}
                  disabled={falhasList.length === 0}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Exportar CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleReenfileirarFalhas}
                  disabled={totalFalhasDefinitivas === 0 || reenfileirandoFalhas}
                  title={
                    totalFalhasDefinitivas === 0
                      ? 'Ninguém desistiu ainda — as falhas atuais estão em retentativa automática'
                      : `Re-enfileira as ${totalFalhasDefinitivas} falhas que já desistiram após 3 tentativas`
                  }
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {reenfileirandoFalhas ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Re-enfileirando...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Tentar Novamente Todas</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Lista de Falhas */}
            <div className="p-6 overflow-y-auto flex-1">
              {falhasList.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <p className="font-semibold text-slate-800 text-sm">Nenhuma falha detectada</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Todos os contatos disparados até o momento foram entregues com sucesso aos eleitores.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3">Eleitor</th>
                        <th className="p-3">Telefone</th>
                        <th className="p-3">Chip que tentou</th>
                        <th className="p-3">Motivo da Falha</th>
                        <th className="p-3 text-center">Situação</th>
                        <th className="p-3 text-center">Tentativas</th>
                        <th className="p-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {falhasList.map((falha, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 font-medium text-slate-800">
                            {falha.name || 'Sem nome informado'}
                          </td>
                          <td className="p-3 font-mono text-slate-600">
                            {falha.phone}
                          </td>
                          <td className="p-3">
                            {falha.instanceName ? (
                              <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700">
                                {falha.instanceName}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">não registrado</span>
                            )}
                          </td>
                          <td className="p-3 text-rose-700">
                            <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px] font-medium">
                              <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                              <span className="truncate max-w-[260px]" title={falha.error}>
                                {falha.error || 'Número não possui WhatsApp ou rejeitado pela API'}
                              </span>
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {falha.definitivo ? (
                              <span className="inline-flex items-center gap-1 bg-rose-100 border border-rose-200 text-rose-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                                Definitiva
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 bg-amber-100 border border-amber-200 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                                title="Já falhou pelo menos 1x; o sistema tenta de novo automaticamente até completar 3 tentativas"
                              >
                                Em retentativa
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center text-slate-500 font-mono">
                            {falha.attempts || 1}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                const clean = String(falha.phone).replace(/\D/g, '');
                                window.open(`https://wa.me/${clean}`, '_blank');
                              }}
                              className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              Testar WhatsApp ↗
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Mostrando {falhasList.length} números com falha
              </span>
              <button
                type="button"
                onClick={() => setIsFalhasModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
