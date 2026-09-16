'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { START_SOURCE } from './handleIds';

// Nó de gatilho (o primeiro evento é sempre o start — ADR-004 §2.1).
function StartNodeComponent() {
  return (
    <div className="rf-drag-handle w-24 p-3 bg-white border border-emerald-300 shadow-sm rounded-xl flex flex-col items-center gap-1 text-center cursor-move">
      <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
        ▶
      </div>
      <span className="text-[11px] font-bold text-emerald-800">Início</span>
      <span className="text-[9px] text-slate-400 font-medium">Gatilho Chat</span>
      <Handle
        type="source"
        position={Position.Right}
        id={START_SOURCE}
        style={{ width: 10, height: 10, background: '#10b981', border: '2px solid #fff', right: -5 }}
      />
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
