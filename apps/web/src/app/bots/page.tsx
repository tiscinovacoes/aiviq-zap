'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import NavigationRail from '@/components/layout/NavigationRail';
import {
  Bot,
  Zap,
  Play,
  Pause,
  Edit3,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Sparkles,
  MessageSquare,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

interface BotSummary {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'paused';
  channels: string[];
  groupsCount: number;
  publishedVersion: number;
  totalConversations: number;
  resolutionRate: string;
  updatedAt: string;
}

export default function BotsDashboardPage() {
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [metrics, setMetrics] = useState({
    totalBots: 3,
    activeBots: 2,
    totalAutomations: 2450,
    avgResolution: '68.4%',
  });
  const [search, setSearch] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newBotName, setNewBotName] = useState('');

  useEffect(() => {
    fetch('/api/bots')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setBots(data.bots);
          if (data.metrics) setMetrics(data.metrics);
        }
      })
      .catch(() => {});
  }, []);

  const filteredBots = bots.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateBot = (templateName?: string) => {
    const name = templateName || newBotName || 'Novo Chatbot';
    fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setBots([data.bot, ...bots]);
          setIsNewModalOpen(false);
          setNewBotName('');
        }
      });
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 antialiased overflow-hidden font-sans">
      {/* 72px Left Rail */}
      <NavigationRail />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Topbar Header */}
        <header className="h-16 px-8 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Automações & Chatbots No-Code
              </h1>
              <p className="text-xs text-slate-500">
                Construtor visual de fluxos conversacionais omnichannel com IA integrada
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar fluxos..."
                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition-colors"
              />
            </div>

            <button
              onClick={() => setIsNewModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              Novo Fluxo
            </button>
          </div>
        </header>

        <div className="p-8 space-y-8 max-w-7xl w-full mx-auto">
          {/* Hero KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Bots em Execução</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 fill-current" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{metrics.activeBots}</span>
                <span className="text-xs text-slate-500">de {metrics.totalBots} fluxos ativos</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> 100% online no WhatsApp Cloud
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Atendimentos Automatizados</span>
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {metrics.totalAutomations.toLocaleString()}
                </span>
                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +18.4% hoje
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
                Economia estimada de 142 horas humanas
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Taxa de Resolução (Deflexão)</span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{metrics.avgResolution}</span>
                <span className="text-xs text-slate-500">resolvidos sem transbordo</span>
              </div>
              <div className="mt-2 text-[11px] text-indigo-700 font-medium flex items-center gap-1">
                Copiloto AIVIQ Agent ativo
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Velocidade de Resposta</span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">0.8 seg</span>
                <span className="text-xs text-slate-500">latência de IA</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                Disparo instantâneo por webhook
              </div>
            </div>
          </div>

          {/* Bot Cards List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-wider uppercase text-slate-500">
                Seus Fluxos Ativos ({filteredBots.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredBots.map((b) => (
                <div
                  key={b.id}
                  className="bg-white border border-slate-200 hover:border-emerald-500 rounded-xl p-5 flex flex-col justify-between group transition-all shadow-xs"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                          <Bot className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1">
                            {b.name}
                          </h3>
                          <p className="text-[11px] text-slate-400">v{b.publishedVersion} publicada</p>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          b.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : b.status === 'paused'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {b.status === 'active' ? 'Ativo' : b.status === 'paused' ? 'Pausado' : 'Rascunho'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {b.channels.map((ch) => (
                        <span
                          key={ch}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"
                        >
                          <MessageSquare className="w-2.5 h-2.5 text-emerald-600" />
                          {ch}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Conversas</span>
                        <span className="font-semibold text-slate-900">
                          {b.totalConversations.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Taxa de Resolução</span>
                        <span className="font-semibold text-indigo-700">{b.resolutionRate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      {b.groupsCount} grupos de blocos
                    </span>

                    <Link
                      href={`/bots/${b.id}`}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar Fluxo
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Novo Fluxo */}
        {isNewModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-xl text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Criar Novo Chatbot</h3>
                    <p className="text-xs text-slate-500">Escolha um template profissional ou comece em branco</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsNewModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-700 block">Nome do Fluxo</label>
                <input
                  type="text"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="Ex: Triagem Comercial WhatsApp"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 block">Templates Recomendados:</span>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    {
                      name: 'Qualificação SDR & Agendamento',
                      desc: 'Pergunta nome, segmento, budget e transborda para comercial.',
                    },
                    {
                      name: 'Triagem & Suporte N1',
                      desc: 'FAQ automatizado com consulta de pedidos e desvio para engenharia.',
                    },
                    {
                      name: 'Pesquisa CSAT Pós-Atendimento',
                      desc: 'Coleta nota de 1 a 5 e feedback logo após encerramento do ticket.',
                    },
                  ].map((tpl) => (
                    <button
                      key={tpl.name}
                      onClick={() => handleCreateBot(tpl.name)}
                      className="p-3 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-left transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">
                          {tpl.name}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{tpl.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleCreateBot()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                >
                  Criar em Branco
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
