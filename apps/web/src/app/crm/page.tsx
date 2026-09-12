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
    { id: 'lead_qualificado', label: '1. Lead Qualificado', color: 'text-blue-700' },
    { id: 'contato_inicial', label: '2. Contato Inicial', color: 'text-teal-700' },
    { id: 'demonstracao', label: '3. Demonstração', color: 'text-purple-700' },
    { id: 'proposta_enviada', label: '4. Proposta Enviada', color: 'text-indigo-700' },
    { id: 'fechado_ganho', label: '5. Fechado / Ganho', color: 'text-emerald-700' },
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
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden font-sans select-none">
      {/* Left Navigation Rail */}
      <NavigationRail />

      {/* Main CRM Workspace */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 px-8 border-b border-slate-200 flex items-center justify-between bg-white/95 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-900">Funil de Vendas (Kanban CRM)</h1>
              <p className="text-xs text-slate-500">
                Pipeline integrado de oportunidades e conversão em tempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Oportunidade</span>
            </button>
          </div>
        </header>

        {/* Hero KPIs Bar */}
        <div className="px-8 py-4 bg-white border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">Pipeline Total</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-lg font-bold text-slate-900">
              {formatCurrency(metrics.totalPipelineValue)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{metrics.totalDeals} oportunidades ativas</p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">Fechado / Ganho</span>
              <Award className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-lg font-bold text-emerald-700">
              {formatCurrency(metrics.wonValue)}
            </p>
            <p className="text-[11px] text-emerald-600/90 mt-0.5 font-medium">Meta do mês: 82% atingida</p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">Ticket Médio</span>
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-lg font-bold text-slate-900">
              {formatCurrency(metrics.averageTicket)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Por contrato anual</p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">Taxa de Conversão</span>
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
            </div>
            <p className="text-lg font-bold text-teal-700">{metrics.conversionRate}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">+4.2% em relação ao mês anterior</p>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-6 flex gap-5 items-start bg-slate-50">
          {stages.map((st) => {
            const stageDeals = deals.filter((d) => d.stage === st.id);
            const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0);

            return (
              <div
                key={st.id}
                className="w-80 bg-slate-100/70 border border-slate-200 rounded-2xl flex flex-col max-h-full shrink-0 shadow-2xs"
              >
                {/* Column Header */}
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white/70 rounded-t-2xl">
                  <div>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                      {st.label}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-semibold">
                      {formatCurrency(stageTotal)}
                    </p>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs border border-slate-300/60">
                    {stageDeals.length}
                  </span>
                </div>

                {/* Cards Stream */}
                <div className="p-3.5 overflow-y-auto flex-1 space-y-3">
                  {stageDeals.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-white/40 font-medium">
                      Nenhuma oportunidade
                    </div>
                  ) : (
                    stageDeals.map((deal) => (
                      <div
                        key={deal.id}
                        className="p-4 rounded-xl bg-white border border-slate-200 hover:border-emerald-500/50 hover:shadow-xs transition-all shadow-2xs group relative"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="font-bold text-xs text-slate-900 line-clamp-2">
                            {deal.title}
                          </h4>
                          <span className="font-bold text-xs text-emerald-700 whitespace-nowrap">
                            {formatCurrency(deal.value)}
                          </span>
                        </div>

                        {/* Contact info */}
                        <div className="space-y-1 text-[11px] text-slate-500 mb-3">
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>{deal.contact?.name || 'Cliente'}</span>
                          </div>
                          {deal.contact?.company && (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              <span className="line-clamp-1">{deal.contact.company}</span>
                            </div>
                          )}
                        </div>

                        {/* Probability Progress */}
                        <div className="space-y-1 mb-3">
                          <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                            <span>Probabilidade</span>
                            <span>{deal.probability}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${deal.probability}%` }}
                            />
                          </div>
                        </div>

                        {/* Card Footer & Stage Mover */}
                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Resp: {deal.assignee_name || 'Lucas R.'}</span>

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
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 rounded flex items-center gap-1 font-semibold transition-colors"
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl relative">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-emerald-600" />
              <span>Criar Nova Oportunidade (CRM)</span>
            </h3>

            <form onSubmit={handleCreateDeal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Título do Negócio *
                </label>
                <input
                  type="text"
                  required
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                  placeholder="Ex: Assinatura Anual Plano Enterprise"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Valor Total (R$) *
                  </label>
                  <input
                    type="number"
                    required
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                    placeholder="12000"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Fase Inicial
                  </label>
                  <select
                    value={stageInput}
                    onChange={(e) => setStageInput(e.target.value as DealStage)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
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
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Contato Vinculado
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Nome da pessoa de contato"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Empresa do Cliente
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Nome da organização"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
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
