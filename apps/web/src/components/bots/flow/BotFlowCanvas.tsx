'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useBotStore } from '@/store/useBotStore';
import type { BotV1, Edge } from '@/types/bot';
import { GroupNode } from './GroupNode';
import { StartNode } from './StartNode';
import {
  GROUP_TARGET,
  START_SOURCE,
  decodeBlockSource,
  edgeToFlow,
} from './handleIds';

// Constrói nodes/edges do React Flow a partir do documento (fonte de verdade).
// Posições vêm de graphCoordinates; o React Flow cuida de viewport e drag
// (camadas efêmeras — ADR-004 §2.2).
function buildFlow(
  bot: BotV1,
  selectedGroupId: string | null,
  selectedBlockId: string | null
): { nodes: RFNode[]; edges: RFEdge[] } {
  const nodes: RFNode[] = [];
  const startEvent = bot.events[0];

  nodes.push({
    id: startEvent.id,
    type: 'start',
    position: startEvent.graphCoordinates,
    data: {},
    dragHandle: '.rf-drag-handle',
  });

  const blockToGroup = new Map<string, string>();
  for (const g of bot.groups) {
    for (const b of g.blocks) blockToGroup.set(b.id, g.id);
    nodes.push({
      id: g.id,
      type: 'group',
      position: g.graphCoordinates,
      data: { group: g, selectedGroupId, selectedBlockId },
      dragHandle: '.rf-drag-handle',
    });
  }

  const edges: RFEdge[] = [];
  for (const e of bot.edges) {
    if (!e.to.groupId) continue;
    const flow = edgeToFlow(e, blockToGroup);
    if (!flow) continue;
    edges.push({
      id: e.id,
      source: flow.source,
      sourceHandle: flow.sourceHandle,
      target: e.to.groupId,
      targetHandle: GROUP_TARGET,
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
      style: { stroke: '#10b981', strokeWidth: 2 },
    });
  }

  return { nodes, edges };
}

export default function BotFlowCanvas() {
  const bot = useBotStore((s) => s.bot);
  const selectedGroupId = useBotStore((s) => s.selectedGroupId);
  const selectedBlockId = useBotStore((s) => s.selectedBlockId);
  const moveGroup = useBotStore((s) => s.moveGroup);
  const createEdge = useBotStore((s) => s.createEdge);
  const deleteEdge = useBotStore((s) => s.deleteEdge);
  const selectBlock = useBotStore((s) => s.selectBlock);

  const nodeTypes = useMemo(() => ({ group: GroupNode, start: StartNode }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);

  // Espelha o documento no canvas sempre que o documento muda (add/remove/undo
  // e o commit de posição no drop). Durante o arraste não há escrita no store,
  // então o canvas não é reconstruído — o drag fica fluido (ADR-004 §2.2).
  useEffect(() => {
    if (!bot) return;
    const { nodes: n, edges: e } = buildFlow(bot, selectedGroupId, selectedBlockId);
    setNodes(n);
    setEdges(e);
  }, [bot, selectedGroupId, selectedBlockId, setNodes, setEdges]);

  // Commit da coordenada só no drop — nunca por pixel, nunca no histórico.
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      if (!bot) return;
      if (node.id === bot.events[0].id) {
        useBotStore.setState((s) =>
          s.bot
            ? ({
                bot: {
                  ...s.bot,
                  events: [{ ...s.bot.events[0], graphCoordinates: node.position }],
                },
              } as any)
            : s
        );
        return;
      }
      moveGroup(node.id, node.position);
    },
    [bot, moveGroup]
  );

  // Nova conexão desenhada no canvas → aresta do domínio (createEdge encapsula
  // a redundância aresta↔outgoingEdgeId — ADR-004 §2.3).
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      let from: Edge['from'];
      if (c.sourceHandle === START_SOURCE) {
        from = { eventId: c.source };
      } else {
        const decoded = decodeBlockSource(c.sourceHandle);
        if (!decoded) return;
        from = decoded;
      }
      createEdge(from, { groupId: c.target });
    },
    [createEdge]
  );

  const onEdgesDelete = useCallback(
    (deleted: RFEdge[]) => {
      deleted.forEach((e) => deleteEdge(e.id));
    },
    [deleteEdge]
  );

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      if (node.type === 'group') {
        const g = bot?.groups.find((x) => x.id === node.id);
        selectBlock(node.id, g?.blocks[0]?.id ?? null);
      }
    },
    [bot, selectBlock]
  );

  const onPaneClick = useCallback(() => selectBlock(null, null), [selectBlock]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      onEdgesDelete={onEdgesDelete}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      className="bg-slate-100/70"
    >
      <Background gap={24} color="#cbd5e1" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => (n.type === 'start' ? '#10b981' : '#94a3b8')}
        maskColor="rgba(241, 245, 249, 0.6)"
      />
    </ReactFlow>
  );
}
