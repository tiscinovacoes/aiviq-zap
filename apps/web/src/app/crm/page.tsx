'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Inbox,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Users,
  MapPin,
  CalendarClock,
  Loader2,
  GripVertical,
  Vote,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import NavigationRail from '@/components/layout/NavigationRail';
import PesquisaSenadoKanban from '@/components/crm/PesquisaSenadoKanban';
import { useCRMStore } from '@/store/useCRMStore';
import { Protocolo, ProtocoloStatus, TipoManifestacao, Prioridade } from '@/types';

// ── Configs compartilhados entre o card e o board ──────────────────────────
const tipoConfig: Record<TipoManifestacao, { label: string; cls: string }> = {
  denuncia: { label: 'Denúncia', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  reclamacao: { label: 'Reclamação', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  solicitacao: { label: 'Solicitação', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  sugestao: { label: 'Sugestão', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  elogio: { label: 'Elogio', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  informacao: { label: 'Acesso à Informação', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const prioridadeConfig: Record<Prioridade, { label: string; cls: string }> = {
  baixa: { label: 'Baixa', cls: 'text-slate-500' },
  media: { label: 'Média', cls: 'text-blue-600' },
  alta: { label: 'Alta', cls: 'text-orange-600' },
  urgente: { label: 'Urgente', cls: 'text-rose-600' },
};

const hojeISO = () => new Date().toISOString().slice(0, 10);
const isOverdue = (due?: string, status?: ProtocoloStatus) =>
  !!due && due < hojeISO() && status !== 'resolvido' && status !== 'arquivado';
const formatDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

// ── Conteúdo visual do card (reaproveitado no DragOverlay) ─────────────────
function ProtocoloCardContent({ p }: { p: Protocolo }) {
  const overdue = isOverdue(p.due_date, p.status);
  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
          {p.protocol_number}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${tipoConfig[p.tipo_manifestacao]?.cls}`}
        >
          {tipoConfig[p.tipo_manifestacao]?.label}
        </span>
      </div>

      <h4 className="font-bold text-xs text-slate-900 line-clamp-2 mb-2">{p.title}</h4>

      <div className="space-y-1 text-[11px] text-slate-500 mb-3">
        <Link
          href={`/contacts/${p.contact_id}`}
          className="flex items-center gap-1.5 text-slate-700 font-medium hover:text-emerald-700 transition-colors"
          title="Ver ficha do cidadão"
          onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
        >
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span className="line-clamp-1">{p.contact?.name || 'Cidadão não identificado'}</span>
        </Link>
        {(p.bairro || p.contact?.bairro) && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span className="line-clamp-1">{p.bairro || p.contact?.bairro}</span>
          </div>
        )}
        {p.orgao_responsavel && (
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span className="line-clamp-1">{p.orgao_responsavel}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] mb-3">
        <div
          className={`flex items-center gap-1 font-medium ${
            overdue ? 'text-rose-600' : 'text-slate-400'
          }`}
        >
          <CalendarClock className="w-3 h-3" />
          <span>
            {overdue ? 'Vencido ' : 'Prazo '}
            {formatDate(p.due_date)}
          </span>
        </div>
        <span className={`font-semibold ${prioridadeConfig[p.prioridade]?.cls}`}>
          {prioridadeConfig[p.prioridade]?.label}
        </span>
      </div>
    </>
  );
}

// ── Card arrastável (drag handle isolado para não bloquear links/botões) ───
function KanbanCard({
  p,
  columns,
  onAdvance,
}: {
  p: Protocolo;
  columns: { id: ProtocoloStatus; label: string }[];
  onAdvance: (p: Protocolo) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  const idx = columns.findIndex((c) => c.id === p.status);
  const isLast = idx === columns.length - 1;

  return (
    <div
      ref={setNodeRef}
      className={`p-4 rounded-xl bg-white border border-slate-200 hover:border-emerald-500/50 hover:shadow-xs transition-all shadow-2xs group relative ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Arrastar protocolo"
          className="mt-0.5 -ml-1 shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <ProtocoloCardContent p={p} />

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
            <span className="text-slate-400 line-clamp-1">Resp: {p.assignee_name || 'Ouvidoria'}</span>

            {!isLast && (
              <button
                onClick={() => onAdvance(p)}
                onPointerDown={(e) => e.stopPropagation()}
                title="Avançar para a próxima situação"
                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 rounded flex items-center gap-1 font-semibold transition-colors shrink-0"
              >
                <span>Avançar</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Coluna que recebe o drop ───────────────────────────────────────────────
function KanbanColumn({
  col,
  protocolos,
  columns,
  onAdvance,
}: {
  col: { id: ProtocoloStatus; label: string };
  protocolos: Protocolo[];
  columns: { id: ProtocoloStatus; label: string }[];
  onAdvance: (p: Protocolo) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const colProtocolos = protocolos.filter((p) => p.status === col.id);

  return (
    <div
      className={`w-80 bg-slate-100/70 border rounded-2xl flex flex-col max-h-full shrink-0 shadow-2xs transition-colors ${
        isOver ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200'
      }`}
    >
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white/70 rounded-t-2xl">
        <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">{col.label}</h3>
        <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs border border-slate-300/60">
          {colProtocolos.length}
        </span>
      </div>

      <div ref={setNodeRef} className="p-3.5 overflow-y-auto flex-1 space-y-3 min-h-[80px]">
        {colProtocolos.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-white/40 font-medium">
            {isOver ? 'Solte aqui' : 'Nenhum protocolo'}
          </div>
        ) : (
          colProtocolos.map((p) => (
            <KanbanCard key={p.id} p={p} columns={columns} onAdvance={onAdvance} />
          ))
        )}
      </div>
    </div>
  );
}

export default function CRMPage() {
  const {
    protocolos,
    metrics,
    fetchProtocolos,
    moveProtocoloStatus,
    addProtocolo,
    isLoading,
  } = useCRMStore();

  const [moduloAtivo, setModuloAtivo] = useState<'ouvidoria' | 'pesquisa_senado'>('pesquisa_senado');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [tipo, setTipo] = useState<TipoManifestacao>('solicitacao');
  const [categoria, setCategoria] = useState('');
  const [orgao, setOrgao] = useState('');
  const [bairro, setBairro] = useState('');
  const [prioridade, setPrioridade] = useState<Prioridade>('media');
  const [statusInput, setStatusInput] = useState<ProtocoloStatus>('aberto');
  const [contactName, setContactName] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    fetchProtocolos();
  }, [fetchProtocolos]);

  const columns: { id: ProtocoloStatus; label: string }[] = [
    { id: 'aberto', label: '1. Aberto' },
    { id: 'em_analise', label: '2. Em Análise' },
    { id: 'em_atendimento', label: '3. Em Atendimento' },
    { id: 'aguardando_cidadao', label: '4. Aguardando Cidadão' },
    { id: 'resolvido', label: '5. Resolvido' },
  ];

  // ── Drag & drop (dnd-kit) ────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    // 6px de tolerância para não disparar drag em cliques (links/botões)
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const activeProtocolo = activeId ? protocolos.find((p) => p.id === activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const protocoloId = String(active.id);
    const targetStatus = over.id as ProtocoloStatus;
    const dragged = protocolos.find((p) => p.id === protocoloId);
    if (dragged && dragged.status !== targetStatus) {
      moveProtocoloStatus(protocoloId, targetStatus);
    }
  };

  const advanceProtocolo = (p: Protocolo) => {
    const idx = columns.findIndex((c) => c.id === p.status);
    if (idx > -1 && idx < columns.length - 1) {
      moveProtocoloStatus(p.id, columns[idx + 1].id);
    }
  };

  const handleCreateProtocolo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await addProtocolo({
      title: title.trim(),
      tipo_manifestacao: tipo,
      categoria: categoria.trim() || undefined,
      orgao_responsavel: orgao.trim() || undefined,
      bairro: bairro.trim() || undefined,
      prioridade,
      status: statusInput,
      due_date: dueDate || undefined,
      contact_name: contactName.trim() || undefined,
      assignee_name: 'Equipe de Ouvidoria',
    });

    setTitle('');
    setCategoria('');
    setOrgao('');
    setBairro('');
    setContactName('');
    setDueDate('');
    setTipo('solicitacao');
    setPrioridade('media');
    setStatusInput('aberto');
    setIsModalOpen(false);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden font-sans select-none">
      {/* Left Navigation Rail */}
      <NavigationRail />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
        {/* Top Header com Tabs de Módulo */}
        <header className="h-16 px-8 border-b border-slate-200 flex items-center justify-between bg-white/95 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setModuloAtivo('pesquisa_senado')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                  moduloAtivo === 'pesquisa_senado'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Vote className="w-4 h-4 text-emerald-600" />
                <span>Pesquisa Senado MS 2026</span>
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-emerald-100 text-emerald-800 uppercase">
                  Robô Ativo
                </span>
              </button>

              <button
                onClick={() => setModuloAtivo('ouvidoria')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                  moduloAtivo === 'ouvidoria'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>Protocolos Ouvidoria</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {moduloAtivo === 'ouvidoria' && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Protocolo</span>
              </button>
            )}
          </div>
        </header>

        {moduloAtivo === 'pesquisa_senado' ? (
          <PesquisaSenadoKanban />
        ) : (
          <>

        {/* Hero KPIs Bar */}
        <div className="px-8 py-4 bg-white border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">Total de Protocolos</span>
              <FileText className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-lg font-bold text-slate-900">{metrics.totalProtocolos}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Registrados no período</p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">Em Aberto</span>
              <Inbox className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-lg font-bold text-blue-700">{metrics.abertos}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Aguardando tramitação</p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">Resolvidos</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-lg font-bold text-emerald-700">{metrics.resolvidos}</p>
            <p className="text-[11px] text-emerald-600/90 mt-0.5 font-medium">
              Taxa de resolução: {metrics.taxaResolucao}
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">Fora do Prazo</span>
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-lg font-bold text-rose-700">{metrics.foraDoPrazo}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Prazo/SLA vencido</p>
          </div>
        </div>

        {/* Kanban Board */}
        {isLoading && protocolos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span className="text-xs">Carregando protocolos...</span>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="flex-1 overflow-x-auto p-6 flex gap-5 items-start bg-slate-50">
              {columns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  protocolos={protocolos}
                  columns={columns}
                  onAdvance={advanceProtocolo}
                />
              ))}
            </div>

            <DragOverlay>
              {activeProtocolo ? (
                <div className="w-72 p-4 rounded-xl bg-white border border-emerald-400 shadow-lg rotate-2 cursor-grabbing">
                  <ProtocoloCardContent p={activeProtocolo} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
          </>
        )}
      </main>

      {/* Modal Novo Protocolo */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              <span>Abrir Novo Protocolo</span>
            </h3>

            <form onSubmit={handleCreateProtocolo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Assunto da Manifestação *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Buraco na via da Rua das Acácias"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Tipo de Manifestação
                  </label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoManifestacao)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  >
                    <option value="solicitacao">Solicitação</option>
                    <option value="reclamacao">Reclamação</option>
                    <option value="denuncia">Denúncia</option>
                    <option value="sugestao">Sugestão</option>
                    <option value="elogio">Elogio</option>
                    <option value="informacao">Acesso à Informação</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Prioridade
                  </label>
                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value as Prioridade)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Categoria / Tema
                  </label>
                  <input
                    type="text"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    placeholder="Ex: Iluminação, Saúde"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Órgão Responsável
                  </label>
                  <input
                    type="text"
                    value={orgao}
                    onChange={(e) => setOrgao(e.target.value)}
                    placeholder="Ex: Secretaria de Obras"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Cidadão
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Nome do cidadão"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Bairro
                  </label>
                  <input
                    type="text"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    placeholder="Ex: Centro"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Prazo (SLA)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Situação Inicial
                  </label>
                  <select
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value as ProtocoloStatus)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  >
                    <option value="aberto">1. Aberto</option>
                    <option value="em_analise">2. Em Análise</option>
                    <option value="em_atendimento">3. Em Atendimento</option>
                    <option value="aguardando_cidadao">4. Aguardando Cidadão</option>
                    <option value="resolvido">5. Resolvido</option>
                  </select>
                </div>
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
                  Abrir Protocolo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
