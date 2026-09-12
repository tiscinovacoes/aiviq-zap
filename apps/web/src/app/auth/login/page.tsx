import React from 'react';
import LoginForm from '@/components/auth/LoginForm';
import { Shield, Sparkles, MessageSquare, Zap } from 'lucide-react';

export const metadata = {
  title: 'Entrar — AIVIQ-ZAP',
  description: 'Plataforma Inteligente de Atendimento WhatsApp, CRM & Automação com IA',
};

export default function LoginPage() {
  return (
    <main className="min-h-screen w-full bg-slate-50 flex flex-col justify-between text-slate-900 relative selection:bg-emerald-500 selection:text-white">
      {/* Subtle top border accent */}
      <div className="w-full h-1 bg-gradient-to-r from-emerald-500 to-indigo-500" />

      {/* Top Navbar */}
      <header className="w-full h-16 px-8 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white shadow-sm">
            AZ
          </div>
          <span className="font-bold tracking-tight text-slate-900">AIVIQ-ZAP</span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium">Sistemas Operacionais</span>
          </div>
        </div>
      </header>

      {/* Center Auth Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <LoginForm />
      </div>

      {/* Footer */}
      <footer className="w-full py-6 px-8 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 relative z-10">
        <p>© 2026 AIVIQ-ZAP Inc. Todos os direitos reservados.</p>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-slate-700 transition-colors">Termos de Uso</a>
          <a href="#" className="hover:text-slate-700 transition-colors">Privacidade</a>
          <a href="#" className="hover:text-slate-700 transition-colors">Status do Sistema</a>
        </div>
      </footer>
    </main>
  );
}
