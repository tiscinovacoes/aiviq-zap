'use client';

import React, { useState, useEffect, useRef } from 'react';
import NavigationRail from '@/components/layout/NavigationRail';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import { useCampaignStore } from '@/store/useCampaignStore';
import {
  Send,
  Sparkles,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  Filter,
  MessageSquare,
  Users,
  CheckCheck,
  TrendingUp,
  Bot,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function CampaignsPage() {
  const {
    campaigns,
    metrics,
    loading,
    filterStatus,
    searchQuery,
    fetchCampaigns,
    createCampaign,
    toggleCampaignStatus,
    setFilterStatus,
    setSearchQuery,
  } = useCampaignStore();

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  // Form State for Wizard
  const [formData, setFormData] = useState({
    name: '',
    channel: 'WhatsApp Cloud Oficial',
    messageText: 'Olá {{nome}}! A Prefeitura informa: [escreva aqui o comunicado]. Em caso de dúvidas, responda por este canal.',
    tags: ['Comunicado'],
    totalContacts: 1850,
    botToTriggerOnReply: 'Triagem de Manifestações da Ouvidoria',
    scheduledAt: '',
    avoidDuplicates: true,
    ddiPlus55: true,
    importedLeads: [] as { nome: string; telefone: string }[],
  });

  const [isEnhancingAI, setIsEnhancingAI] = useState(false);

  // Importação de planilha de leads (CSV / Excel-exportado-como-CSV).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Parser CSV nativo — tolera delimitador ',' ou ';', aspas e cabeçalho
  // com colunas Nome / Telefone (acento-insensível). Sem dependência externa.
  const parseCsv = (text: string): { nome: string; telefone: string }[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const semi = (lines[0].match(/;/g) || []).length;
    const comma = (lines[0].match(/,/g) || []).length;
    const delim = semi > comma ? ';' : ',';
    const splitLine = (line: string) => {
      const out: string[] = [];
      let cur = '';
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
        } else if (ch === delim && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const header = splitLine(lines[0]).map(norm);
    const nomeIdx = header.findIndex((h) => h.includes('nome'));
    const telIdx = header.findIndex((h) => /tel|fone|whats|celular|numero|phone/.test(h));
    const hasHeader = nomeIdx !== -1 || telIdx !== -1;
    const ni = nomeIdx !== -1 ? nomeIdx : 0;
    const ti = telIdx !== -1 ? telIdx : 1;
    const rows = hasHeader ? lines.slice(1) : lines;
    const leads: { nome: string; telefone: string }[] = [];
    for (const line of rows) {
      const cols = splitLine(line);
      const telefone = (cols[ti] || '').replace(/\D/g, '');
      if (telefone.length >= 10) {
        leads.push({ nome: (cols[ni] || '').trim() || `Contato ${leads.length + 1}`, telefone });
      }
    }
    return leads;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const leads = parseCsv(text);
      if (leads.length === 0) {
        setImportError('Nenhum contato válido. Use um CSV com colunas Nome e Telefone (Excel: Salvar como CSV).');
        setImportedFileName(null);
      } else {
        setImportedFileName(file.name);
        setFormData((p) => ({ ...p, importedLeads: leads, totalContacts: leads.length }));
      }
    } catch {
      setImportError('Falha ao ler o arquivo. Exporte a planilha como CSV e tente novamente.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const filteredCampaigns = campaigns.filter((c) => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    return true;
  });

  const handleEnhanceWithAI = () => {
    setIsEnhancingAI(true);
    setTimeout(() => {
      setFormData((prev) => ({
        ...prev,
        messageText:
          'Olá {{nome}}! 🚀 Notamos seu interesse em potencializar o atendimento da sua empresa com WhatsApp oficial da Meta. Preparamos uma condição VIP com 25% OFF exclusiva para hoje. Posso te enviar a proposta?',
      }));
      setIsEnhancingAI(false);
    }, 600);
  };

  const handleFinishWizard = async () => {
    await createCampaign(formData);
    setIsWizardOpen(false);
    setWizardStep(1);
    setImportedFileName(null);
    setImportError(null);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 antialiased overflow-hidden font-sans">
      {/* 72px Left Navigation Rail */}
      <NavigationRail />
      <MobileBottomNav />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-16 md:pb-0">
        {/* Topbar Header */}
        <header className="min-h-16 px-3 sm:px-8 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Comunicados & Disparos
              </h1>
              <p className="text-xs text-slate-500">
                Transmissão em escala no WhatsApp Cloud Oficial com gatilhos de chatbot
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none sm:w-64 min-w-[140px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar campanha..."
                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition-colors"
              />
            </div>

            <button
              onClick={() => {
                setIsWizardOpen(true);
                setWizardStep(1);
              }}
              className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              Nova Campanha
            </button>
          </div>
        </header>

        <div className="p-8 space-y-8 max-w-7xl w-full mx-auto">
          {/* Hero KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Campanhas Ativas</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 fill-current" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {metrics?.activeCampaigns ?? 1}
                </span>
                <span className="text-xs text-slate-500">
                  de {metrics?.totalCampaigns ?? 3} cadastradas
                </span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-600" /> Fila Meta Cloud API operando a 80 msgs/s
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Disparos Realizados (Mês)</span>
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
                  <Send className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {metrics?.monthlyDispatches.toLocaleString() ?? '48.500'}
                </span>
                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +22.8%
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Limite mensal contratado: 100.000
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Taxa Média de Entrega</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                  <CheckCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {metrics?.avgDeliveryRate ?? '98.7%'}
                </span>
                <span className="text-xs text-slate-500">tique duplo Meta</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Reputação Verde (High Quality)
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Taxa de Resposta / Interação</span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {metrics?.avgReplyRate ?? '31.4%'}
                </span>
                <span className="text-xs text-indigo-700 font-medium">cidadãos engajados</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
                <Bot className="w-3 h-3 text-indigo-600" /> Chatbot acionado automaticamente
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-2 shrink-0">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'running', label: 'Em Execução' },
                { id: 'scheduled', label: 'Agendadas' },
                { id: 'completed', label: 'Concluídas' },
                { id: 'paused', label: 'Pausadas' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterStatus === tab.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="text-xs text-slate-500">
              Exibindo {filteredCampaigns.length} campanhas
            </span>
          </div>

          {/* Campaigns Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Nome da Campanha</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Progresso de Disparo</th>
                  <th className="py-3.5 px-4">Entregues / Lidos</th>
                  <th className="py-3.5 px-4">Respostas (Bot)</th>
                  <th className="py-3.5 px-6 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCampaigns.map((camp) => {
                  const progressPct =
                    camp.totalContacts > 0
                      ? Math.min(100, Math.round((camp.sentCount / camp.totalContacts) * 100))
                      : 0;

                  return (
                    <tr key={camp.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-4 px-6">
                        <div className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">
                          {camp.name}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {camp.channel}
                          </span>
                          <span>•</span>
                          <span>{camp.totalContacts.toLocaleString()} contatos na base</span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            camp.status === 'running'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : camp.status === 'scheduled'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : camp.status === 'completed'
                              ? 'bg-slate-100 text-slate-600 border border-slate-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {camp.status === 'running'
                            ? 'Em Execução'
                            : camp.status === 'scheduled'
                            ? 'Agendada'
                            : camp.status === 'completed'
                            ? 'Concluída'
                            : 'Pausada'}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <div className="w-44 space-y-1.5">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-700 font-semibold">{progressPct}%</span>
                            <span className="text-slate-400">
                              {camp.sentCount.toLocaleString()} / {camp.totalContacts.toLocaleString()}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${progressPct}%` }}
                              className={`h-full rounded-full ${
                                camp.status === 'completed' ? 'bg-slate-400' : 'bg-emerald-600'
                              }`}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-800">
                          {camp.deliveredCount.toLocaleString()}
                          <span className="text-[10px] text-slate-400 ml-1">
                            ({camp.sentCount > 0 ? ((camp.deliveredCount / camp.sentCount) * 100).toFixed(0) : 0}%)
                          </span>
                        </div>
                        <div className="text-[10px] text-emerald-700 font-medium">
                          {camp.readCount.toLocaleString()} leituras confirmadas
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-semibold text-indigo-700">
                          {camp.repliedCount.toLocaleString()} respostas
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Bot className="w-3 h-3 text-slate-400" /> Gatilho ativo
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right">
                        {camp.status === 'running' || camp.status === 'paused' ? (
                          <button
                            onClick={() => toggleCampaignStatus(camp.id)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 transition-all shadow-2xs"
                          >
                            {camp.status === 'running' ? (
                              <>
                                <Pause className="w-3.5 h-3.5 text-amber-600 fill-current" /> Pausar
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 text-emerald-600 fill-current" /> Retomar
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Finalizado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3-Step Wizard Modal for New Campaign */}
        {isWizardOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-6 space-y-6 shadow-xl">
              {/* Wizard Step Indicator */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                    {wizardStep}/3
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {wizardStep === 1 && 'Passo 1: Mensagem & Canal de Disparo'}
                      {wizardStep === 2 && 'Passo 2: Seleção da Base de Contatos'}
                      {wizardStep === 3 && 'Passo 3: Regras de Envio & Gatilho do Chatbot'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Assistente oficial em 3 passos para envio em massa no WhatsApp
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsWizardOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Step 1: Content & AI */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Nome da Campanha
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Campanha de Black Friday VIP 2026"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        Mensagem WhatsApp
                      </label>
                      <button
                        type="button"
                        onClick={handleEnhanceWithAI}
                        disabled={isEnhancingAI}
                        className="text-[11px] text-indigo-700 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        {isEnhancingAI ? 'Otimizando com IA...' : '✨ Otimizar com IA'}
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={formData.messageText}
                      onChange={(e) => setFormData({ ...formData, messageText: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 leading-relaxed focus:outline-none focus:bg-white focus:border-emerald-500"
                    />
                    <p className="text-[11px] text-slate-500">
                      Variáveis aceitas: <code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">{'{{nome}}'}</code>, <code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">{'{{empresa}}'}</code>.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Audience & Tags */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Segmentação por Etiquetas
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['Saúde', 'Infraestrutura', 'Iluminação', 'Zeladoria Urbana', 'Assistência Social'].map((tag) => {
                        const isSelected = formData.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              const newTags = isSelected
                                ? formData.tags.filter((t) => t !== tag)
                                : [...formData.tags, tag];
                              setFormData({ ...formData, tags: newTags });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              isSelected
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            🏷️ {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Upload CSV Option */}
                  <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-center space-y-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">
                        Importar planilha CSV / Excel
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Colunas: Nome, Telefone (com DDD)
                      </span>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt,.xls,.xlsx"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold transition-colors shadow-2xs"
                    >
                      {importedFileName ? 'Trocar Arquivo' : 'Selecionar Arquivo'}
                    </button>
                    {importedFileName && (
                      <span className="text-[11px] text-emerald-700 font-medium">
                        ✓ {importedFileName} — {formData.importedLeads.length} contatos
                      </span>
                    )}
                    {importError && (
                      <span className="text-[11px] text-rose-600 leading-snug">{importError}</span>
                    )}
                  </div>

                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                    <span>Audiência estimada para disparo:</span>
                    <strong className="text-sm font-bold text-emerald-900">
                      {formData.totalContacts.toLocaleString()} contatos válidos
                    </strong>
                  </div>
                </div>
              )}

              {/* Step 3: Settings & Bot Trigger */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Acionar Chatbot Automaticamente ao Responder
                    </label>
                    <select
                      value={formData.botToTriggerOnReply}
                      onChange={(e) =>
                        setFormData({ ...formData, botToTriggerOnReply: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                    >
                      <option value="Triagem de Manifestações da Ouvidoria">
                        🤖 Triagem de Manifestações da Ouvidoria (Recomendado)
                      </option>
                      <option value="FAQ & Atendimento de Nível 1">
                        🤖 FAQ & Atendimento de Nível 1
                      </option>
                      <option value="Nenhum (Transferir direto para fila de atendentes)">
                        Transbordo direto para atendentes humanos
                      </option>
                    </select>
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.avoidDuplicates}
                        onChange={(e) =>
                          setFormData({ ...formData, avoidDuplicates: e.target.checked })
                        }
                        className="rounded bg-white border-slate-300 text-emerald-600 focus:ring-0"
                      />
                      <span className="text-xs text-slate-700">
                        <b>Evitar mensagens duplicadas:</b> não enviar se o contato já recebeu disparo nas últimas 24h.
                      </span>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.ddiPlus55}
                        onChange={(e) =>
                          setFormData({ ...formData, ddiPlus55: e.target.checked })
                        }
                        className="rounded bg-white border-slate-300 text-emerald-600 focus:ring-0"
                      />
                      <span className="text-xs text-slate-700">
                        <b>Higienização de DDI:</b> Adicionar automaticamente DDI +55 aos números brasileiros.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Wizard Footer Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                {wizardStep > 1 ? (
                  <button
                    onClick={() => setWizardStep(wizardStep - 1)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Voltar
                  </button>
                ) : (
                  <div />
                )}

                {wizardStep < 3 ? (
                  <button
                    onClick={() => setWizardStep(wizardStep + 1)}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
                  >
                    Avançar <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleFinishWizard}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
                  >
                    <Send className="w-4 h-4" /> Confirmar e Disparar Campanha
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
