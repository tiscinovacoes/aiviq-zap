'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Users,
  Bot,
  BarChart3,
  Settings,
  Search,
  CheckCircle2,
  Phone,
  Mail,
  Send,
  Paperclip,
  Mic,
  Smile,
  Zap,
  Clock,
  Sparkles,
  ChevronDown,
  LogOut,
  Tag,
  Briefcase,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function InboxPage() {
  const { user, logout, fetchUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'open' | 'pending' | 'resolved'>('open');
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram' | 'webchat'>('all');
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState([
    {
      id: '1',
      sender: 'Mariana Silva',
      senderType: 'contact',
      time: '14:28',
      text: 'Olá! Gostaria de saber mais sobre a integração com a WhatsApp Cloud API oficial e os planos empresariais.',
      status: 'read',
    },
    {
      id: '2',
      sender: 'Lucas R.',
      senderType: 'agent',
      time: '14:29',
      text: 'Olá Mariana! Seja muito bem-vinda à Poli. A nossa plataforma utiliza a API Oficial da Cloud API com isolamento multi-tenant e RLS completo.',
      status: 'read',
    },
    {
      id: '3',
      sender: 'Mariana Silva',
      senderType: 'contact',
      time: '14:31',
      text: 'Excelente! Qual o valor do plano Pro para 10 atendentes?',
      status: 'read',
    },
    {
      id: '4',
      sender: 'Lucas R.',
      senderType: 'agent',
      time: '14:31',
      text: 'O plano Pro para 10 atendentes fica por R$ 890/mês com CRM integrado e automações ilimitadas. Deseja que eu envie a proposta formal?',
      status: 'read',
    },
    {
      id: '5',
      sender: 'Mariana Silva',
      senderType: 'contact',
      time: '14:32',
      text: 'Perfeito, aguardo o link de pagamento do plano Pro!',
      status: 'read',
    },
  ]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        sender: 'Lucas R.',
        senderType: 'agent',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: messageInput,
        status: 'sent',
      },
    ]);
    setMessageInput('');
  };

  const handleApplyAISuggestion = () => {
    setMessageInput('Aqui está o link seguro para ativação do seu Plano Pro: https://checkout.poli.dev/pro?org=techcorp');
  };

  return (
    <div className="flex h-screen w-screen bg-[#090d16] text-slate-100 overflow-hidden font-sans select-none">
      {/* 1. Persistent Left Navigation Rail (72px) */}
      <nav className="w-[72px] h-full bg-[#0a0e17] border-r border-white/5 flex flex-col items-center justify-between py-5 z-20">
        <div className="flex flex-col items-center gap-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-indigo-600/30">
            P
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              title="Caixa de Entrada"
              className="w-11 h-11 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center relative shadow-sm"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-black font-bold text-[9px] rounded-full flex items-center justify-center">
                14
              </span>
            </button>
            <button title="CRM & Contatos" className="w-11 h-11 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors">
              <Users className="w-5 h-5" />
            </button>
            <button title="Automações & IA" className="w-11 h-11 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors">
              <Bot className="w-5 h-5" />
            </button>
            <button title="Métricas & Relatórios" className="w-11 h-11 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors">
              <BarChart3 className="w-5 h-5" />
            </button>
            <button title="Configurações" className="w-11 h-11 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => logout()}
            title="Sair da Plataforma"
            className="w-10 h-10 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center font-semibold text-xs text-white">
              LR
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0a0e17]" />
          </div>
        </div>
      </nav>

      {/* 2. Conversation List Column (360px) */}
      <section className="w-[360px] h-full bg-[#0f131c] border-r border-white/5 flex flex-col">
        {/* Header & Search */}
        <div className="p-4 border-b border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base text-white">Conversas</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              17 ativas
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar (⌘K)..."
              className="w-full h-9 pl-9 pr-3 bg-[#0a0e17] border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex bg-[#0a0e17] p-1 rounded-lg border border-white/5 text-xs">
            <button
              onClick={() => setActiveTab('open')}
              className={`flex-1 py-1 rounded-md transition-all font-medium ${
                activeTab === 'open' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Abertas (12)
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex-1 py-1 rounded-md transition-all font-medium ${
                activeTab === 'pending' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pendentes (5)
            </button>
            <button
              onClick={() => setActiveTab('resolved')}
              className={`flex-1 py-1 rounded-md transition-all font-medium ${
                activeTab === 'resolved' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Resolvidas
            </button>
          </div>
        </div>

        {/* Conversation Feed */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {/* Item 1: Mariana Silva (Active) */}
          <div className="p-3.5 bg-indigo-600/10 border-l-4 border-indigo-500 cursor-pointer transition-colors">
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-white">Mariana Silva</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                  WhatsApp
                </span>
              </div>
              <span className="text-[11px] text-slate-400">14:32</span>
            </div>
            <p className="text-xs text-slate-300 line-clamp-1 mb-2">
              Perfeito, aguardo o link de pagamento do plano Pro!
            </p>
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">VIP</span>
                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium">Lead Quente</span>
              </div>
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                2
              </span>
            </div>
          </div>

          {/* Item 2: Carlos Eduardo */}
          <div className="p-3.5 hover:bg-white/5 cursor-pointer transition-colors">
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-slate-200">Carlos Eduardo</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400">
                  WhatsApp
                </span>
              </div>
              <span className="text-[11px] text-slate-500">14:20</span>
            </div>
            <p className="text-xs text-slate-400 line-clamp-1 mb-2">
              Vocês emitem nota fiscal para pessoa jurídica?
            </p>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Aguardando</span>
            </div>
          </div>

          {/* Item 3: Juliana Mendes */}
          <div className="p-3.5 hover:bg-white/5 cursor-pointer transition-colors">
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-slate-200">Juliana Mendes</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-pink-500/10 text-pink-400">
                  Instagram
                </span>
              </div>
              <span className="text-[11px] text-slate-500">13:58</span>
            </div>
            <p className="text-xs text-slate-400 line-clamp-1 mb-2">
              Gostaria de agendar uma demonstração do sistema...
            </p>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400">Novo Lead</span>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="p-2.5 border-t border-white/5 bg-[#0a0e17] text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>WebSocket: Conectado</span>
          </div>
          <span>Poli Realtime</span>
        </div>
      </section>

      {/* 3. Center Active Chat Canvas (flex-1) */}
      <main className="flex-1 h-full bg-[#090d16] flex flex-col relative min-w-0">
        {/* Chat Header */}
        <header className="h-16 px-6 border-b border-white/5 flex items-center justify-between bg-[#0f131c]/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center font-bold text-sm text-indigo-300">
              MS
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-white">Mariana Silva</h3>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-medium">
                  WhatsApp Oficial
                </span>
              </div>
              <p className="text-[11px] text-slate-400">TechCorp Soluções Digitais • Atribuído a: Lucas R.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>SLA Resposta: 42s</span>
            </div>
            <button className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Resolver</span>
            </button>
          </div>
        </header>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="text-center">
            <span className="text-[11px] px-3 py-1 rounded-full bg-white/5 text-slate-400">
              Hoje, 24 de Outubro
            </span>
          </div>

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.senderType === 'agent' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-baseline gap-2 mb-1 px-1">
                <span className="text-xs font-medium text-slate-400">{msg.sender}</span>
                <span className="text-[10px] text-slate-500">{msg.time}</span>
              </div>
              <div
                className={`max-w-xl p-3.5 rounded-2xl text-sm leading-relaxed ${
                  msg.senderType === 'agent'
                    ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-600/20'
                    : 'bg-[#181b25] text-slate-200 rounded-tl-sm border border-white/10'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* AI Copilot Suggestion Box */}
          <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 backdrop-blur-md shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
                <Sparkles className="w-4 h-4" />
                <span>Sugestão de IA (Qwen / Poli Agent)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                  98% de precisão
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-300 mb-3">
              Gerar link de checkout seguro do Plano Pro (R$ 890,00) via gateway integrado com 1 clique.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleApplyAISuggestion}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Inserir Sugestão
              </button>
              <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs transition-colors">
                Regerar
              </button>
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="p-4 bg-[#0f131c] border-t border-white/5">
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div className="relative">
              <textarea
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Digite uma mensagem ou digite '/' para templates de respostas rápidas..."
                className="w-full h-20 p-3 bg-[#0a0e17] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-slate-400">
                <button type="button" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                  <Paperclip className="w-4 h-4" />
                </button>
                <button type="button" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                  <Mic className="w-4 h-4" />
                </button>
                <button type="button" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                  <Smile className="w-4 h-4" />
                </button>
                <button type="button" className="p-2 hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1 text-xs">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Templates (/)</span>
                </button>
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/30"
              >
                <span>Enviar</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* 4. Right Panel (Contextual CRM & Contact Inspector - 340px) */}
      <aside className="w-[340px] h-full bg-[#0a0e17] border-l border-white/5 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-white/5 text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 mx-auto flex items-center justify-center text-xl font-bold text-white mb-3 shadow-lg shadow-indigo-600/20">
            MS
          </div>
          <h4 className="font-bold text-white text-base">Mariana Silva</h4>
          <p className="text-xs text-slate-400 mt-0.5">Head de Operações na TechCorp</p>

          <div className="flex justify-center gap-2 mt-4">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
              VIP
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
              Lead Quente
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
              Plano Pro
            </span>
          </div>
        </div>

        {/* CRM Context */}
        <div className="p-5 space-y-6">
          {/* Contact Details */}
          <div>
            <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Contato & Empresa
            </h5>
            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>+55 (11) 98765-4321</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>mariana@techcorp.com.br</span>
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                <span>TechCorp Soluções Digitais Ltda.</span>
              </div>
            </div>
          </div>

          {/* CRM Deal / Pipeline */}
          <div className="p-3.5 rounded-xl bg-[#181b25] border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Upgrade Plano Pro (10 licenças)</span>
              <span className="text-emerald-400 font-bold">R$ 10.680/ano</span>
            </div>
            <p className="text-[11px] text-slate-400">Fase: Proposta enviada (4/5 etapas)</p>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div className="w-4/5 h-full bg-indigo-500 rounded-full" />
            </div>
          </div>

          {/* Internal Notes */}
          <div>
            <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Nota Interna
            </h5>
            <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-xs text-slate-300 italic">
              "Lead altamente interessada em fechar hoje antes do final do mês. Desconto autorizado de até 5% se for pagamento anual antecipado."
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
