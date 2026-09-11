'use client';

import React, { useState } from 'react';
import { Phone, Mail, Briefcase, Plus, Tag, FileText } from 'lucide-react';
import { useInboxStore } from '@/store/useInboxStore';

export default function ContactInspector() {
  const { activeConversation } = useInboxStore();
  const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'deals'>('details');
  const [notes, setNotes] = useState<string[]>([
    'Lead altamente interessada em fechar hoje antes do final do mês. Desconto autorizado de até 5% se for pagamento anual.',
  ]);
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  if (!activeConversation) return null;

  const contact = activeConversation.contact;
  const custom = contact?.custom_attributes || {};

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setNotes([newNote.trim(), ...notes]);
    setNewNote('');
    setIsAddingNote(false);
  };

  return (
    <aside className="w-[340px] h-full bg-[#0a0e17] border-l border-white/5 flex flex-col overflow-y-auto">
      {/* Profile Header */}
      <div className="p-5 border-b border-white/5 text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 mx-auto flex items-center justify-center text-xl font-bold text-white mb-3 shadow-lg shadow-indigo-600/20">
          {contact?.name.slice(0, 2).toUpperCase() || 'CX'}
        </div>
        <h4 className="font-bold text-white text-base">{contact?.name}</h4>
        <p className="text-xs text-slate-400 mt-0.5">{custom.cargo || 'Cliente Cadastrado'}</p>

        {/* Tags */}
        <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
          {contact?.tags?.map((t) => (
            <span
              key={t}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                t === 'VIP'
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                  : t === 'Lead Quente'
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                  : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 bg-[#0f131c] text-xs">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 py-2.5 text-center font-medium transition-colors ${
            activeTab === 'details'
              ? 'text-indigo-400 border-b-2 border-indigo-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Detalhes
        </button>
        <button
          onClick={() => setActiveTab('deals')}
          className={`flex-1 py-2.5 text-center font-medium transition-colors ${
            activeTab === 'deals'
              ? 'text-indigo-400 border-b-2 border-indigo-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          CRM / Deals
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-2.5 text-center font-medium transition-colors ${
            activeTab === 'notes'
              ? 'text-indigo-400 border-b-2 border-indigo-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Notas ({notes.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-5 space-y-6 flex-1">
        {activeTab === 'details' && (
          <div className="space-y-4">
            <div>
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Informações de Contato
              </h5>
              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <span>{contact?.phone || 'Não informado'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>{contact?.email || 'Não informado'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                  <span>{custom.empresa || 'Pessoa Física'}</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-slate-400 space-y-1">
              <p className="text-white font-medium">Canal de Atendimento:</p>
              <p>WhatsApp Cloud API Oficial</p>
              <p className="text-[11px] text-slate-500">Número ID: 1049281928374</p>
            </div>
          </div>
        )}

        {activeTab === 'deals' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#181b25] border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Upgrade Plano Pro (10 licenças)</span>
                <span className="text-emerald-400 font-bold">{custom.deal_value || 'R$ 10.680/ano'}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Fase: {custom.deal_stage || 'Proposta Enviada'} (4/5 etapas)
              </p>
              <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                <div className="w-4/5 h-full bg-indigo-500 rounded-full" />
              </div>
            </div>

            <div className="p-3 rounded-lg border border-dashed border-white/10 text-center">
              <button className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
                + Criar Nova Oportunidade
              </button>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Anotações Internas
              </h5>
              {!isAddingNote && (
                <button
                  onClick={() => setIsAddingNote(true)}
                  className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              )}
            </div>

            {isAddingNote && (
              <form onSubmit={handleAddNote} className="space-y-2 bg-[#181b25] p-2.5 rounded-xl border border-white/10">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Escreva uma nota confidencial..."
                  className="w-full h-16 bg-[#0a0e17] border border-white/10 rounded-lg p-2 text-xs text-white placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsAddingNote(false)}
                    className="px-2 py-1 text-slate-400 hover:text-white text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-md"
                  >
                    Salvar Nota
                  </button>
                </div>
              </form>
            )}

            {notes.map((note, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-white/5 border border-white/5 text-xs text-slate-300 leading-relaxed">
                "{note}"
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
