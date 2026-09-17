import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createSSRClient } from '@/lib/supabase/server';

// Resolve o contexto de acesso ao banco de forma unificada — igual ao que o
// middleware faz para deixar o usuário entrar. Sem isto, as rotas chamavam
// supabase.auth.getUser() direto: o login demo (sem JWT real) devolvia null e
// tudo retornava 401 / caía no mock.
//
// - Usuário Supabase real  → client com RLS + org do perfil (multi-tenant).
// - Usuário demo (ALLOW_DEMO_LOGIN) → client service-role (contorna RLS),
//   escopado à organização padrão. A service-role só roda no servidor.
export interface DbContext {
  db: SupabaseClient;
  organizationId: string;
  userId: string;
  isDemo: boolean;
}

export function isPlaceholderEnv(): boolean {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project')
  );
}

function demoAllowed(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.ALLOW_DEMO_LOGIN === 'true'
  );
}

// Devolve o contexto, ou null quando não autorizado (a rota responde 401).
export async function getDbContext(): Promise<DbContext | null> {
  const ssr = await createSSRClient();

  // 1. Usuário Supabase real (JWT válido) — usa RLS + organização do perfil.
  const {
    data: { user },
  } = await ssr.auth.getUser();

  if (user) {
    const { data: profile } = await ssr
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();

    let organizationId = profile?.organization_id as string | undefined;
    if (!organizationId) {
      const { data: mem } = await ssr
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      organizationId = mem?.organization_id as string | undefined;
    }
    if (!organizationId) return null;
    return { db: ssr, organizationId, userId: user.id, isDemo: false };
  }

  // 2. Sem usuário real → fallback demo (só quando permitido e com service-role).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!demoAllowed() || !url || !serviceKey) return null;

  const admin = createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Desempate estável por id — sem ele, orgs com o mesmo created_at fariam a
  // resolução variar entre requisições (contato gravado numa org, listado noutra).
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!org) return null;

  // Usa um profile real da org como "usuário" (p/ FKs como assignee_id).
  const { data: prof } = await admin
    .from('profiles')
    .select('id')
    .eq('organization_id', org.id)
    .limit(1)
    .maybeSingle();

  return {
    db: admin,
    organizationId: org.id as string,
    userId: (prof?.id as string) || '00000000-0000-0000-0000-000000000001',
    isDemo: true,
  };
}
