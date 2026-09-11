'use client';

import React, { useState, useEffect } from 'react';
import NavigationRail from '@/components/layout/NavigationRail';
import { ReportData } from '@/types/campaign';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  Star,
  Users,
  MessageSquare,
  Bot,
  Download,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';

export default function ReportsDashboardPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');

  useEffect(() => {
    fetch('/api/reports')
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          setData(resData.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleExport = () => {
    alert('Exportação de relatório em planilha consolidada iniciada!');
  };

  return (
    <div className="flex h-screen w-screen bg-[#07090e] text-slate-100 antialiased overflow-hidden font-sans">
      {/* 72px Left Rail */}
      <NavigationRail />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Topbar Header */}
        <header className="h-16 px-8 border-b border-white/5 bg-[#090d16]/80 backdrop-blur flex items-center justify-between shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">
                Métricas & Relatórios Executivos (BI)
              </h1>
              <p className="text-xs text-slate-400">
                Telemetria operacional, SLAs de primeira resposta, CSAT e produtividade por atendente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-[#0e121e] border border-white/10 rounded-lg p-1 text-xs">
              {[
                { id: '7d', label: '7 Dias' },
                { id: '30d', label: '30 Dias' },
                { id: 'month', label: 'Este Mês' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPeriod(item.id)}
                  className={`px-3 py-1 rounded-md transition-all font-semibold ${
                    period === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleExport}
              className="px-3.5 py-1.5 bg-[#141a2b] hover:bg-[#1e273f] text-slate-200 hover:text-white border border-white/10 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          </div>
        </header>

        <div className="p-8 space-y-8 max-w-7xl w-full mx-auto">
          {/* Hero Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-[#0e121e] border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Conversas Atendidas</span>
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {data?.totalConversations.toLocaleString() ?? '8.420'}
                </span>
                <span className="text-xs text-emerald-400 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +14.2%
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {data?.resolvedConversations.toLocaleString() ?? '7.980'} resolvidas com sucesso
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#0e121e] border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>SLA de 1ª Resposta (FRT)</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-400">
                  {data?.avgFirstResponseTime ?? '1m 12s'}
                </span>
                <span className="text-xs text-slate-500">média geral</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Meta de SLA (&lt; 2 min) atingida
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#0e121e] border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Tempo de Resolução (MTTR)</span>
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {data?.avgResolutionTime ?? '14m 30s'}
                </span>
                <span className="text-xs text-emerald-400">-3m vs mês ant.</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Desde a entrada até o fechamento
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#0e121e] border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Satisfação do Cliente (CSAT)</span>
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Star className="w-3.5 h-3.5 fill-current" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {data?.csatOverall ?? 4.8}
                </span>
                <span className="text-xs text-amber-400">de 5.0</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {data?.csatPositivePercentage ?? '96.2%'} avaliações positivas
              </div>
            </div>
          </div>

          {/* Channels Breakdown & Bot Deflection Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Volumetria por Canal */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-[#0e121e] border border-white/5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Distribuição por Canal de Atendimento</h3>
                <span className="text-xs text-slate-500">86.600 mensagens trafegadas</span>
              </div>

              {/* Progress bars */}
              <div className="space-y-4">
                {data?.channels.map((ch) => (
                  <div key={ch.channel} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-white flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: ch.color }}
                        />
                        {ch.label}
                      </span>
                      <span className="text-slate-400">
                        {ch.conversations.toLocaleString()} conversas ({ch.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#161c2e] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${ch.percentage}%`, backgroundColor: ch.color }}
                        className="h-full rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Deflection Card */}
            <div className="p-6 rounded-2xl bg-[#0e121e] border border-white/5 flex flex-col justify-between relative overflow-hidden">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">Deflexão com Chatbots & IA</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Percentual de atendimentos resolvidos de ponta a ponta pelo motor automatizado sem requerer intervenção humana.
                </p>
              </div>

              <div className="my-6 p-4 rounded-xl bg-[#141928] border border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-3xl font-black text-purple-400">
                    {data?.aiDeflectionRate ?? '68.4%'}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Resoluções Autônomas
                  </span>
                </div>
                <div className="text-right text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <Sparkles className="w-4 h-4" /> Qwen Copilot
                </div>
              </div>

              <div className="text-[11px] text-slate-500">
                Economia operacional equivalente a 5 atendentes adicionais em horário comercial.
              </div>
            </div>
          </div>

          {/* Attendant Performance Ranking Table */}
          <div className="bg-[#0e121e] border border-white/5 rounded-2xl overflow-hidden shadow-sm space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Produtividade da Equipe de Atendimento</h3>
                <p className="text-xs text-slate-400">
                  Ranking em tempo real por velocidade de resposta e avaliação CSAT
                </p>
              </div>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Atendente</th>
                  <th className="py-3 px-4">Departamento</th>
                  <th className="py-3 px-4">Tickets Resolvidos</th>
                  <th className="py-3 px-4">Tempo Médio (FRT)</th>
                  <th className="py-3 px-4">CSAT</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {data?.attendants.map((att) => (
                  <tr key={att.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center font-bold text-xs text-white">
                        {att.avatar}
                      </div>
                      <span className="font-semibold text-white">{att.name}</span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">{att.department}</td>

                    <td className="py-3.5 px-4 font-semibold text-slate-200">
                      {att.chatsResolved} chats
                    </td>

                    <td className="py-3.5 px-4 font-mono text-emerald-400 font-semibold">
                      {att.avgResponseTime}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 text-amber-400 font-bold">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {att.csatScore.toFixed(1)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          att.status === 'online'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : att.status === 'busy'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}
                      >
                        {att.status === 'online' ? '● Disponível' : att.status === 'busy' ? '● Em Atendimento' : 'Offline'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
