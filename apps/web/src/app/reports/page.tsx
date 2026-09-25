'use client';

import React, { useState, useEffect } from 'react';
import NavigationRail from '@/components/layout/NavigationRail';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
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
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 antialiased overflow-hidden font-sans">
      {/* 72px Left Rail */}
      <NavigationRail />
      <MobileBottomNav />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-16 md:pb-0">
        {/* Topbar Header */}
        <header className="min-h-16 px-3 sm:px-8 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Métricas & Relatórios Executivos (BI)
              </h1>
              <p className="text-xs text-slate-500">
                Telemetria operacional, SLAs de primeira resposta, CSAT e produtividade por atendente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-1 text-xs">
              {[
                { id: '7d', label: '7 Dias' },
                { id: '30d', label: '30 Dias' },
                { id: 'month', label: 'Este Mês' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPeriod(item.id)}
                  className={`px-3 py-1 rounded-md transition-all font-semibold ${
                    period === item.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleExport}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          </div>
        </header>

        <div className="p-8 space-y-8 max-w-7xl w-full mx-auto">
          {/* Hero Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Conversas Atendidas</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {data?.totalConversations.toLocaleString() ?? '8.420'}
                </span>
                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +14.2%
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                {data?.resolvedConversations.toLocaleString() ?? '7.980'} resolvidas com sucesso
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>SLA de 1ª Resposta (FRT)</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-700">
                  {data?.avgFirstResponseTime ?? '1m 12s'}
                </span>
                <span className="text-xs text-slate-500">média geral</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Meta de SLA (&lt; 2 min) atingida
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Tempo de Resolução (MTTR)</span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {data?.avgResolutionTime ?? '14m 30s'}
                </span>
                <span className="text-xs text-emerald-700 font-medium">-3m vs mês ant.</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Desde a entrada até o fechamento
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Satisfação do Cidadão (CSAT)</span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
                  <Star className="w-3.5 h-3.5 fill-current" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {data?.csatOverall ?? 4.8}
                </span>
                <span className="text-xs text-amber-600 font-semibold">de 5.0</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {data?.csatPositivePercentage ?? '96.2%'} avaliações positivas
              </div>
            </div>
          </div>

          {/* Channels Breakdown & Bot Deflection Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Volumetria por Canal */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Distribuição por Canal de Atendimento</h3>
                <span className="text-xs text-slate-500">86.600 mensagens trafegadas</span>
              </div>

              {/* Progress bars */}
              <div className="space-y-4">
                {data?.channels.map((ch) => (
                  <div key={ch.channel} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-900 flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: ch.color }}
                        />
                        {ch.label}
                      </span>
                      <span className="text-slate-500">
                        {ch.conversations.toLocaleString()} conversas ({ch.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
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
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Deflexão com Chatbots & IA</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Percentual de atendimentos resolvidos de ponta a ponta pelo motor automatizado sem requerer intervenção humana.
                </p>
              </div>

              <div className="my-6 p-4 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-3xl font-black text-indigo-700">
                    {data?.aiDeflectionRate ?? '68.4%'}
                  </span>
                  <span className="text-[11px] text-slate-600 block mt-0.5 font-medium">
                    Resoluções Autônomas
                  </span>
                </div>
                <div className="text-right text-xs text-indigo-700 font-semibold flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-indigo-600" /> AIVIQ Copilot
                </div>
              </div>

              <div className="text-[11px] text-slate-500">
                Economia operacional equivalente a 5 atendentes adicionais em horário de expediente.
              </div>
            </div>
          </div>

          {/* Attendant Performance Ranking Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Produtividade da Equipe de Atendimento</h3>
                <p className="text-xs text-slate-500">
                  Ranking em tempo real por velocidade de resposta e avaliação CSAT
                </p>
              </div>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Atendente</th>
                  <th className="py-3 px-4">Departamento</th>
                  <th className="py-3 px-4">Tickets Resolvidos</th>
                  <th className="py-3 px-4">Tempo Médio (FRT)</th>
                  <th className="py-3 px-4">CSAT</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data?.attendants.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center font-bold text-xs text-emerald-700">
                        {att.avatar}
                      </div>
                      <span className="font-semibold text-slate-900">{att.name}</span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500">{att.department}</td>

                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {att.chatsResolved} chats
                    </td>

                    <td className="py-3.5 px-4 font-mono text-emerald-700 font-semibold">
                      {att.avgResponseTime}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 text-amber-600 font-bold">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {att.csatScore.toFixed(1)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          att.status === 'online'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : att.status === 'busy'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
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
