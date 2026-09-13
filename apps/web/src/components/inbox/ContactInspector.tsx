'use client';

import React, { useState } from 'react';
import { Phone, Mail, MapPin, Plus, FileText } from 'lucide-react';
import { useInboxStore } from '@/store/useInboxStore';

export default function ContactInspector() {
  const { activeConversation } = useInboxStore();
  const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'protocolos'>('details');
  const [notes, setNotes] = useState<string[]>([
    'Cidadã relatou recorrência do problema há três semanas. Encaminhar prioridade à Secretaria responsável e retornar com previsão de atendimento.',
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
    <aside className="w-[340px] h-full bg-white border-l border-slate-200 flex flex-col overflow-y-auto">
      {/* Profile Header */}
      <div className="p-5 border-b border-slate-200 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 mx-auto flex items-center justify-center text-xl font-bold text-emerald-700 mb-3 shadow-xs">
          {contact?.name.slice(0, 2).toUpperCase() || 'CX'}
        </div>
        <h4 className="font-bold text-slate-900 text-base">{contact?.name}</h4>
        <p className="text-xs text-slate-500 mt-0.5">{custom.cargo || 'Cidadão cadastrado'}</p>

        {/* Tags */}
        <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
          {contact?.tags?.map((t) => (
            <span
              key={t}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                t === 'Urgente'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50 text-xs">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 py-2.5 text-center font-medium transition-colors ${
            activeTab === 'details'
              ? 'text-emerald-700 border-b-2 border-emerald-600 bg-white font-semibold'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Detalhes
        </button>
        <button
          onClick={() => setActiveTab('protocolos')}
          className={`flex-1 py-2.5 text-center font-medium transition-colors ${
            activeTab === 'protocolos'
              ? 'text-emerald-700 border-b-2 border-emerald-600 bg-white font-semibold'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Protocolos
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-2.5 text-center font-medium transition-colors ${
            activeTab === 'notes'
              ? 'text-emerald-700 border-b-2 border-emerald-600 bg-white font-semibold'
              : 'text-slate-500 hover:text-slate-900'
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
                Informações do Cidadão
              </h5>
              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{contact?.phone || 'Não informado'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{contact?.email || 'Não informado'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{contact?.bairro || custom.bairro || 'Bairro não informado'}</span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="text-slate-900 font-semibold">Canal de Atendimento:</p>
              <p>WhatsApp Cloud API Oficial</p>
              <p className="text-[11px] text-slate-400">Número ID: 1049281928374</p>
            </div>
          </div>
        )}

        {activeTab === 'protocolos' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 line-clamp-1">
                  {custom.protocolo_assunto || 'Iluminação pública queimada'}
                </span>
                <span className="font-mono text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                  {custom.protocolo_numero || '2026-000104'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Situação: {custom.protocolo_status || 'Em Atendimento'} (3/5 etapas)
              </p>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="w-3/5 h-full bg-emerald-600 rounded-full" />
              </div>
            </div>

            <div className="p-3 rounded-lg border border-dashed border-slate-300 text-center">
              <button className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold">
                + Abrir Novo Protocolo
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
                  className="text-emerald-700 hover:text-emerald-800 text-xs flex items-center gap-1 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              )}
            </div>

            {isAddingNote && (
              <form onSubmit={handleAddNote} className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Escreva uma nota confidencial..."
                  className="w-full h-16 bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 placeholder-slate-400 resize-none focus:outline-none focus:border-emerald-500"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsAddingNote(false)}
                    className="px-2 py-1 text-slate-500 hover:text-slate-800 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md shadow-xs"
                  >
                    Salvar Nota
                  </button>
                </div>
              </form>
            )}

            {notes.map((note, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                "{note}"
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
