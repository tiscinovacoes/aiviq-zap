import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { addCustomContact } from '@/lib/conversationStore';
import { Contact } from '@/types';

export async function sincronizarContatoEleitor(eleitor: {
  name: string;
  phone: string;
  bairro?: string;
  voto1Nome?: string;
  voto2Nome?: string;
  etapa?: string;
}) {
  const cleanPhone = eleitor.phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 8) return;

  let formattedPhone = `+${cleanPhone}`;
  if (cleanPhone.length >= 12 && cleanPhone.startsWith('55')) {
    const ddd = cleanPhone.slice(2, 4);
    const rest = cleanPhone.slice(4);
    if (rest.length === 9) {
      formattedPhone = `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    } else if (rest.length === 8) {
      formattedPhone = `+55 (${ddd}) 9${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }

  const tags = ['Pesquisa Senado MS', 'Eleitor MS'];
  if (eleitor.voto1Nome) tags.push(`1º Voto: ${eleitor.voto1Nome}`);
  if (eleitor.voto2Nome) tags.push(`2º Voto: ${eleitor.voto2Nome}`);
  if (eleitor.etapa) tags.push(`Status: ${eleitor.etapa}`);

  const customAttributes: Record<string, any> = {
    origem: 'Pesquisa Eleitoral Senado MS 2026',
    voto1: eleitor.voto1Nome || '',
    voto2: eleitor.voto2Nome || '',
    etapa: eleitor.etapa || 'disparado',
    atualizadoEm: new Date().toISOString(),
  };

  // 1. Persiste no Repositório de Contatos do Sistema (refletido em /contacts imediatamente)
  const contactObj: Contact = {
    id: `cont-${cleanPhone}`,
    organization_id: '00000000-0000-0000-0000-000000000000',
    name: eleitor.name.trim() || `Eleitor ${formattedPhone}`,
    phone: formattedPhone,
    tags,
    bairro: eleitor.bairro || 'Mato Grosso do Sul',
    custom_attributes: customAttributes,
    created_at: new Date().toISOString(),
  };

  try {
    addCustomContact(contactObj);
  } catch (err) {
    console.error('[Sync Contato Memory Error]:', err);
  }

  // 2. Persiste no Banco de Dados Supabase (se configurado com chaves reais)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && !supabaseUrl.includes('placeholder-project')) {
    try {
      const supabase = serviceRoleKey
        ? createSupabaseClient(supabaseUrl, serviceRoleKey)
        : await createClient();

      // Mesma resolução determinística do getServiceContext (created_at, id) para
      // NÃO gravar o contato numa org diferente da conversa/pesquisa quando há
      // mais de uma organização.
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (org) {
        const organizationId = org.id;

        // Verifica se contato já existe pelo telefone
        const { data: existing } = await supabase
          .from('contacts')
          .select('id, tags, custom_attributes')
          .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone},phone.eq.${formattedPhone}`)
          .maybeSingle();

        if (existing) {
          const mergedTags = Array.from(new Set([...(existing.tags || []), ...tags]));
          await supabase
            .from('contacts')
            .update({
              name: eleitor.name.trim(),
              bairro: eleitor.bairro || 'Mato Grosso do Sul',
              tags: mergedTags,
              custom_attributes: {
                ...(existing.custom_attributes || {}),
                ...customAttributes,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          console.log(`[Supabase DB] Contato ${eleitor.name} (${cleanPhone}) atualizado no banco de dados.`);
        } else {
          await supabase.from('contacts').insert({
            organization_id: organizationId,
            name: eleitor.name.trim(),
            phone: formattedPhone,
            bairro: eleitor.bairro || 'Mato Grosso do Sul',
            tags,
            custom_attributes: customAttributes,
          });
          console.log(`[Supabase DB] Novo contato ${eleitor.name} (${cleanPhone}) cadastrado no banco de dados.`);
        }
      }
    } catch (dbErr: any) {
      console.warn('[Supabase DB Sync Warning]:', dbErr.message || dbErr);
    }
  }
}
