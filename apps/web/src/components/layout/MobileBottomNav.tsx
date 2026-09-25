'use client';

// Barra de navegação inferior para telas pequenas. A NavigationRail vertical
// (72px fixos) já toma quase 1/5 da largura de um celular comum (375px), e
// em telas com uma segunda barra lateral (ex.: /settings, 256px) sobra quase
// nada para o conteúdo. Em mobile a navegação vira uma barra fixa embaixo
// (padrão de app), sem ocupar largura nenhuma do conteúdo.
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Users, Briefcase, Bot, Send, BarChart3, Settings } from 'lucide-react';
import { useInboxStore } from '@/store/useInboxStore';

const navItems = [
  { href: '/inbox', icon: MessageSquare, label: 'Inbox' },
  { href: '/contacts', icon: Users, label: 'Contatos' },
  { href: '/crm', icon: Briefcase, label: 'CRM' },
  { href: '/bots', icon: Bot, label: 'Bots' },
  { href: '/campaigns', icon: Send, label: 'Disparos' },
  { href: '/reports', icon: BarChart3, label: 'Métricas' },
  { href: '/settings', icon: Settings, label: 'Config' },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const conversations = useInboxStore((s) => s.conversations);
  const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex items-stretch overflow-x-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 min-w-[56px] flex flex-col items-center justify-center gap-0.5 py-2 relative ${
              isActive ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-medium leading-none">{item.label}</span>
            {item.href === '/inbox' && totalUnread > 0 && (
              <span className="absolute top-1 right-1/4 w-3.5 h-3.5 bg-emerald-600 text-white font-bold text-[8px] rounded-full flex items-center justify-center">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
