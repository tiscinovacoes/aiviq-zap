'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Trash2,
  Plus,
  MessageSquare,
  HelpCircle,
  Split,
  UserCheck,
  Tag,
  Globe,
} from 'lucide-react';
import { useBotStore } from '@/store/useBotStore';
import type { Group } from '@/types/bot';
import { GROUP_TARGET, blockHandle, itemHandle } from './handleIds';

export type GroupNodeData = {
  group: Group;
  selectedGroupId: string | null;
  selectedBlockId: string | null;
};

// Estilo compartilhado das âncoras de saída (bolinha verde).
const sourceHandleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: '#10b981',
  border: '2px solid #fff',
  right: -5,
};

function GroupNodeComponent({ data }: NodeProps) {
  const { group, selectedGroupId, selectedBlockId } = data as unknown as GroupNodeData;
  const selectBlock = useBotStore((s) => s.selectBlock);
  const updateGroup = useBotStore((s) => s.updateGroup);
  const deleteGroup = useBotStore((s) => s.deleteGroup);
  const addBlock = useBotStore((s) => s.addBlock);

  const isGroupSelected = selectedGroupId === group.id;

  return (
    <div
      className={`w-[300px] bg-white border rounded-xl shadow-xs transition-shadow ${
        isGroupSelected
          ? 'border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Âncora de entrada do grupo */}
      <Handle
        type="target"
        position={Position.Left}
        id={GROUP_TARGET}
        style={{ width: 10, height: 10, background: '#94a3b8', border: '2px solid #fff', left: -5 }}
      />

      {/* Cabeçalho — área de arraste do React Flow (drag handle) */}
      <div className="rf-drag-handle p-3 border-b border-slate-100 flex items-center justify-between cursor-move bg-slate-50/80 rounded-t-xl">
        <input
          type="text"
          value={group.title}
          onChange={(e) => updateGroup(group.id, { title: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          className="nodrag bg-transparent text-xs font-bold text-slate-800 focus:outline-none border-b border-transparent focus:border-emerald-500 w-48"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteGroup(group.id);
          }}
          className="nodrag p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
          title="Excluir grupo"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Blocos */}
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
              className={`relative p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                isBlockSelected
                  ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-semibold shadow-2xs'
                  : 'bg-slate-50/80 border-slate-200/80 text-slate-700 hover:bg-slate-100/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  {b.type === 'text' && <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  {b.type === 'text_input' && <HelpCircle className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  {b.type === 'choice_input' && <Split className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  {b.type === 'assign_to_agent' && <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  {b.type === 'add_label' && <Tag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  {b.type === 'condition' && <Split className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                  {b.type === 'http_request' && <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  <span className="font-semibold truncate">
                    {b.type === 'text' && (b.content.text || 'Texto vazio')}
                    {b.type === 'text_input' && `Pergunta (${b.options.variableId || 'texto'})`}
                    {b.type === 'choice_input' && `Opções (${b.items?.length || 0})`}
                    {b.type === 'assign_to_agent' && `Atribuir: ${b.options.agentName || 'Atendente'}`}
                    {b.type === 'add_label' && `Tags: ${b.options.labels?.join(', ') || ''}`}
                    {b.type === 'condition' && 'Condição Lógica'}
                    {b.type === 'http_request' && `${b.options.method} ${b.options.url}`}
                  </span>
                </div>
              </div>

              {/* Choice: cada item tem sua própria âncora de saída */}
              {b.type === 'choice_input' && b.items && b.items.length > 0 ? (
                <div className="mt-2 space-y-1 pl-4 border-l border-slate-200">
                  {b.items.map((item) => (
                    <div
                      key={item.id}
                      className="relative text-[10px] text-slate-500 flex items-center justify-between pr-1"
                    >
                      <span className="truncate">• {item.content}</span>
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={itemHandle(b.id, item.id)}
                        style={{ ...sourceHandleStyle, background: '#6366f1', top: '50%' }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                // Demais blocos: âncora de saída única no centro-direita da linha
                <Handle
                  type="source"
                  position={Position.Right}
                  id={blockHandle(b.id)}
                  style={{ ...sourceHandleStyle, top: '50%' }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Adicionar bloco */}
      <div className="p-2 pt-0 flex justify-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            addBlock(group.id, 'text');
          }}
          className="nodrag w-full py-1.5 border border-dashed border-slate-300 hover:border-emerald-500 hover:text-emerald-700 bg-white rounded-lg text-[11px] text-slate-500 flex items-center justify-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" /> Adicionar Bloco
        </button>
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeComponent);
