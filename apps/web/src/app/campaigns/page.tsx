'use client';

import React, { useState, useEffect } from 'react';
import NavigationRail from '@/components/layout/NavigationRail';
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
    messageText: 'Olá {{nome}}! Temos uma condição exclusiva de renovação para o seu plano da AIVIQ-ZAP. Responda para saber mais.',
    tags: ['Cliente Ativo'],
    totalContacts: 1850,
    botToTriggerOnReply: 'Qualificação Comercial & Triagem Inteligente',
    scheduledAt: '',
    avoidDuplicates: true,
    ddiPlus55: true,
  });

  const [isEnhancingAI, setIsEnhancingAI] = useState(false);

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
  };

  return (
    <div className="flex h-screen w-screen bg-[#07090e] text-slate-100 antialiased overflow-hidden font-sans">
      {/* 72px Left Navigation Rail */}
      <NavigationRail />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Topbar Header */}
        <header className="h-16 px-8 border-b border-white/5 bg-[#090d16]/80 backdrop-blur flex items-center justify-between shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">
                Disparo em Massa & Campanhas
              </h1>
              <p className="text-xs text-slate-400">
                Transmissão em escala no WhatsApp Cloud Oficial com gatilhos de chatbot
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar campanha..."
                className="w-full pl-9 pr-4 py-1.5 bg-[#0f1422] border border-white/10 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button
              onClick={() => {
                setIsWizardOpen(true);
                setWizardStep(1);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Nova Campanha
            </button>
          </div>
        </header>

        <div className="p-8 space-y-8 max-w-7xl w-full mx-auto">
          {/* Hero KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-[#0e121e] border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Campanhas Ativas</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 fill-current" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {metrics?.activeCampaigns ?? 1}
                </span>
                <span className="text-xs text-slate-500">
                  de {metrics?.totalCampaigns ?? 3} cadastradas
                </span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Fila Meta Cloud API operando a 80 msgs/s
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#0e121e] border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Disparos Realizados (Mês)</span>
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <Send className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {metrics?.monthlyDispatches.toLocaleString() ?? '48.500'}
                </span>
                <span className="text-xs text-emerald-400 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +22.8%
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Limite mensal contratado: 100.000
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#0e121e] border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Taxa Média de Entrega</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <CheckCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {metrics?.avgDeliveryRate ?? '98.7%'}
                </span>
                <span className="text-xs text-slate-500">tique duplo Meta</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Reputação Verde (High Quality)
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#0e121e] border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Taxa de Resposta / Interação</span>
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {metrics?.avgReplyRate ?? '31.4%'}
                </span>
                <span className="text-xs text-purple-400">leads engajados</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
                <Bot className="w-3 h-3 text-purple-400" /> Chatbot acionado automaticamente
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-[#0e121e] text-slate-400 hover:text-white border border-white/5'
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
          <div className="bg-[#0e121e] border border-white/5 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-[#0a0e17]/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Nome da Campanha</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Progresso de Disparo</th>
                  <th className="py-3.5 px-4">Entregues / Lidos</th>
                  <th className="py-3.5 px-4">Respostas (Bot)</th>
                  <th className="py-3.5 px-6 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {filteredCampaigns.map((camp) => {
                  const progressPct =
                    camp.totalContacts > 0
                      ? Math.min(100, Math.round((camp.sentCount / camp.totalContacts) * 100))
                      : 0;

                  return (
                    <tr key={camp.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-4 px-6">
                        <div className="font-semibold text-white group-hover:text-indigo-400 transition-colors">
                          {camp.name}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3 h-3" /> {camp.channel}
                          </span>
                          <span>•</span>
                          <span>{camp.totalContacts.toLocaleString()} contatos na base</span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            camp.status === 'running'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : camp.status === 'scheduled'
                              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                              : camp.status === 'completed'
                              ? 'bg-slate-500/10 text-slate-300 border-slate-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
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
                            <span className="text-slate-400 font-medium">{progressPct}%</span>
                            <span className="text-slate-500">
                              {camp.sentCount.toLocaleString()} / {camp.totalContacts.toLocaleString()}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-[#161c2e] rounded-full overflow-hidden">
                            <div
                              style={{ width: `${progressPct}%` }}
                              className={`h-full rounded-full ${
                                camp.status === 'completed' ? 'bg-indigo-500' : 'bg-emerald-500'
                              }`}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-200">
                          {camp.deliveredCount.toLocaleString()}
                          <span className="text-[10px] text-slate-500 ml-1">
                            ({camp.sentCount > 0 ? ((camp.deliveredCount / camp.sentCount) * 100).toFixed(0) : 0}%)
                          </span>
                        </div>
                        <div className="text-[10px] text-emerald-400">
                          {camp.readCount.toLocaleString()} leituras confirmadas
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-semibold text-purple-400">
                          {camp.repliedCount.toLocaleString()} respostas
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Bot className="w-3 h-3 text-slate-400" /> Gatilho ativo
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right">
                        {camp.status === 'running' || camp.status === 'paused' ? (
                          <button
                            onClick={() => toggleCampaignStatus(camp.id)}
                            className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-xs font-semibold text-slate-300 hover:text-white inline-flex items-center gap-1.5 transition-all"
                          >
                            {camp.status === 'running' ? (
                              <>
                                <Pause className="w-3.5 h-3.5 text-amber-400 fill-current" /> Pausar
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 text-emerald-400 fill-current" /> Retomar
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-medium">Finalizado</span>
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
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0e121e] border border-white/10 rounded-2xl w-full max-w-2xl p-6 space-y-6 shadow-2xl">
              {/* Wizard Step Indicator */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                    {wizardStep}/3
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {wizardStep === 1 && 'Passo 1: Mensagem & Canal de Disparo'}
                      {wizardStep === 2 && 'Passo 2: Seleção da Base de Contatos'}
                      {wizardStep === 3 && 'Passo 3: Regras de Envio & Gatilho do Chatbot'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Assistente oficial em 3 passos para envio em massa no WhatsApp
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsWizardOpen(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Step 1: Content & AI */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Nome da Campanha
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Campanha de Black Friday VIP 2026"
                      className="w-full px-3 py-2 bg-[#080b12] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        Mensagem WhatsApp
                      </label>
                      <button
                        type="button"
                        onClick={handleEnhanceWithAI}
                        disabled={isEnhancingAI}
                        className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {isEnhancingAI ? 'Otimizando com IA...' : '✨ Melhorar com IA'}
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={formData.messageText}
                      onChange={(e) => setFormData({ ...formData, messageText: e.target.value })}
                      className="w-full p-3 bg-[#080b12] border border-white/10 rounded-lg text-xs text-white leading-relaxed focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-slate-500">
                      Variáveis aceitas: <code className="text-indigo-400">{'{{nome}}'}</code>, <code className="text-indigo-400">{'{{empresa}}'}</code>.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Audience & Tags */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Segmentação por Etiquetas
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['Cliente Ativo', 'Lead Inbound', 'SaaS', 'CRM', 'Ex-Cliente'].map((tag) => {
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
                                ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500'
                                : 'bg-[#141928] text-slate-400 border-white/5'
                            }`}
                          >
                            🏷️ {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Upload CSV Option */}
                  <div className="p-4 rounded-xl border border-dashed border-white/10 bg-[#080b12] flex flex-col items-center justify-center text-center space-y-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-white block">
                        Importar planilha CSV / Excel
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Colunas: Nome, Telefone (com DDD)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded text-xs font-semibold transition-colors"
                    >
                      Selecionar Arquivo
                    </button>
                  </div>

                  <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
                    <span>Audiência estimada para disparo:</span>
                    <strong className="text-sm font-bold text-white">
                      {formData.totalContacts.toLocaleString()} contatos válidos
                    </strong>
                  </div>
                </div>
              )}

              {/* Step 3: Settings & Bot Trigger */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Acionar Chatbot Automaticamente ao Responder
                    </label>
                    <select
                      value={formData.botToTriggerOnReply}
                      onChange={(e) =>
                        setFormData({ ...formData, botToTriggerOnReply: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[#080b12] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Qualificação Comercial & Triagem Inteligente">
                        🤖 Qualificação Comercial & Triagem Inteligente (Recomendado)
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
                    <label className="flex items-center gap-3 p-3 rounded-xl bg-[#141928] border border-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.avoidDuplicates}
                        onChange={(e) =>
                          setFormData({ ...formData, avoidDuplicates: e.target.checked })
                        }
                        className="rounded bg-black border-white/20 text-indigo-600 focus:ring-0"
                      />
                      <span className="text-xs text-slate-300">
                        <b>Evitar mensagens duplicadas:</b> não enviar se o contato já recebeu disparo nas últimas 24h.
                      </span>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-xl bg-[#141928] border border-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.ddiPlus55}
                        onChange={(e) =>
                          setFormData({ ...formData, ddiPlus55: e.target.checked })
                        }
                        className="rounded bg-black border-white/20 text-indigo-600 focus:ring-0"
                      />
                      <span className="text-xs text-slate-300">
                        <b>Higienização de DDI:</b> Adicionar automaticamente DDI +55 aos números brasileiros.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Wizard Footer Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                {wizardStep > 1 ? (
                  <button
                    onClick={() => setWizardStep(wizardStep - 1)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Voltar
                  </button>
                ) : (
                  <div />
                )}

                {wizardStep < 3 ? (
                  <button
                    onClick={() => setWizardStep(wizardStep + 1)}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-600/30"
                  >
                    Avançar <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleFinishWizard}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-600/30"
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
