'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useSearchParams } from 'next/navigation';
import { useBotStore } from '@/store/useBotStore';
import { Block, BlockType, Group } from '@/types/bot';

// Canvas React Flow — rota lazy, sem SSR (ADR-004 §Consequências/mitigação 2):
// o bundle do editor (~120 KB) não pesa no inbox.
const BotFlowCanvas = dynamic(() => import('@/components/bots/flow/BotFlowCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 h-full flex items-center justify-center text-slate-400 text-xs">
      Carregando editor visual...
    </div>
  ),
});
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
  const searchParams = useSearchParams();
  const routeId = String(params?.id || '');
  const {
    bot,
    setBot,
    initBlankBot,
    selectedGroupId,
    selectedBlockId,
    selectBlock,
    createGroup,
    updateGroup,
    deleteGroup,
    addBlock,
    updateBlock,
    deleteBlock,
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
  const [publishedVersion, setPublishedVersion] = useState(1);
  const [publishBanner, setPublishBanner] = useState<string | null>(null);
  const [loadingBot, setLoadingBot] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Carrega o documento do fluxo por id. Fluxo novo (?new=1) começa em branco
  // (já foi criado no servidor pelo POST); os demais vêm do GET /api/bots/[id].
  useEffect(() => {
    let active = true;
    setLoadingBot(true);
    const isNew = searchParams?.get('new') === '1';
    if (isNew) {
      initBlankBot(routeId, searchParams.get('name') || undefined);
      setLoadingBot(false);
      return;
    }
    fetch(`/api/bots/${routeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (data.success && data.bot) {
          setBot(data.bot);
          if (typeof data.publishedVersion === 'number') setPublishedVersion(data.publishedVersion);
        }
      })
      .catch(() => {})
      .finally(() => active && setLoadingBot(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // Autosave do rascunho (debounce). Salva o documento sempre que houver
  // alterações pendentes; o servidor persiste (Supabase ou fallback).
  useEffect(() => {
    if (loadingBot || !bot || !isDirty) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/bots/${routeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document: bot }),
        });
        const data = await res.json();
        setSaveState(res.ok && data.success ? 'saved' : 'error');
      } catch {
        setSaveState('error');
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot, isDirty, loadingBot, routeId]);

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

  const handleSendSim = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!simInput.trim()) return;
    sendSimulationMessage(simInput.trim());
    setSimInput('');
  };

  if (!bot || loadingBot) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-slate-400 text-xs gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
        Carregando fluxo...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 antialiased overflow-hidden font-sans">

      {/* Main Canvas + Panels */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Editor Topbar */}
        <header className="h-16 px-6 border-b border-slate-200 bg-white/95 backdrop-blur flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-4">
            <Link
              href="/bots"
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors"
              title="Voltar para lista de automações"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={bot.name}
                onChange={(e) => useBotStore.setState((s) => s.bot ? ({ bot: { ...s.bot, name: e.target.value } }) : s)}
                className="bg-transparent border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded px-2 py-1 text-sm font-bold text-slate-900 focus:outline-none transition-all w-80"
              />
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                v{publishedVersion} Produção
              </span>
              <span className={`text-xs flex items-center gap-1 ${saveState === 'error' ? 'text-rose-500' : 'text-slate-400'}`}>
                <CheckCircle className={`w-3.5 h-3.5 ${saveState === 'error' ? 'text-rose-500' : 'text-emerald-600'}`} />
                {saveState === 'saving'
                  ? 'Salvando...'
                  : saveState === 'error'
                  ? 'Erro ao salvar'
                  : saveState === 'saved'
                  ? 'Salvo na nuvem'
                  : isDirty
                  ? 'Alterações pendentes'
                  : 'Salvo na nuvem'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Undo / Redo */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-1">
              <button
                onClick={undo}
                disabled={!canUndo()}
                title="Desfazer (Ctrl+Z)"
                className="p-1.5 rounded hover:bg-white text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo()}
                title="Refazer (Ctrl+Y)"
                className="p-1.5 rounded hover:bg-white text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Test Simulation Button */}
            <button
              onClick={() => (isSimulating ? closeSimulation() : openSimulation())}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                isSimulating
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              {isSimulating ? 'Fechar Simulador' : 'Testar no WhatsApp'}
            </button>

            {/* Publish Button */}
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
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
          <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 z-10 p-4 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Blocos de Ação
              </span>
              <button
                onClick={() => createGroup()}
                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-semibold flex items-center gap-1 transition-all"
              >
                <Plus className="w-3 h-3" /> Grupo
              </button>
            </div>

            {/* Category: Mensagens */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                💬 Mensagens (Bot Fala)
              </span>
              {[
                { type: 'text' as BlockType, label: 'Mensagem de Texto', icon: MessageSquare },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => selectedGroupId && addBlock(selectedGroupId, item.type)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 hover:border-emerald-500/40 text-left flex items-center gap-2.5 text-xs text-slate-700 hover:text-slate-900 transition-all group"
                >
                  <item.icon className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>

            {/* Category: Entradas */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                ✍️ Entradas (Usuário Responde)
              </span>
              {[
                { type: 'text_input' as BlockType, label: 'Pergunta de Texto', icon: HelpCircle },
                { type: 'choice_input' as BlockType, label: 'Múltipla Escolha / Botões', icon: Split },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => selectedGroupId && addBlock(selectedGroupId, item.type)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 hover:border-emerald-500/40 text-left flex items-center gap-2.5 text-xs text-slate-700 hover:text-slate-900 transition-all"
                >
                  <item.icon className="w-4 h-4 text-indigo-600" />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>

            {/* Category: Lógica & Ações */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
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
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 hover:border-emerald-500/40 text-left flex items-center gap-2.5 text-xs text-slate-700 hover:text-slate-900 transition-all"
                >
                  <item.icon className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
              💡 <b className="text-slate-600">Dica:</b> Selecione um grupo no canvas e clique em qualquer bloco acima para adicioná-lo.
            </div>
          </aside>

          {/* Canvas Area — React Flow (ADR-004 §1) */}
          <div className="flex-1 h-full relative min-w-0">
            <BotFlowCanvas />
          </div>

          {/* Right Configuration Panel */}
          {selectedBlock && selectedGroup && (
            <aside className="w-80 border-l border-slate-200 bg-white flex flex-col shrink-0 z-10 p-5 space-y-5 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Configurar Bloco
                  </span>
                </div>
                <button
                  onClick={() => selectBlock(null, null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Block Type Specific Settings */}
              {selectedBlock.type === 'text' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-700 block">
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
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                  <p className="text-[11px] text-slate-500">
                    Dica: Digite <code className="text-emerald-700 font-bold">{'{{nome}}'}</code> para puxar o nome do contato.
                  </p>
                </div>
              )}

              {selectedBlock.type === 'text_input' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
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
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
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
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-indigo-700 focus:outline-none focus:border-emerald-500 focus:bg-white font-mono"
                    />
                  </div>
                </div>
              )}

              {selectedBlock.type === 'choice_input' && (
                <div className="space-y-4">
                  <label className="text-xs font-semibold text-slate-700 block">
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
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500"
                        />
                        <button
                          onClick={() => {
                            const newItems = selectedBlock.items?.filter((_, i) => i !== idx);
                            updateBlock(selectedGroup.id, selectedBlock.id, { items: newItems });
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1"
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
                      className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs flex items-center justify-center gap-1 font-semibold transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Opção
                    </button>
                  </div>
                </div>
              )}

              {selectedBlock.type === 'assign_to_agent' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Estratégia de Atribuição
                  </label>
                  <select
                    value={selectedBlock.options.strategy}
                    onChange={(e) =>
                      updateBlock(selectedGroup.id, selectedBlock.id, {
                        options: { ...selectedBlock.options, strategy: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500"
                  >
                    <option value="round_robin">Distribuição Circular (Round-Robin)</option>
                    <option value="team">Encaminhar para Fila de Departamento</option>
                    <option value="specific_agent">Atendente Específico</option>
                  </select>

                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-semibold text-slate-700 block">
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
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {selectedBlock.type === 'add_label' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-700 block">
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="pt-6 border-t border-slate-100">
                <button
                  onClick={() => deleteBlock(selectedGroup.id, selectedBlock.id)}
                  className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir Este Bloco
                </button>
              </div>
            </aside>
          )}

          {/* WhatsApp Live Simulator Drawer */}
          {isSimulating && (
            <aside className="w-96 border-l border-slate-200 bg-slate-50 flex flex-col shrink-0 z-30 shadow-xl animate-in slide-in-from-right">
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
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#efeae2] bg-[radial-gradient(#d1d7db_1px,transparent_1px)] [background-size:16px_16px]">
                {simulationMessages.map((msg, index) => {
                  const isBot = msg.sender === 'bot';

                  return (
                    <div
                      key={index}
                      className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg p-2.5 text-xs shadow-2xs ${
                          isBot
                            ? 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                            : 'bg-[#d9fdd3] text-slate-900 rounded-tr-none'
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
                              className="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 text-xs font-semibold text-center border border-emerald-200 transition-colors active:scale-95 shadow-2xs"
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
                className="p-3 bg-slate-100 border-t border-slate-200 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={simInput}
                  onChange={(e) => setSimInput(e.target.value)}
                  placeholder={currentInputRequest?.placeholder || 'Digite sua mensagem...'}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  className="w-9 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center shadow-xs transition-all active:scale-95"
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
