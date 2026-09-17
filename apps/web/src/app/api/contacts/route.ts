import { NextRequest, NextResponse } from 'next/server';
import { Contact } from '@/types';
import { getRealContacts, fetchLiveEvolutionInstances } from '@/lib/evolutionService';
import { getCustomContacts, addCustomContact } from '@/lib/conversationStore';
import { mockCidadaos } from '@/lib/mockOuvidoria';
import { getDbContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get('tag');
    const assigned = searchParams.get('assigned_to');
    const query = searchParams.get('q')?.toLowerCase();
    const instance = searchParams.get('instance') || undefined;

    const isPlaceholder = isPlaceholderEnv();
    let contacts: Contact[] = [];

    if (!isPlaceholder) {
      // Banco conectado → fonte de verdade. Começa do zero: NÃO injeta cidadãos
      // de exemplo (mock) nem o store em memória. Mescla apenas contatos REAIS
      // do WhatsApp (Evolution), que retorna [] quando desconectado.
      const ctx = await getDbContext();
      if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      const { data: dbContacts } = await ctx.db
        .from('contacts')
        .select('*, assigned_user:profiles(*)')
        .eq('organization_id', ctx.organizationId);
      contacts = (dbContacts ?? []) as unknown as Contact[];

      const realContacts = await getRealContacts(instance);
      const seen = new Set(
        contacts.map((c) => c.phone?.replace(/\D/g, '')).filter(Boolean) as string[]
      );
      for (const r of realContacts) {
        const key = r.phone?.replace(/\D/g, '');
        if (!key || !seen.has(key)) {
          contacts.push(r);
          if (key) seen.add(key);
        }
      }
    } else {
      // Dev/sem banco: Evolution + store em memória + cidadãos de exemplo.
      const realContacts = await getRealContacts(instance);
      const customContacts = getCustomContacts();
      const map = new Map<string, Contact>();
      for (const c of mockCidadaos) map.set(c.id, c);
      for (const c of customContacts) map.set(c.id, c);
      for (const r of realContacts) if (!map.has(r.id)) map.set(r.id, r);
      contacts = Array.from(map.values());
    }

    // Filtros
    if (tag && tag !== 'all') {
      contacts = contacts.filter((c) =>
        c.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
      );
    }
    if (assigned && assigned !== 'all') {
      contacts = contacts.filter(
        (c) => c.assigned_to === assigned || c.assigned_user?.full_name === assigned
      );
    }
    if (query) {
      contacts = contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.phone?.includes(query) ||
          c.email?.toLowerCase().includes(query) ||
          c.company?.toLowerCase().includes(query)
      );
    }

    return NextResponse.json({
      success: true,
      count: contacts.length,
      contacts,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao listar contatos', message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ===== Importar a carteira do WhatsApp (Evolution) para o banco =====
    // Ex.: { action:'import_whatsapp', ddd:'67' } — grava os contatos reais da
    // instância conectada cujo telefone começa com 55<ddd>. Dedup por telefone.
    if (body?.action === 'import_whatsapp') {
      if (isPlaceholderEnv()) {
        return NextResponse.json({ error: 'Importação requer Supabase configurado' }, { status: 400 });
      }
      const ctx = await getDbContext();
      if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      // Instância conectada (a passada, ou a primeira 'connected' do servidor).
      let instance: string | undefined = body.instance;
      if (!instance) {
        try {
          const live = await fetchLiveEvolutionInstances();
          instance = live.find((i) => i.status === 'connected')?.instanceName;
        } catch {}
      }

      const ddd = String(body.ddd || '67').replace(/\D/g, '');
      const prefixo = `55${ddd}`;
      const reais = await getRealContacts(instance);
      const vistos = new Set<string>();
      const linhas = reais
        .map((c) => ({ nome: (c.name || '').trim(), tel: (c.phone || '').replace(/\D/g, '') }))
        .filter((c) => {
          if (!c.tel.startsWith(prefixo) || c.tel.length < 12) return false;
          if (vistos.has(c.tel)) return false;
          vistos.add(c.tel);
          return true;
        })
        .map((c) => ({
          organization_id: ctx.organizationId,
          name: c.nome || `WhatsApp ${c.tel.slice(-4)}`,
          phone: c.tel,
          tags: ['WhatsApp Oficial', `Eleitor ${ddd === '67' ? 'MS' : ddd}`],
        }));

      if (linhas.length === 0) {
        return NextResponse.json({
          success: true,
          imported: 0,
          message: instance
            ? `Nenhum contato +55 (${ddd}) encontrado na instância ${instance}.`
            : 'Nenhuma instância WhatsApp conectada.',
        });
      }

      // Upsert em lotes de 500 (dedup por unique(org, phone)).
      let imported = 0;
      for (let i = 0; i < linhas.length; i += 500) {
        const lote = linhas.slice(i, i + 500);
        const { error } = await ctx.db
          .from('contacts')
          .upsert(lote, { onConflict: 'organization_id,phone', ignoreDuplicates: true });
        if (error) {
          return NextResponse.json(
            { success: false, error: 'Falha ao importar', message: error.message, importedAntes: imported },
            { status: 500 }
          );
        }
        imported += lote.length;
      }

      return NextResponse.json({ success: true, imported, instance, ddd });
    }

    const { name, phone, email, company, cpf, bairro, tags = [], assigned_to = 'Equipe de Ouvidoria' } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nome do contato é obrigatório' }, { status: 400 });
    }

    const isPlaceholder = isPlaceholderEnv();
    let dbContact: any = null;

    if (!isPlaceholder) {
      const ctx = await getDbContext();
      if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      const { data: inserted, error } = await ctx.db
        .from('contacts')
        .insert({
          organization_id: ctx.organizationId,
          name: name.trim(),
          phone: phone ? phone.trim() : null,
          email: email ? email.trim() : null,
          tags: tags.length > 0 ? tags : ['Novo Cidadão'],
          cpf: cpf ? cpf.trim() : null,
          bairro: bairro ? bairro.trim() : null,
          custom_attributes: { company: company || '' },
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: 'Falha ao cadastrar contato', message: error.message },
          { status: 500 }
        );
      }
      dbContact = inserted;
    }

    const newContact: Contact = dbContact || {
      id: `cont-${Date.now()}`,
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: name.trim(),
      phone: phone ? phone.trim() : '',
      email: email ? email.trim() : '',
      company: company ? company.trim() : '',
      tags: tags.length > 0 ? tags : ['Novo Cidadão'],
      cpf: cpf ? cpf.trim() : '',
      bairro: bairro ? bairro.trim() : '',
      assigned_to,
      custom_attributes: { company: company || '' },
      created_at: new Date().toISOString(),
    };

    // Só persiste em memória quando NÃO foi gravado no banco (modo dev/fallback).
    // Com Supabase conectado, a fonte de verdade é o banco — evita duplicar o
    // contato entre o store em memória e a linha real (RLS).
    if (!dbContact) {
      addCustomContact(newContact);
    }

    return NextResponse.json({ success: true, contact: newContact }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao cadastrar contato', message: err.message },
      { status: 500 }
    );
  }
}
