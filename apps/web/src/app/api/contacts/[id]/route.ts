import { NextRequest, NextResponse } from 'next/server';
import { Cidadao, Protocolo } from '@/types';
import { getRealContacts } from '@/lib/evolutionService';
import { getCustomContacts, updateCustomContact } from '@/lib/conversationStore';
import {
  acharCidadaoMock,
  protocolosDoCidadao,
  resumoCidadao,
  updateMockCidadao,
} from '@/lib/mockOuvidoria';
import { getDbContext, isPlaceholderEnv } from '@/lib/supabase/authContext';

type NotaInterna = { text: string; at: string; by?: string };

export const dynamic = 'force-dynamic';

// CRM 360º — dados de um cidadão + todos os protocolos vinculados a ele.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const isPlaceholder = isPlaceholderEnv();

    let contact: Cidadao | null = null;
    let protocolos: Protocolo[] = [];

    // 1. Banco conectado → fonte de verdade (sem mock).
    if (!isPlaceholder) {
      const ctx = await getDbContext();
      if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      const { data: dbContact } = await ctx.db
        .from('contacts')
        .select('*, assigned_user:profiles(*)')
        .eq('organization_id', ctx.organizationId)
        .eq('id', id)
        .maybeSingle();
      if (dbContact) contact = dbContact as unknown as Cidadao;

      const { data: dbProtocolos } = await ctx.db
        .from('protocolos')
        .select('*')
        .eq('organization_id', ctx.organizationId)
        .eq('contact_id', id)
        .order('created_at', { ascending: false });
      if (dbProtocolos) protocolos = dbProtocolos as unknown as Protocolo[];

      if (!contact) {
        // Pode ser um contato REAL do WhatsApp (Evolution) ainda não gravado.
        contact = (await getRealContacts()).find((c) => c.id === id) || null;
      }
    } else {
      // Fallback dev/mock: mock -> custom -> Evolution.
      contact =
        acharCidadaoMock(id) ||
        getCustomContacts().find((c) => c.id === id) ||
        (await getRealContacts()).find((c) => c.id === id) ||
        null;
      protocolos = protocolosDoCidadao(id);
    }

    if (!contact) {
      return NextResponse.json({ error: 'Cidadão não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      contact,
      protocolos,
      resumo: resumoCidadao(protocolos),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao carregar ficha do cidadão', message: err.message },
      { status: 500 }
    );
  }
}

// Atualização de contato/cidadão — persiste no Supabase (RLS via sessão) e, sem
// banco configurado, no store em memória (dev/fallback).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const isPlaceholder = isPlaceholderEnv();

    // Whitelist de colunas diretas — impede que `...body` injete organization_id
    // (mover tenant) ou colunas inexistentes (mesmo racional do CR-004 T2/T6).
    const ALLOWED = ['name', 'phone', 'email', 'avatar_url', 'tags', 'cpf', 'bairro'] as const;
    const patch: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) patch[k] = body[k];

    // `notes` não é coluna própria — vive em custom_attributes.notes (jsonb).
    // Aceita `note` (string) para append server-side, e/ou merge de custom_attributes.
    const appendNote =
      typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;
    const attrsPatch =
      body.custom_attributes && typeof body.custom_attributes === 'object'
        ? (body.custom_attributes as Record<string, unknown>)
        : undefined;

    // ================= BANCO SUPABASE (fonte de verdade) =================
    if (!isPlaceholder) {
      const ctx = await getDbContext();
      if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      // Read-modify-write de custom_attributes quando há nota ou merge de atributos.
      let custom_attributes: Record<string, unknown> | undefined;
      if (appendNote || attrsPatch) {
        const { data: current } = await ctx.db
          .from('contacts')
          .select('custom_attributes')
          .eq('organization_id', ctx.organizationId)
          .eq('id', id)
          .maybeSingle();
        const base = (current?.custom_attributes as Record<string, unknown>) || {};
        custom_attributes = { ...base, ...(attrsPatch || {}) };
        if (appendNote) {
          const prev = Array.isArray(base.notes) ? (base.notes as NotaInterna[]) : [];
          custom_attributes.notes = [
            { text: appendNote, at: new Date().toISOString(), by: ctx.userId },
            ...prev,
          ];
        }
      }

      const updatePayload: Record<string, unknown> = {
        ...patch,
        ...(custom_attributes ? { custom_attributes } : {}),
        updated_at: new Date().toISOString(),
      };
      // Nada além de updated_at → requisição sem alterações válidas.
      if (Object.keys(updatePayload).length === 1) {
        return NextResponse.json(
          { error: 'Nenhum campo válido para atualizar' },
          { status: 400 }
        );
      }

      const { data: updated, error } = await ctx.db
        .from('contacts')
        .update(updatePayload)
        .eq('organization_id', ctx.organizationId)
        .eq('id', id)
        .select('*, assigned_user:profiles(*)')
        .single();

      // Banco conectado → erro do banco é ERRO (não vira "simulado").
      if (error) {
        return NextResponse.json(
          { error: 'Falha ao atualizar cidadão', message: error.message },
          { status: 500 }
        );
      }
      if (!updated) {
        return NextResponse.json({ error: 'Cidadão não encontrado' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        message: 'Cidadão atualizado com sucesso',
        contact: updated,
        updated,
      });
    }

    // ================= FALLBACK DEV (sem banco) — store em memória ============
    // Monta o patch equivalente (inclui append de nota em custom_attributes).
    const applyPatch = (existing: any) => {
      const base = (existing?.custom_attributes as Record<string, unknown>) || {};
      const nextAttrs: Record<string, unknown> = { ...base, ...(attrsPatch || {}) };
      if (appendNote) {
        const prev = Array.isArray(base.notes) ? (base.notes as NotaInterna[]) : [];
        nextAttrs.notes = [{ text: appendNote, at: new Date().toISOString() }, ...prev];
      }
      return {
        ...patch,
        ...(appendNote || attrsPatch ? { custom_attributes: nextAttrs } : {}),
        updated_at: new Date().toISOString(),
      };
    };

    // Procura primeiro entre contatos manuais, depois entre cidadãos de exemplo.
    const custom = getCustomContacts().find((c) => c.id === id);
    if (custom) {
      const updated = updateCustomContact(id, applyPatch(custom) as any);
      return NextResponse.json({ success: true, simulated: true, contact: updated, updated });
    }
    const mock = acharCidadaoMock(id);
    if (mock) {
      const updated = updateMockCidadao(id, applyPatch(mock) as any);
      return NextResponse.json({ success: true, simulated: true, contact: updated, updated });
    }

    return NextResponse.json({ error: 'Cidadão não encontrado' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao atualizar cidadão', message: err.message },
      { status: 500 }
    );
  }
}
