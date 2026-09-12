'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  MessageSquare,
  ShieldCheck,
  Building,
  Users,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  HelpCircle,
  Smartphone,
  Send,
  Zap,
} from 'lucide-react';
import NavigationRail from '@/components/layout/NavigationRail';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'organization' | 'team' | 'ai'>('whatsapp');
  
  // WhatsApp Form State
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('aiviq_webhook_secret_token_2026');
  const [phoneNumber, setPhoneNumber] = useState('+55 11 99999-8888');
  const [verifiedName, setVerifiedName] = useState('AIVIQ-ZAP Oficial');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [status, setStatus] = useState<'connected' | 'pending' | 'disconnected'>('connected');
  const [qualityRating, setQualityRating] = useState('GREEN (Alta Qualidade)');

  // UI helpers
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // Carregar configurações
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch('/api/settings/whatsapp');
        const data = await res.json();
        if (data.success && data.config) {
          setPhoneNumberId(data.config.phoneNumberId || '');
          setWabaId(data.config.wabaId || '');
          setPhoneNumber(data.config.phoneNumber || '');
          setVerifiedName(data.config.verifiedName || '');
          setWebhookVerifyToken(data.config.webhookVerifyToken || 'aiviq_webhook_secret_token_2026');
          setWebhookUrl(data.config.webhookUrl || `${window.location.origin}/api/webhooks/whatsapp`);
          setStatus(data.config.status || 'connected');
          setQualityRating(data.config.qualityRating || 'GREEN (Alta Qualidade)');
        }
      } catch (err) {
        setWebhookUrl(`${window.location.origin}/api/webhooks/whatsapp`);
      }
    }
    loadConfig();
  }, []);

  const handleCopy = (text: string, isUrl: boolean) => {
    navigator.clipboard.writeText(text);
    if (isUrl) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId,
          accessToken: accessToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: data.message || 'Conexão com a Meta estabelecida com sucesso!',
        });
        setStatus('connected');
      } else {
        setTestResult({
          success: false,
          message: data.message || data.error || 'Falha ao conectar com a Meta. Verifique as credenciais.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Erro de comunicação ao validar conexão: ' + err.message,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId,
          wabaId,
          accessToken: accessToken.trim() || undefined,
          appSecret: appSecret.trim() || undefined,
          webhookVerifyToken,
          phoneNumber,
          verifiedName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveBanner('Configurações salvas com sucesso!');
        setTimeout(() => setSaveBanner(null), 3500);
      }
    } catch (err: any) {
      setSaveBanner('Erro ao salvar configurações.');
      setTimeout(() => setSaveBanner(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden font-sans select-none">
      {/* Navigation Rail */}
      <NavigationRail />

      {/* Main Settings View */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 px-8 border-b border-slate-200 flex items-center justify-between bg-white/95 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-900">Configurações da Plataforma</h1>
              <p className="text-xs text-slate-500">
                Gerencie canais de WhatsApp, credenciais da Meta, organização e inteligência artificial
              </p>
            </div>
          </div>

          {saveBanner && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg animate-in fade-in">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveBanner}</span>
            </div>
          )}
        </header>

        {/* Workspace Layout */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Sub Navigation Sidebar */}
          <aside className="w-64 border-r border-slate-200 bg-white p-4 space-y-1 shrink-0 overflow-y-auto">
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'whatsapp'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>WhatsApp Cloud API (Meta)</span>
            </button>

            <button
              onClick={() => setActiveTab('organization')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'organization'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Building className="w-4 h-4 text-slate-500" />
              <span>Perfil da Organização</span>
            </button>

            <button
              onClick={() => setActiveTab('team')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'team'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 text-slate-500" />
              <span>Equipe & Atendentes</span>
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'ai'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Inteligência Artificial (Copilot)</span>
            </button>
          </aside>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-5xl">
            {activeTab === 'whatsapp' && (
              <div className="space-y-6">
                {/* Connection Status Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-900">WhatsApp Business Cloud API Oficial</h2>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {status === 'connected' ? 'Conectado & Operante' : 'Aguardando Configuração'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Número ativo: <b className="text-slate-800">{phoneNumber}</b> • Qualidade Meta: <b className="text-emerald-700">{qualityRating}</b>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                    <span>{testing ? 'Verificando...' : 'Testar Conexão Meta'}</span>
                  </button>
                </div>

                {/* Test Feedback */}
                {testResult && (
                  <div
                    className={`p-4 rounded-xl border text-xs font-medium flex items-start gap-2.5 animate-in fade-in ${
                      testResult.success
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-bold">{testResult.success ? 'Conexão Aprovada!' : 'Falha no Teste'}</p>
                      <p className="mt-0.5">{testResult.message}</p>
                    </div>
                  </div>
                )}

                {/* Section 1: Webhook Meta */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-600" />
                      <span>1. Configuração do Webhook no Portal Meta Developers</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Copie esses dois parâmetros e cole no painel de desenvolvedores do Facebook (<a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline inline-flex items-center gap-0.5 font-semibold">Meta for Developers <ExternalLink className="w-3 h-3" /></a> em <b>WhatsApp &gt; Configuração &gt; Webhook</b>).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600">URL de Retorno de Chamada (Callback URL)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={webhookUrl}
                          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 select-all"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopy(webhookUrl, true)}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedUrl ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600">Token de Verificação (Verify Token)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={webhookVerifyToken}
                          onChange={(e) => setWebhookVerifyToken(e.target.value)}
                          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopy(webhookVerifyToken, false)}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedToken ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                    💡 <b>Importante:</b> No painel da Meta, após salvar a URL e o Token, clique em <b>"Gerenciar Campos"</b> e marque a caixa <b>"messages"</b> para receber mensagens de texto, mídias e status de entrega.
                  </div>
                </div>

                {/* Section 2: Credenciais da API da Meta */}
                <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>2. Credenciais de Envio & Segurança (Cloud API)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Informações de autenticação do seu WhatsApp Business Account (WABA) fornecidas pela Meta.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600">Phone Number ID *</label>
                      <input
                        type="text"
                        required
                        value={phoneNumberId}
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                        placeholder="Ex: 1049281928374"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none font-mono"
                      />
                      <p className="text-[10px] text-slate-400">Encontrado em WhatsApp &gt; Introdução &gt; Identificação do número de telefone.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600">WhatsApp Business Account ID (WABA ID) *</label>
                      <input
                        type="text"
                        required
                        value={wabaId}
                        onChange={(e) => setWabaId(e.target.value)}
                        placeholder="Ex: 1092837461928"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none font-mono"
                      />
                      <p className="text-[10px] text-slate-400">Identificador da Conta Comercial do WhatsApp.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600">Token de Acesso Permanente (System User Token)</label>
                      <div className="relative">
                        <input
                          type={showToken ? 'text' : 'password'}
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          placeholder="Cole o token EAAG... gerado no Gerenciador de Negócios"
                          className="w-full px-3 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400">Token permanente gerado em Configurações do Negócio &gt; Usuários do Sistema.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600">Segredo do Aplicativo (App Secret da Meta)</label>
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          value={appSecret}
                          onChange={(e) => setAppSecret(e.target.value)}
                          placeholder="Chave secreta para validação HMAC SHA-256"
                          className="w-full px-3 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400">Encontrado em Configurações do Aplicativo &gt; Básico &gt; Chave Secreta.</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>{saving ? 'Salvando...' : 'Salvar Configurações'}</span>
                    </button>
                  </div>
                </form>

                {/* Section 3: Guia Passo a Passo */}
                <div className="bg-slate-100/70 border border-slate-200 rounded-2xl p-6 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-emerald-600" />
                    <span>Guia Rápido: Como Conectar o WhatsApp Business Oficial em 4 Passos</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 leading-relaxed">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                      <span className="font-bold text-emerald-700 block">Passo 1: Conta na Meta</span>
                      <p>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-emerald-600 font-semibold hover:underline">developers.facebook.com</a> com sua conta Facebook e clique em <b>"Criar Aplicativo"</b> escolhendo o tipo <b>"Empresa" (Business)</b>.</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                      <span className="font-bold text-emerald-700 block">Passo 2: Adicionar WhatsApp</span>
                      <p>No painel do aplicativo, adicione o produto <b>"WhatsApp"</b>. Na aba <i>Introdução</i>, você verá o <b>Phone Number ID</b> e o <b>WABA ID</b> para colar acima.</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                      <span className="font-bold text-emerald-700 block">Passo 3: Token Permanente</span>
                      <p>No <i>Gerenciador de Negócios</i>, crie um <b>Usuário do Sistema</b> (Admin) e gere um token permanente com permissões <code>whatsapp_business_messaging</code> e <code>whatsapp_business_management</code>.</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                      <span className="font-bold text-emerald-700 block">Passo 4: Salvar e Testar</span>
                      <p>Cole a <b>URL de Webhook</b> e o <b>Token</b> no painel da Meta, assine o campo <code>messages</code>, cole os IDs aqui no AIVIQ-ZAP e clique em <b>"Testar Conexão"</b>!</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'organization' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Perfil da Organização</h3>
                  <p className="text-xs text-slate-500">Defina os dados da sua empresa e horários de atendimento.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Nome da Empresa</label>
                    <input
                      type="text"
                      defaultValue="AIVIQ-ZAP Tecnologia Ltda"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Fuso Horário</label>
                    <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900">
                      <option value="America/Sao_Paulo">Horário de Brasília (GMT-3)</option>
                      <option value="America/Manaus">Manaus (GMT-4)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Horário Comercial de Atendimento</label>
                    <input
                      type="text"
                      defaultValue="Segunda a Sexta, das 08:00 às 18:00"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Mensagem Fora do Horário</label>
                    <input
                      type="text"
                      defaultValue="Olá! Nosso horário de atendimento é de seg a sex das 8h às 18h. Em breve responderemos!"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors">
                    Salvar Empresa
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'team' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Membros da Equipe</h3>
                    <p className="text-xs text-slate-500">Gerencie operadores, consultores e administradores do sistema.</p>
                  </div>
                  <button className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors">
                    + Convidar Atendente
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                      <tr>
                        <th className="p-3">Nome</th>
                        <th className="p-3">E-mail</th>
                        <th className="p-3">Papel</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="p-3 font-semibold text-slate-900">Lucas Reis</td>
                        <td className="p-3 text-slate-600">lucas@aiviqzap.dev</td>
                        <td className="p-3"><span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px]">Administrador</span></td>
                        <td className="p-3 text-emerald-700 font-semibold">Ativo</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-slate-900">Consultor Comercial</td>
                        <td className="p-3 text-slate-600">vendas@aiviqzap.dev</td>
                        <td className="p-3"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[10px]">Atendente</span></td>
                        <td className="p-3 text-emerald-700 font-semibold">Ativo</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Copilot & Inteligência Artificial</h3>
                  <p className="text-xs text-slate-500">Configure o assistente de triagem e respostas automáticas com IA.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Modelo de IA Ativo</label>
                    <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900">
                      <option value="qwen-2.5">Qwen 2.5 7B (Local / On-Premise Alta Velocidade)</option>
                      <option value="claude-3-5">Claude 3.5 Sonnet (Qualidade Avançada)</option>
                      <option value="gpt-4o">OpenAI GPT-4o</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Prompt do Sistema (Persona do Atendimento)</label>
                    <textarea
                      rows={4}
                      defaultValue="Você é a assistente virtual da AIVIQ-ZAP. Seja cordial, direta e ajude a tirar dúvidas sobre produtos, preços e encaminhe para o atendente humano quando solicitado."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors">
                    Salvar Configurações de IA
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
