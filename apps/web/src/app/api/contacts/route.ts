import { NextRequest, NextResponse } from 'next/server';
import { Contact } from '@/types';
import { getRealContacts } from '@/lib/evolutionService';
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
    const { name, phone, email, company, cpf, bairro, tags = [], assigned_to = 'Equipe de Ouvidoria' } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nome do contato é obrigatório' }, { status: 400 });
    }

    const supabase = await createClient();
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let dbContact: any = null;

    if (!isPlaceholder) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let organizationId = '00000000-0000-0000-0000-000000000000';
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single();
          if (profile?.organization_id) {
            organizationId = profile.organization_id;
          }
        }

        const { data: inserted, error } = await supabase
          .from('contacts')
          .insert({
            organization_id: organizationId,
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

        if (!error && inserted) {
          dbContact = inserted;
        }
      } catch (dbErr) {
        console.warn('[Supabase Insert Contact Warn]:', dbErr);
      }
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
