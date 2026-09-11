'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Plus,
  DollarSign,
  TrendingUp,
  Award,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Users,
  Building2,
  Calendar,
  Loader2,
} from 'lucide-react';
import NavigationRail from '@/components/layout/NavigationRail';
import { useCRMStore } from '@/store/useCRMStore';
import { DealStage, Deal } from '@/types';

export default function CRMPage() {
  const {
    deals,
    metrics,
    fetchDeals,
    moveDealStage,
    addDeal,
    isLoading,
  } = useCRMStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [contactName, setContactName] = useState('');
  const [company, setCompany] = useState('');
  const [stageInput, setStageInput] = useState<DealStage>('lead_qualificado');

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const stages: { id: DealStage; label: string; color: string }[] = [
    { id: 'lead_qualificado', label: '1. Lead Qualificado', color: 'border-blue-500/40 text-blue-400' },
    { id: 'contato_inicial', label: '2. Contato Inicial', color: 'border-cyan-500/40 text-cyan-400' },
    { id: 'demonstracao', label: '3. Demonstração', color: 'border-purple-500/40 text-purple-400' },
    { id: 'proposta_enviada', label: '4. Proposta Enviada', color: 'border-indigo-500/40 text-indigo-400' },
    { id: 'fechado_ganho', label: '5. Fechado / Ganho', color: 'border-emerald-500/40 text-emerald-400' },
  ];

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealTitle.trim() || !dealValue) return;

    await addDeal({
      title: dealTitle.trim(),
      value: parseFloat(dealValue),
      stage: stageInput,
      contact: {
        id: `cont-${Date.now()}`,
        organization_id: '00000000-0000-0000-0000-000000000000',
        name: contactName.trim() || 'Cliente',
        company: company.trim(),
        tags: ['Lead Quente'],
        custom_attributes: {},
      },
      assignee_name: 'Lucas R.',
    });

    setDealTitle('');
    setDealValue('');
    setContactName('');
    setCompany('');
    setIsModalOpen(false);
  };

  return (
    <div className="flex h-screen w-screen bg-[#090d16] text-slate-100 overflow-hidden font-sans select-none">
      {/* Left Navigation Rail */}
      <NavigationRail />

      {/* Main CRM Workspace */}
      <main className="flex-1 flex flex-col h-full bg-[#090d16] overflow-hidden">
        {/* Top Header */}
        <header className="h-16 px-8 border-b border-white/5 flex items-center justify-between bg-[#0f131c]/60 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base text-white">Funil de Vendas (Kanban CRM)</h1>
              <p className="text-xs text-slate-400">
                Pipeline integrado de oportunidades e conversão em tempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/30"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Oportunidade</span>
            </button>
          </div>
        </header>

        {/* Hero KPIs Bar */}
        <div className="px-8 py-4 bg-[#0a0e17] border-b border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
          <div className="p-3.5 bg-[#0f131c] border border-white/5 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Pipeline Total</span>
              <DollarSign className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-lg font-bold text-white">
              {formatCurrency(metrics.totalPipelineValue)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">{metrics.totalDeals} oportunidades ativas</p>
          </div>

          <div className="p-3.5 bg-[#0f131c] border border-white/5 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Fechado / Ganho</span>
              <Award className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-lg font-bold text-emerald-400">
              {formatCurrency(metrics.wonValue)}
            </p>
            <p className="text-[11px] text-emerald-500/80 mt-0.5">Meta do mês: 82% atingida</p>
          </div>

          <div className="p-3.5 bg-[#0f131c] border border-white/5 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Ticket Médio</span>
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-lg font-bold text-white">
              {formatCurrency(metrics.averageTicket)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Por contrato anual</p>
          </div>

          <div className="p-3.5 bg-[#0f131c] border border-white/5 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Taxa de Conversão</span>
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-lg font-bold text-cyan-400">{metrics.conversionRate}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">+4.2% em relação ao mês anterior</p>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-6 flex gap-5 items-start">
          {stages.map((st) => {
            const stageDeals = deals.filter((d) => d.stage === st.id);
            const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0);

            return (
              <div
                key={st.id}
                className="w-80 bg-[#0f131c] border border-white/5 rounded-2xl flex flex-col max-h-full shrink-0 shadow-lg"
              >
                {/* Column Header */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <h3 className={`font-bold text-xs uppercase tracking-wider ${st.color}`}>
                      {st.label}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                      {formatCurrency(stageTotal)}
                    </p>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-white/5 text-slate-300 flex items-center justify-center font-bold text-xs border border-white/5">
                    {stageDeals.length}
                  </span>
                </div>

                {/* Cards Stream */}
                <div className="p-3.5 overflow-y-auto flex-1 space-y-3">
                  {stageDeals.length === 0 ? (
                    <div className="p-6 text-center text-slate-600 text-xs border border-dashed border-white/5 rounded-xl">
                      Nenhuma oportunidade
                    </div>
                  ) : (
                    stageDeals.map((deal) => (
                      <div
                        key={deal.id}
                        className="p-4 rounded-xl bg-[#181b25] border border-white/10 hover:border-indigo-500/40 transition-all shadow-md group relative"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="font-semibold text-xs text-white line-clamp-2">
                            {deal.title}
                          </h4>
                          <span className="font-bold text-xs text-emerald-400 whitespace-nowrap">
                            {formatCurrency(deal.value)}
                          </span>
                        </div>

                        {/* Contact info */}
                        <div className="space-y-1 text-[11px] text-slate-400 mb-3">
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Users className="w-3 h-3 text-slate-500" />
                            <span>{deal.contact?.name || 'Cliente'}</span>
                          </div>
                          {deal.contact?.company && (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3 h-3 text-slate-500" />
                              <span className="line-clamp-1">{deal.contact.company}</span>
                            </div>
                          )}
                        </div>

                        {/* Probability Progress */}
                        <div className="space-y-1 mb-3">
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>Probabilidade</span>
                            <span>{deal.probability}%</span>
                          </div>
                          <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all"
                              style={{ width: `${deal.probability}%` }}
                            />
                          </div>
                        </div>

                        {/* Card Footer & Stage Mover */}
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">Resp: {deal.assignee_name || 'Lucas R.'}</span>

                          {/* Stage Transition Buttons */}
                          <div className="flex items-center gap-1">
                            {st.id !== 'fechado_ganho' && (
                              <button
                                onClick={() => {
                                  const currentIndex = stages.findIndex((s) => s.id === st.id);
                                  if (currentIndex < stages.length - 1) {
                                    moveDealStage(deal.id, stages[currentIndex + 1].id);
                                  }
                                }}
                                title="Avançar para próxima etapa"
                                className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded flex items-center gap-1 transition-colors"
                              >
                                <span>Avançar</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Modal Nova Oportunidade */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="w-full max-w-md bg-[#181b25] border border-white/10 rounded-2xl p-6 shadow-2xl shadow-black/80 relative">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-400" />
              <span>Criar Nova Oportunidade (CRM)</span>
            </h3>

            <form onSubmit={handleCreateDeal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Título do Negócio *
                </label>
                <input
                  type="text"
                  required
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                  placeholder="Ex: Assinatura Anual Plano Enterprise"
                  className="w-full h-10 px-3 bg-[#0a0e17] border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Valor Total (R$) *
                  </label>
                  <input
                    type="number"
                    required
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                    placeholder="12000"
                    className="w-full h-10 px-3 bg-[#0a0e17] border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Fase Inicial
                  </label>
                  <select
                    value={stageInput}
                    onChange={(e) => setStageInput(e.target.value as DealStage)}
                    className="w-full h-10 px-3 bg-[#0a0e17] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="lead_qualificado">1. Lead Qualificado</option>
                    <option value="contato_inicial">2. Contato Inicial</option>
                    <option value="demonstracao">3. Demonstração</option>
                    <option value="proposta_enviada">4. Proposta Enviada</option>
                    <option value="fechado_ganho">5. Fechado / Ganho</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Contato Vinculado
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Nome da pessoa de contato"
                  className="w-full h-10 px-3 bg-[#0a0e17] border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Empresa do Cliente
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Nome da organização"
                  className="w-full h-10 px-3 bg-[#0a0e17] border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                >
                  Criar Oportunidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
