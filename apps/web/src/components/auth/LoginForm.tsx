'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const loginSchema = z.object({
  email: z.string().email('Digite um e-mail válido'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  rememberMe: z.boolean(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || 'Falha ao autenticar.');
      }

      // Redireciona para o Inbox
      router.push('/inbox');
    } catch (err: any) {
      setErrorMessage(err.message || 'Ocorreu um erro ao tentar entrar.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-[#181b25]/90 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl shadow-black/60 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="text-center mb-8 relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/30 mb-4">
          <span className="text-2xl font-black tracking-tight">P</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Poli 2.0</h1>
        <p className="text-xs uppercase tracking-wider text-indigo-400 font-semibold mt-1">
          Plataforma de Atendimento Multicanal & CRM
        </p>
        <p className="text-sm text-slate-400 mt-2">
          Acesse o ambiente seguro da sua organização
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {errorMessage}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 relative z-10">
        {/* Email Field */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            E-mail Corporativo
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              placeholder="seu@empresa.com"
              {...register('email')}
              className="w-full h-11 pl-10 pr-4 bg-[#0a0e17]/80 border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg text-sm text-white placeholder-slate-500 transition-all outline-none"
            />
          </div>
          {errors.email && (
            <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
          )}
        </div>

        {/* Password Field */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Senha de Acesso
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              {...register('password')}
              className="w-full h-11 pl-10 pr-11 bg-[#0a0e17]/80 border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg text-sm text-white placeholder-slate-500 transition-all outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
          )}
        </div>

        {/* Utilities */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              {...register('rememberMe')}
              className="w-4 h-4 rounded border-white/20 bg-[#0a0e17] text-indigo-600 focus:ring-0 focus:ring-offset-0"
            />
            <span>Lembrar de mim</span>
          </label>
          <a href="#" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Esqueci minha senha
          </a>
        </div>

        {/* Submit CTA */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>Entrar na Plataforma</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </button>

        {/* Credentials Tip for Quick Dev Mode */}
        <div className="text-[11px] text-center text-slate-500 border-t border-white/5 pt-3">
          Acesso de Desenvolvimento: <code className="text-indigo-300">admin@poli.dev</code> / <code className="text-indigo-300">admin123</code>
        </div>
      </form>

      {/* Trust & Security footer */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 relative z-10">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>Criptografia de ponta a ponta & RLS Multi-tenant</span>
      </div>
    </div>
  );
}
