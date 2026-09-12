'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  Users,
  Briefcase,
  Bot,
  Send,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function NavigationRail() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = [
    {
      href: '/inbox',
      icon: MessageSquare,
      title: 'Caixa de Entrada (Omnichannel)',
      badge: '14',
    },
    {
      href: '/contacts',
      icon: Users,
      title: 'Contatos & Carteiras',
    },
    {
      href: '/crm',
      icon: Briefcase,
      title: 'CRM & Funil de Vendas (Kanban)',
    },
    {
      href: '/bots',
      icon: Bot,
      title: 'Automações & Chatbots No-Code',
      badge: '3',
    },
    {
      href: '/campaigns',
      icon: Send,
      title: 'Disparo em Massa & Campanhas',
    },
    {
      href: '/reports',
      icon: BarChart3,
      title: 'Métricas & Relatórios Executivos (BI)',
    },
    {
      href: '/settings',
      icon: Settings,
      title: 'Configurações',
    },
  ];

  return (
    <nav className="w-[72px] h-full bg-white border-r border-[#E5E7EB] flex flex-col items-center justify-between py-5 z-20 shrink-0 select-none">
      <div className="flex flex-col items-center gap-6">
        {/* Brand Logo - AIVIQ-ZAP */}
        <Link
          href="/inbox"
          title="AIVIQ-ZAP"
          className="w-10 h-10 rounded-xl bg-[#12B76A] flex items-center justify-center font-bold text-base text-white shadow-sm hover:bg-[#0E9F6E] transition-colors"
        >
          AZ
        </Link>

        {/* Navigation Items */}
        <div className="flex flex-col items-center gap-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href) && item.href !== '#';

            return (
              <Link
                key={item.title}
                href={item.href}
                title={item.title}
                className={`w-11 h-11 rounded-xl flex items-center justify-center relative transition-all ${
                  isActive
                    ? 'bg-[#ECFDF5] text-[#12B76A] border border-[#12B76A]/30 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.badge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#12B76A] text-white font-bold text-[9px] rounded-full flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* User Avatar & Logout */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={() => logout()}
          title="Sair da Plataforma"
          className="w-10 h-10 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>

        <div className="relative" title={user?.full_name || 'Lucas R. (Online)'}>
          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-semibold text-xs text-slate-700">
            {user?.full_name ? user.full_name.slice(0, 2).toUpperCase() : 'LR'}
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#12B76A] border-2 border-white" />
        </div>
      </div>
    </nav>
  );
}
