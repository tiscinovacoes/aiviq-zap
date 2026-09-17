'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  IdCard,
  UserCheck,
  FileText,
  Inbox,
  CheckCircle2,
  CalendarClock,
  Plus,
  MessageSquare,
  Loader2,
  BarChart3,
} from 'lucide-react';
import NavigationRail from '@/components/layout/NavigationRail';
import { crmService } from '@/services/crmService';
import { Contact, Protocolo, ProtocoloStatus, TipoManifestacao, Prioridade } from '@/types';

const statusConfig: Record<ProtocoloStatus, { label: string; cls: string }> = {
  aberto: { label: 'Aberto', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  em_analise: { label: 'Em Análise', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  em_atendimento: { label: 'Em Atendimento', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  aguardando_cidadao: { label: 'Aguardando Cidadão', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  resolvido: { label: 'Resolvido', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  arquivado: { label: 'Arquivado', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const tipoLabel: Record<TipoManifestacao, string> = {
  denuncia: 'Denúncia',
  reclamacao: 'Reclamação',
  solicitacao: 'Solicitação',
  sugestao: 'Sugestão',
  elogio: 'Elogio',
  informacao: 'Acesso à Informação',
};

const prioridadeConfig: Record<Prioridade, { label: string; cls: string }> = {
  baixa: { label: 'Baixa', cls: 'text-slate-500' },
  media: { label: 'Média', cls: 'text-blue-600' },
  alta: { label: 'Alta', cls: 'text-orange-600' },
  urgente: { label: 'Urgente', cls: 'text-rose-600' },
};

const hoje = new Date().toISOString().slice(0, 10);
const isOverdue = (due?: string, status?: ProtocoloStatus) =>
  !!due && due < hoje && status !== 'resolvido' && status !== 'arquivado';

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

export default function CitizenCRMPage() {
  const params = useParams();
  const id = String(params?.id || '');

  const [contact, setContact] = useState<Contact | null>(null);
  const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
  const [resumo, setResumo] = useState({ total: 0, abertos: 0, resolvidos: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  type NotaInterna = { text: string; at?: string; by?: string };
  const [notes, setNotes] = useState<NotaInterna[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    crmService
      .getCitizen(id)
      .then((data) => {
        if (!active) return;
        setContact(data.contact);
        setProtocolos(data.protocolos);
        setResumo(data.resumo || { total: 0, abertos: 0, resolvidos: 0 });
        // Observações internas persistidas em custom_attributes.notes.
        const rawNotes = (data.contact as any)?.custom_attributes?.notes;
        if (Array.isArray(rawNotes)) {
          setNotes(
            rawNotes.map((n: any) =>
              typeof n === 'string' ? { text: n } : { text: n?.text ?? '', at: n?.at, by: n?.by }
            )
          );
        }
      })
      .catch(() => active && setNotFound(true))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newNote.trim();
    if (!text || savingNote) return;

    setSavingNote(true);
    setNoteError(null);
    // Atualização otimista.
    const optimistic: NotaInterna = { text, at: new Date().toISOString() };
    const previous = notes;
    setNotes([optimistic, ...notes]);
    setNewNote('');

    try {
      const updated = await crmService.addContactNote(id, text);
      // Sincroniza com o que o banco devolveu (autoridade), quando disponível.
      const rawNotes = (updated as any)?.custom_attributes?.notes;
      if (Array.isArray(rawNotes)) {
        setNotes(
          rawNotes.map((n: any) =>
            typeof n === 'string' ? { text: n } : { text: n?.text ?? '', at: n?.at, by: n?.by }
          )
        );
      }
    } catch (err: any) {
      // Rollback + restaura o texto para nova tentativa.
      setNotes(previous);
      setNewNote(text);
      setNoteError('Não foi possível salvar a observação. Tente novamente.');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <NavigationRail />

      <main className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
        {/* Header */}
        <header className="h-16 px-8 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href="/contacts"
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Voltar para Cidadãos"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="font-bold text-base text-slate-900">Ficha do Cidadão (CRM 360º)</h1>
              <p className="text-xs text-slate-500">Histórico unificado de manifestações e atendimento</p>
            </div>
          </div>
          <Link
            href="/inbox"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Atender no Inbox</span>
          </Link>
        </header>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span className="text-xs">Carregando ficha...</span>
          </div>
        ) : notFound || !contact ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <p className="text-sm">Cidadão não encontrado.</p>
            <Link href="/contacts" className="text-emerald-700 text-xs font-semibold hover:underline">
              Voltar para a lista de cidadãos
            </Link>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 lg:p-8">
            <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ===== Coluna esquerda: perfil ===== */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs text-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-200 mx-auto flex items-center justify-center text-2xl font-bold text-emerald-700 mb-3">
                    {contact.name.slice(0, 2).toUpperCase()}
                  </div>
                  <h2 className="font-bold text-slate-900 text-lg">{contact.name}</h2>
                  <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
                    {contact.tags?.map((t) => (
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

                  <div className="mt-5 space-y-3 text-left text-xs text-slate-700">
                    <div className="flex items-center gap-2">
                      <IdCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{contact.cpf || 'CPF não informado'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{contact.bairro || 'Bairro não informado'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{contact.phone || 'Telefone não informado'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="break-all">{contact.email || 'E-mail não informado'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Responsável: {contact.assigned_to || 'Ouvidoria'}</span>
                    </div>
                  </div>
                </div>

                {/* Cartão de Voto / Pesquisa Eleitoral se presente */}
                {(contact.custom_attributes?.origem?.includes('Pesquisa') || contact.custom_attributes?.voto1) && (
                  <div className="bg-gradient-to-br from-indigo-50/90 to-purple-50/70 border border-indigo-200 rounded-2xl p-5 shadow-xs text-left">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                          <BarChart3 className="w-4 h-4" />
                        </div>
                        <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                          Pesquisa Senado MS 2026
                        </h3>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase tracking-wider">
                        {contact.custom_attributes.etapa || 'Registrado'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-white border border-indigo-100 flex items-center justify-between shadow-2xs">
                        <span className="text-slate-500 font-medium">1º Voto:</span>
                        <span className="font-bold text-indigo-900">
                          {contact.custom_attributes.voto1 || 'Aguardando voto'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-indigo-100 flex items-center justify-between shadow-2xs">
                        <span className="text-slate-500 font-medium">2º Voto:</span>
                        <span className="font-bold text-purple-900">
                          {contact.custom_attributes.voto2 || 'Aguardando voto'}
                        </span>
                      </div>
                      {contact.custom_attributes.atualizadoEm && (
                        <p className="text-[10px] text-slate-400 text-right pt-1">
                          Última atualização: {new Date(contact.custom_attributes.atualizadoEm).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Resumo */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-xs">
                    <FileText className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                    <p className="text-lg font-bold text-slate-900">{resumo.total}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Protocolos</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-xs">
                    <Inbox className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-blue-700">{resumo.abertos}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Em aberto</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-emerald-700">{resumo.resolvidos}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Resolvidos</p>
                  </div>
                </div>

                {/* Observações internas */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                  <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Observações Internas
                  </h3>
                  <form onSubmit={addNote} className="space-y-2 mb-3">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Registrar uma observação sobre o cidadão..."
                      className="w-full h-16 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 placeholder-slate-400 resize-none focus:outline-none focus:border-emerald-500 focus:bg-white"
                    />
                    {noteError && (
                      <p className="text-[11px] text-rose-600">{noteError}</p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingNote || !newNote.trim()}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-md shadow-xs flex items-center gap-1.5"
                      >
                        {savingNote && <Loader2 className="w-3 h-3 animate-spin" />}
                        <span>{savingNote ? 'Salvando...' : 'Salvar'}</span>
                      </button>
                    </div>
                  </form>
                  {notes.length === 0 ? (
                    <p className="text-[11px] text-slate-400">Nenhuma observação ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {notes.map((n, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                          <p>"{n.text}"</p>
                          {n.at && (
                            <p className="mt-1 text-[10px] text-slate-400">
                              {new Date(n.at).toLocaleString('pt-BR')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ===== Coluna direita: protocolos ===== */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900">
                    Protocolos do Cidadão <span className="text-slate-400 font-medium">({protocolos.length})</span>
                  </h3>
                  <Link
                    href="/crm"
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Protocolo</span>
                  </Link>
                </div>

                {protocolos.length === 0 ? (
                  <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-sm">
                    Este cidadão ainda não possui protocolos registrados.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {protocolos.map((p) => {
                      const overdue = isOverdue(p.due_date, p.status);
                      return (
                        <div
                          key={p.id}
                          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-emerald-500/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                                {p.protocol_number}
                              </span>
                              <span className="text-[10px] text-slate-500">{tipoLabel[p.tipo_manifestacao]}</span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusConfig[p.status]?.cls}`}
                            >
                              {statusConfig[p.status]?.label}
                            </span>
                          </div>

                          <h4 className="font-semibold text-sm text-slate-900 mb-2 leading-snug">{p.title}</h4>

                          <div className="flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
                            {p.orgao_responsavel && (
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3 text-slate-400" />
                                {p.orgao_responsavel}
                              </span>
                            )}
                            <span className={`flex items-center gap-1 ${overdue ? 'text-rose-600 font-medium' : ''}`}>
                              <CalendarClock className="w-3 h-3" />
                              {overdue ? 'Vencido ' : 'Prazo '}
                              {formatDate(p.due_date)}
                            </span>
                            <span className={`font-semibold ${prioridadeConfig[p.prioridade]?.cls}`}>
                              {prioridadeConfig[p.prioridade]?.label}
                            </span>
                            <span className="text-slate-400">Resp: {p.assignee_name || 'Ouvidoria'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
