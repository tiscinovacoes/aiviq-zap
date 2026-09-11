import React from 'react';
import LoginForm from '@/components/auth/LoginForm';
import { Shield, Sparkles, MessageSquare, Zap } from 'lucide-react';

export const metadata = {
  title: 'Entrar — Poli 2.0',
  description: 'Plataforma de Atendimento Multicanal, CRM & Automação Inteligente',
};

export default function LoginPage() {
  return (
    <main className="min-h-screen w-full bg-[#090d16] flex flex-col justify-between text-slate-100 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="w-full h-16 px-8 flex items-center justify-between border-b border-white/5 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/40">
            P
          </div>
          <span className="font-semibold tracking-tight text-white">Poli 2.0</span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Sistemas Operacionais</span>
          </div>
        </div>
      </header>

      {/* Center Auth Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <LoginForm />
      </div>

      {/* Footer */}
      <footer className="w-full py-6 px-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 relative z-10">
        <p>© 2026 Poli 2.0 Inc. Todos os direitos reservados.</p>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-slate-400 transition-colors">Termos de Uso</a>
          <a href="#" className="hover:text-slate-400 transition-colors">Privacidade</a>
          <a href="#" className="hover:text-slate-400 transition-colors">Status do Sistema</a>
        </div>
      </footer>
    </main>
  );
}
