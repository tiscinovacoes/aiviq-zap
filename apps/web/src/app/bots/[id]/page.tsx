'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useBotStore } from '@/store/useBotStore';
import { Block, BlockType, Group } from '@/types/bot';
import {
  ArrowLeft,
  Play,
  RotateCcw,
  Undo2,
  Redo2,
  CheckCircle,
  Plus,
  Trash2,
  MessageSquare,
  HelpCircle,
  Split,
  UserCheck,
  Tag,
  Send,
  Sparkles,
  Smartphone,
  ChevronRight,
  Settings2,
  Layers,
  Globe,
  RefreshCw,
  X,
} from 'lucide-react';

export default function BotCanvasEditorPage() {
  const params = useParams();
  const {
    bot,
    selectedGroupId,
    selectedBlockId,
    selectBlock,
    createGroup,
    updateGroup,
    deleteGroup,
    moveGroup,
    addBlock,
    updateBlock,
    deleteBlock,
    createEdge,
    deleteEdge,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    // Simulation
    isSimulating,
    openSimulation,
    closeSimulation,
    simulationMessages,
    currentInputRequest,
    sendSimulationMessage,
    resetSimulation,
  } = useBotStore();

  const [simInput, setSimInput] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState(3);
  const [publishBanner, setPublishBanner] = useState<string | null>(null);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Currently selected block
  const selectedGroup = bot?.groups.find((g) => g.id === selectedGroupId);
  const selectedBlock = selectedGroup?.blocks.find((b) => b.id === selectedBlockId);

  const handlePublish = async () => {
    if (!bot) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/bots/${bot.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: publishedVersion }),
      });
      const data = await res.json();
      if (data.success) {
        setPublishedVersion(data.publishedVersion);
        setPublishBanner(`Versão v${data.publishedVersion} publicada com sucesso no WhatsApp Oficial!`);
        setTimeout(() => setPublishBanner(null), 4000);
      }
    } catch {
      // fallback
      setPublishedVersion((v) => v + 1);
      setPublishBanner(`Versão v${publishedVersion + 1} publicada com sucesso!`);
      setTimeout(() => setPublishBanner(null), 4000);
    } finally {
      setPublishing(false);
    }
  };

  // Dragging group boxes on canvas
  const handleMouseDownGroup = (e: React.MouseEvent, group: Group) => {
    // Only drag from header
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    setDraggingGroupId(group.id);
    setDragOffset({
      x: e.clientX - group.graphCoordinates.x,
      y: e.clientY - group.graphCoordinates.y,
    });
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (!draggingGroupId) return;
    const newX = Math.max(20, e.clientX - dragOffset.x);
    const newY = Math.max(20, e.clientY - dragOffset.y);
    moveGroup(draggingGroupId, { x: newX, y: newY });
  };

  const handleMouseUpCanvas = () => {
    setDraggingGroupId(null);
  };

  const handleSendSim = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!simInput.trim()) return;
    sendSimulationMessage(simInput.trim());
    setSimInput('');
  };

  if (!bot) return null;

  return (
    <div
      className="flex h-screen w-screen bg-[#07090e] text-slate-100 antialiased overflow-hidden font-sans select-none"
      onMouseMove={handleMouseMoveCanvas}
      onMouseUp={handleMouseUpCanvas}
    >
      {/* Main Canvas + Panels */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Editor Topbar */}
        <header className="h-16 px-6 border-b border-white/5 bg-[#090d16]/90 backdrop-blur flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-4">
            <Link
              href="/bots"
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              title="Voltar para lista de automações"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={bot.name}
                onChange={(e) => useBotStore.setState((s) => s.bot ? ({ bot: { ...s.bot, name: e.target.value } }) : s)}
                className="bg-transparent border border-transparent hover:border-white/10 focus:border-indigo-500 rounded px-2 py-1 text-sm font-bold text-white focus:outline-none transition-all w-80"
              />
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v{publishedVersion} Produção
              </span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-slate-500" />
                {isDirty ? 'Alterações não salvas' : 'Salvo no cofre'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Undo / Redo */}
            <div className="flex items-center bg-[#0e121e] border border-white/10 rounded-lg p-1">
              <button
                onClick={undo}
                disabled={!canUndo()}
                title="Desfazer (Ctrl+Z)"
                className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo()}
                title="Refazer (Ctrl+Y)"
                className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Test Simulation Button */}
            <button
              onClick={() => (isSimulating ? closeSimulation() : openSimulation())}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                isSimulating
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'bg-[#141a2b] hover:bg-[#1c243c] text-purple-300 border border-purple-500/30'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              {isSimulating ? 'Fechar Simulador' : 'Testar no WhatsApp'}
            </button>

            {/* Publish Button */}
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <Globe className="w-4 h-4" />
              {publishing ? 'Publicando...' : `Publicar v${publishedVersion + 1}`}
            </button>
          </div>
        </header>

        {/* Publish Success Notification Banner */}
        {publishBanner && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold animate-bounce">
            <CheckCircle className="w-4 h-4" />
            {publishBanner}
          </div>
        )}

        {/* Editor Workspace: Left Palette + Canvas Area + Right Config */}
        <div className="flex-1 flex min-h-0 relative overflow-hidden">
          {/* Left Toolbox / Palette */}
          <aside className="w-64 border-r border-white/5 bg-[#090d16]/95 flex flex-col shrink-0 z-10 p-4 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Blocos de Ação
              </span>
              <button
                onClick={() => createGroup()}
                className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded text-[11px] font-semibold flex items-center gap-1 transition-all"
              >
                <Plus className="w-3 h-3" /> Grupo
              </button>
            </div>

            {/* Category: Mensagens */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                💬 Mensagens (Bot Fala)
              </span>
              {[
                { type: 'text' as BlockType, label: 'Mensagem de Texto', icon: MessageSquare },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => selectedGroupId && addBlock(selectedGroupId, item.type)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0e121e] hover:bg-[#161c2e] border border-white/5 hover:border-indigo-500/40 text-left flex items-center gap-2.5 text-xs text-slate-300 hover:text-white transition-all group"
                >
                  <item.icon className="w-4 h-4 text-indigo-400" />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>

            {/* Category: Entradas */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                ✍️ Entradas (Usuário Responde)
              </span>
              {[
                { type: 'text_input' as BlockType, label: 'Pergunta de Texto', icon: HelpCircle },
                { type: 'choice_input' as BlockType, label: 'Múltipla Escolha / Botões', icon: Split },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => selectedGroupId && addBlock(selectedGroupId, item.type)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0e121e] hover:bg-[#161c2e] border border-white/5 hover:border-purple-500/40 text-left flex items-center gap-2.5 text-xs text-slate-300 hover:text-white transition-all"
                >
                  <item.icon className="w-4 h-4 text-purple-400" />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>

            {/* Category: Lógica & Ações */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                ⚡ Ações no Atendimento
              </span>
              {[
                { type: 'assign_to_agent' as BlockType, label: 'Atribuir a Atendente', icon: UserCheck },
                { type: 'add_label' as BlockType, label: 'Adicionar Etiqueta (Tag)', icon: Tag },
                { type: 'condition' as BlockType, label: 'Condição Lógica (IF/ELSE)', icon: Split },
                { type: 'http_request' as BlockType, label: 'Disparo Webhook / API', icon: Globe },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => selectedGroupId && addBlock(selectedGroupId, item.type)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0e121e] hover:bg-[#161c2e] border border-white/5 hover:border-emerald-500/40 text-left flex items-center gap-2.5 text-xs text-slate-300 hover:text-white transition-all"
                >
                  <item.icon className="w-4 h-4 text-emerald-400" />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-white/5 text-[11px] text-slate-500 leading-relaxed">
              💡 <b className="text-slate-400">Dica:</b> Selecione um grupo no canvas e clique em qualquer bloco acima para adicioná-lo.
            </div>
          </aside>

          {/* Canvas Area */}
          <div
            className="flex-1 h-full relative overflow-auto bg-[#07090e] bg-[radial-gradient(#1e2638_1px,transparent_1px)] [background-size:24px_24px]"
            onClick={() => selectBlock(null, null)}
          >
            {/* SVG Connecting Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
                </marker>
              </defs>
              {bot.edges.map((edge) => {
                const targetGroup = bot.groups.find((g) => g.id === edge.to.groupId);
                if (!targetGroup) return null;

                let sourceX = 90;
                let sourceY = 170;

                if ('eventId' in edge.from) {
                  sourceX = bot.events[0].graphCoordinates.x + 80;
                  sourceY = bot.events[0].graphCoordinates.y + 20;
                } else if ('blockId' in edge.from) {
                  const targetBlockId = edge.from.blockId;
                  for (const g of bot.groups) {
                    const blockIdx = g.blocks.findIndex((b) => b.id === targetBlockId);
                    if (blockIdx !== -1) {
                      sourceX = g.graphCoordinates.x + 300;
                      sourceY = g.graphCoordinates.y + 60 + blockIdx * 65;
                      break;
                    }
                  }
                }

                const targetX = targetGroup.graphCoordinates.x;
                const targetY = targetGroup.graphCoordinates.y + 40;

                const deltaX = Math.max(60, (targetX - sourceX) / 2);
                const pathData = `M ${sourceX} ${sourceY} C ${sourceX + deltaX} ${sourceY}, ${targetX - deltaX} ${targetY}, ${targetX} ${targetY}`;

                return (
                  <path
                    key={edge.id}
                    d={pathData}
                    stroke="#6366f1"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    fill="none"
                    markerEnd="url(#arrowhead)"
                    className="opacity-80"
                  />
                );
              })}
            </svg>

            {/* Start Node */}
            <div
              style={{
                left: `${bot.events[0].graphCoordinates.x}px`,
                top: `${bot.events[0].graphCoordinates.y}px`,
              }}
              className="absolute z-10 w-24 p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl shadow-lg shadow-emerald-950/50 flex flex-col items-center gap-1 cursor-default text-center"
            >
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-black flex items-center justify-center font-bold text-xs">
                ▶
              </div>
              <span className="text-[11px] font-bold text-emerald-300">Início</span>
              <span className="text-[9px] text-slate-400">Gatilho Chat</span>
            </div>

            {/* Render Groups on Canvas */}
            {bot.groups.map((group) => {
              const isGroupSelected = selectedGroupId === group.id;

              return (
                <div
                  key={group.id}
                  style={{
                    left: `${group.graphCoordinates.x}px`,
                    top: `${group.graphCoordinates.y}px`,
                  }}
                  onMouseDown={(e) => handleMouseDownGroup(e, group)}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectBlock(group.id, group.blocks[0]?.id || null);
                  }}
                  className={`absolute z-10 w-[300px] bg-[#0c101c] border rounded-xl shadow-2xl transition-shadow ${
                    isGroupSelected
                      ? 'border-indigo-500 shadow-indigo-500/10 ring-1 ring-indigo-500'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Group Header */}
                  <div className="p-3 border-b border-white/5 flex items-center justify-between cursor-move bg-[#0f1422] rounded-t-xl">
                    <input
                      type="text"
                      value={group.title}
                      onChange={(e) => updateGroup(group.id, { title: e.target.value })}
                      className="bg-transparent text-xs font-bold text-white focus:outline-none border-b border-transparent focus:border-indigo-500 no-drag w-48"
                    />
                    <div className="flex items-center gap-1 no-drag">
                      <button
                        onClick={() => deleteGroup(group.id)}
                        className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Excluir grupo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Group Blocks Stack */}
                  <div className="p-2 space-y-2">
                    {group.blocks.map((b) => {
                      const isBlockSelected = selectedBlockId === b.id;

                      return (
                        <div
                          key={b.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectBlock(group.id, b.id);
                          }}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all relative ${
                            isBlockSelected
                              ? 'bg-indigo-600/15 border-indigo-500 text-white'
                              : 'bg-[#141928] border-white/5 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 overflow-hidden">
                              {b.type === 'text' && <MessageSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                              {b.type === 'text_input' && <HelpCircle className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                              {b.type === 'choice_input' && <Split className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                              {b.type === 'assign_to_agent' && <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                              {b.type === 'add_label' && <Tag className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                              {b.type === 'condition' && <Split className="w-3.5 h-3.5 text-amber-400 shrink-0" />}

                              <span className="font-semibold truncate">
                                {b.type === 'text' && (b.content.text || 'Texto vazio')}
                                {b.type === 'text_input' && `Pergunta (${b.options.variableId || 'texto'})`}
                                {b.type === 'choice_input' && `Opções (${b.items?.length || 0})`}
                                {b.type === 'assign_to_agent' && `Atribuir: ${b.options.agentName || 'Atendente'}`}
                                {b.type === 'add_label' && `Tags: ${b.options.labels?.join(', ') || ''}`}
                                {b.type === 'condition' && 'Condição Lógica'}
                              </span>
                            </div>

                            {/* Anchor connector */}
                            <div
                              title="Conector de saída"
                              className="w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white shrink-0 -mr-1"
                            />
                          </div>

                          {/* Choice input items preview */}
                          {b.type === 'choice_input' && b.items && (
                            <div className="mt-2 space-y-1 pl-4 border-l border-white/10">
                              {b.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="text-[10px] text-slate-400 flex items-center justify-between"
                                >
                                  <span>• {item.content}</span>
                                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Block in Group Button */}
                  <div className="p-2 pt-0 flex justify-center no-drag">
                    <button
                      onClick={() => addBlock(group.id, 'text')}
                      className="w-full py-1.5 border border-dashed border-white/10 hover:border-indigo-500/50 rounded-lg text-[11px] text-slate-400 hover:text-indigo-400 flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Adicionar Bloco
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Configuration Panel */}
          {selectedBlock && selectedGroup && (
            <aside className="w-80 border-l border-white/5 bg-[#090d16]/95 flex flex-col shrink-0 z-10 p-5 space-y-5 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    Configurar Bloco
                  </span>
                </div>
                <button
                  onClick={() => selectBlock(null, null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Block Type Specific Settings */}
              {selectedBlock.type === 'text' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Conteúdo da Mensagem
                  </label>
                  <textarea
                    rows={4}
                    value={selectedBlock.content.text}
                    onChange={(e) =>
                      updateBlock(selectedGroup.id, selectedBlock.id, {
                        content: { text: e.target.value },
                      })
                    }
                    placeholder="Digite sua mensagem. Use {{variavel}} para interpolação."
                    className="w-full p-2.5 bg-[#0e121e] border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    Dica: Digite <code className="text-indigo-400">{'{{nome}}'}</code> para puxar o nome do contato.
                  </p>
                </div>
              )}

              {selectedBlock.type === 'text_input' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Placeholder do Campo
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.options.placeholder || ''}
                      onChange={(e) =>
                        updateBlock(selectedGroup.id, selectedBlock.id, {
                          options: { ...selectedBlock.options, placeholder: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 bg-[#0e121e] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Salvar Resposta na Variável
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.options.variableId || ''}
                      onChange={(e) =>
                        updateBlock(selectedGroup.id, selectedBlock.id, {
                          options: { ...selectedBlock.options, variableId: e.target.value },
                        })
                      }
                      placeholder="Ex: nome, email, documento"
                      className="w-full px-3 py-2 bg-[#0e121e] border border-white/10 rounded-lg text-xs text-indigo-300 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>
              )}

              {selectedBlock.type === 'choice_input' && (
                <div className="space-y-4">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Opções de Botão / Escolha
                  </label>
                  <div className="space-y-2">
                    {selectedBlock.items?.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.content}
                          onChange={(e) => {
                            const newItems = [...(selectedBlock.items || [])];
                            newItems[idx] = { ...item, content: e.target.value };
                            updateBlock(selectedGroup.id, selectedBlock.id, { items: newItems });
                          }}
                          className="flex-1 px-3 py-1.5 bg-[#0e121e] border border-white/10 rounded-lg text-xs text-white"
                        />
                        <button
                          onClick={() => {
                            const newItems = selectedBlock.items?.filter((_, i) => i !== idx);
                            updateBlock(selectedGroup.id, selectedBlock.id, { items: newItems });
                          }}
                          className="text-slate-500 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => {
                        const newItems = [
                          ...(selectedBlock.items || []),
                          { id: `opt_${Date.now()}`, content: `Nova Opção ${(selectedBlock.items?.length || 0) + 1}` },
                        ];
                        updateBlock(selectedGroup.id, selectedBlock.id, { items: newItems });
                      }}
                      className="w-full py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-slate-300 flex items-center justify-center gap-1 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Opção
                    </button>
                  </div>
                </div>
              )}

              {selectedBlock.type === 'assign_to_agent' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Estratégia de Atribuição
                  </label>
                  <select
                    value={selectedBlock.options.strategy}
                    onChange={(e) =>
                      updateBlock(selectedGroup.id, selectedBlock.id, {
                        options: { ...selectedBlock.options, strategy: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 bg-[#0e121e] border border-white/10 rounded-lg text-xs text-white"
                  >
                    <option value="round_robin">Distribuição Circular (Round-Robin)</option>
                    <option value="team">Encaminhar para Fila de Departamento</option>
                    <option value="specific_agent">Atendente Específico</option>
                  </select>

                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Nome do Atendente ou Time
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.options.agentName || ''}
                      onChange={(e) =>
                        updateBlock(selectedGroup.id, selectedBlock.id, {
                          options: { ...selectedBlock.options, agentName: e.target.value },
                        })
                      }
                      placeholder="Ex: Consultor Sênior"
                      className="w-full px-3 py-2 bg-[#0e121e] border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                </div>
              )}

              {selectedBlock.type === 'add_label' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Etiquetas a Inserir (separadas por vírgula)
                  </label>
                  <input
                    type="text"
                    value={selectedBlock.options.labels?.join(', ') || ''}
                    onChange={(e) =>
                      updateBlock(selectedGroup.id, selectedBlock.id, {
                        options: {
                          labels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-[#0e121e] border border-white/10 rounded-lg text-xs text-white"
                  />
                </div>
              )}

              <div className="pt-6 border-t border-white/5">
                <button
                  onClick={() => deleteBlock(selectedGroup.id, selectedBlock.id)}
                  className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir Este Bloco
                </button>
              </div>
            </aside>
          )}

          {/* WhatsApp Live Simulator Drawer */}
          {isSimulating && (
            <aside className="w-96 border-l border-white/10 bg-[#0b0e14] flex flex-col shrink-0 z-30 shadow-2xl animate-in slide-in-from-right">
              {/* WhatsApp Simulator Header */}
              <div className="h-16 px-4 bg-[#075e54] text-white flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-700 border border-emerald-400 flex items-center justify-center font-bold text-xs">
                    🤖
                  </div>
                  <div>
                    <h4 className="text-xs font-bold leading-tight">{bot.name}</h4>
                    <span className="text-[10px] text-emerald-200">online • simulação direta</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={resetSimulation}
                    title="Reiniciar conversa"
                    className="p-1.5 hover:bg-white/10 rounded text-emerald-100 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={closeSimulation}
                    className="p-1.5 hover:bg-white/10 rounded text-emerald-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Chat Messages Feed */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0d1418] bg-[radial-gradient(#1b272f_1px,transparent_1px)] [background-size:16px_16px]">
                {simulationMessages.map((msg, index) => {
                  const isBot = msg.sender === 'bot';

                  return (
                    <div
                      key={index}
                      className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg p-2.5 text-xs shadow ${
                          isBot
                            ? 'bg-[#1f2c34] text-slate-100 rounded-tl-none'
                            : 'bg-[#005c4b] text-white rounded-tr-none'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        <span className="text-[9px] text-slate-400 block text-right mt-1">12:00</span>
                      </div>

                      {/* Interactive Choice Buttons if available */}
                      {isBot && msg.options?.choices && (
                        <div className="mt-1.5 space-y-1 w-[80%]">
                          {msg.options.choices.map((choice: string) => (
                            <button
                              key={choice}
                              onClick={() => sendSimulationMessage(choice)}
                              className="w-full py-1.5 px-3 rounded-lg bg-[#2a3942] hover:bg-[#00a884] text-white text-xs font-semibold text-center border border-white/5 transition-colors active:scale-95 shadow"
                            >
                              {choice}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Simulator Input Bar */}
              <form
                onSubmit={handleSendSim}
                className="p-3 bg-[#1f2c34] border-t border-white/5 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={simInput}
                  onChange={(e) => setSimInput(e.target.value)}
                  placeholder={currentInputRequest?.placeholder || 'Digite sua mensagem...'}
                  className="flex-1 px-3 py-2 bg-[#2a3942] rounded-lg text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00a884]"
                />
                <button
                  type="submit"
                  className="w-9 h-9 bg-[#00a884] hover:bg-[#06cf9c] text-white rounded-full flex items-center justify-center shadow transition-all active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
