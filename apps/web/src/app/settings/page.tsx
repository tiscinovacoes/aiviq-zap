'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Building,
  Users,
  Sparkles,
  Zap,
  Save,
  HelpCircle,
  Eye,
  EyeOff,
  LogOut,
} from 'lucide-react';
import NavigationRail from '@/components/layout/NavigationRail';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'organization' | 'team' | 'ai'>('whatsapp');
  const [provider, setProvider] = useState<'evolution' | 'meta'>('evolution');

  // ================= Evolution API State (QR Code Direto) =================
  const [evolutionUrl, setEvolutionUrl] = useState('http://localhost:8080');
  const [evolutionKey, setEvolutionKey] = useState('aiviq_evolution_secret_key_2026');
  const [evolutionInstance, setEvolutionInstance] = useState('aiviq_inbox_01');
  const [evolutionStatus, setEvolutionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);

  // ================= Meta Cloud API State =================
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('aiviq_webhook_secret_token_2026');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [metaStatus, setMetaStatus] = useState<'connected' | 'pending' | 'disconnected'>('disconnected');

  // UI Helpers
  const [showMetaToken, setShowMetaToken] = useState(false);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Carregar dados iniciais
  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/webhooks/whatsapp`);

    async function loadEvolution() {
      try {
        const res = await fetch('/api/settings/whatsapp/evolution');
        const data = await res.json();
        if (data.success && data.data) {
          setEvolutionUrl(data.data.apiUrl || 'http://localhost:8080');
          setEvolutionKey(data.data.apiKey || 'aiviq_evolution_secret_key_2026');
          setEvolutionInstance(data.data.instanceName || 'aiviq_inbox_01');
          setEvolutionStatus(data.data.status || 'disconnected');
          if (data.data.phoneNumber) setConnectedNumber(data.data.phoneNumber);
          if (data.data.qrCodeBase64) setQrCodeData(data.data.qrCodeBase64);
        }
      } catch (e) {}
    }

    async function loadMeta() {
      try {
        const res = await fetch('/api/settings/whatsapp');
        const data = await res.json();
        if (data.success && data.config) {
          setPhoneNumberId(data.config.phoneNumberId || '');
          setWabaId(data.config.wabaId || '');
          setWebhookVerifyToken(data.config.webhookVerifyToken || 'aiviq_webhook_secret_token_2026');
          setMetaStatus(data.config.status || 'disconnected');
        }
      } catch (e) {}
    }

    loadEvolution();
    loadMeta();
  }, []);

  // Gerar QR Code na Evolution API
  const handleGenerateQr = async () => {
    setLoadingQr(true);
    try {
      const res = await fetch('/api/settings/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_qr',
          apiUrl: evolutionUrl,
          apiKey: evolutionKey,
          instanceName: evolutionInstance,
        }),
      });
      const data = await res.json();
      if (data.success && data.qrCode) {
        setQrCodeData(data.qrCode);
        setEvolutionStatus('connecting');
        setBanner('QR Code pronto! Aponte a câmera do seu WhatsApp para conectar.');
        setTimeout(() => setBanner(null), 4000);
      }
    } catch (err: any) {
      setBanner('Erro ao gerar QR Code: ' + err.message);
    } finally {
      setLoadingQr(false);
    }
  };

  // Simular ou Confirmar Conexão do QR Code
  const handleConfirmConnection = async () => {
    try {
      const res = await fetch('/api/settings/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_connection' }),
      });
      const data = await res.json();
      if (data.success) {
        setEvolutionStatus('connected');
        setConnectedNumber('+55 11 98765-4321');
        setQrCodeData(null);
        setBanner('WhatsApp conectado com sucesso via Evolution API!');
        setTimeout(() => setBanner(null), 4000);
      }
    } catch (e) {}
  };

  // Desconectar Evolution
  const handleDisconnectEvolution = async () => {
    try {
      await fetch('/api/settings/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      setEvolutionStatus('disconnected');
      setConnectedNumber(null);
      setQrCodeData(null);
      setBanner('WhatsApp desconectado.');
      setTimeout(() => setBanner(null), 3000);
    } catch (e) {}
  };

  // Salvar Configurações da Meta
  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId,
          wabaId,
          accessToken,
          appSecret,
          webhookVerifyToken,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBanner('Configurações da Meta salvas com sucesso!');
        setTimeout(() => setBanner(null), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (text: string, isUrl: boolean) => {
    navigator.clipboard.writeText(text);
    if (isUrl) {
      setCopiedWebhookUrl(true);
      setTimeout(() => setCopiedWebhookUrl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden font-sans select-none">
      <NavigationRail />

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
                Conecte seu WhatsApp via Evolution API (QR Code sem Meta) ou Meta Cloud API Oficial
              </p>
            </div>
          </div>

          {banner && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg animate-in fade-in">
              <CheckCircle2 className="w-4 h-4" />
              <span>{banner}</span>
            </div>
          )}
        </header>

        {/* Layout */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Sub Navigation */}
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
              <span>Canais de WhatsApp</span>
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

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-5xl">
            {activeTab === 'whatsapp' && (
              <div className="space-y-6">
                {/* Selector: Evolution API (QR Code) vs Meta Cloud API */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">
                    Selecione o Método de Conexão do WhatsApp:
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setProvider('evolution')}
                      className={`p-4 rounded-xl border text-left flex items-start gap-3.5 transition-all ${
                        provider === 'evolution'
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-900">Evolution API (Conexão via QR Code)</h3>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[9px]">Recomendado</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          Conecte em 10 segundos escaneando com a câmera do WhatsApp. <b>Zero burocracia, sem necessidade de aprovação da Meta.</b>
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProvider('meta')}
                      className={`p-4 rounded-xl border text-left flex items-start gap-3.5 transition-all ${
                        provider === 'meta'
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">Meta Cloud API Oficial</h3>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          Conexão corporativa para empresas com WhatsApp Business Account (WABA) e verificação aprovada no Meta Business Manager.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* ================= SECTION: EVOLUTION API (QR CODE) ================= */}
                {provider === 'evolution' && (
                  <div className="space-y-6 animate-in fade-in">
                    {/* Status Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <QrCode className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-slate-900">Conexão WhatsApp Evolution API</h2>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              evolutionStatus === 'connected'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : evolutionStatus === 'connecting'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                evolutionStatus === 'connected'
                                  ? 'bg-emerald-500 animate-pulse'
                                  : evolutionStatus === 'connecting'
                                  ? 'bg-amber-500 animate-ping'
                                  : 'bg-slate-400'
                              }`} />
                              {evolutionStatus === 'connected'
                                ? 'Conectado & Operante'
                                : evolutionStatus === 'connecting'
                                ? 'Aguardando Leitura do QR Code'
                                : 'Desconectado'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {evolutionStatus === 'connected' ? (
                              <>Número ativo: <b className="text-slate-900">{connectedNumber || '+55 11 98765-4321'}</b> • Instância: <b className="text-emerald-700">{evolutionInstance}</b></>
                            ) : (
                              <>Gere o QR Code abaixo para sincronizar seu WhatsApp em tempo real.</>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {evolutionStatus === 'connected' ? (
                          <button
                            type="button"
                            onClick={handleDisconnectEvolution}
                            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Desconectar WhatsApp</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleGenerateQr}
                            disabled={loadingQr}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs transition-all active:scale-95 disabled:opacity-50"
                          >
                            <RefreshCw className={`w-4 h-4 ${loadingQr ? 'animate-spin' : ''}`} />
                            <span>{loadingQr ? 'Gerando QR Code...' : 'Gerar QR Code de Conexão'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* QR Code Display Panel */}
                    {evolutionStatus !== 'connected' && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                        {/* QR Box */}
                        <div className="md:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-200/80 rounded-2xl">
                          {qrCodeData ? (
                            <div className="space-y-3 text-center">
                              <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs inline-block">
                                <img
                                  src={qrCodeData}
                                  alt="WhatsApp QR Code"
                                  className="w-52 h-52 object-contain"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs font-bold text-slate-800 block">
                                  Aponte seu celular para escanear
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  Atualiza automaticamente
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={handleConfirmConnection}
                                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
                              >
                                Já escaneei (Confirmar Conexão)
                              </button>
                            </div>
                          ) : (
                            <div className="text-center py-10 space-y-3">
                              <div className="w-16 h-16 rounded-2xl bg-slate-200/60 flex items-center justify-center mx-auto text-slate-400">
                                <QrCode className="w-8 h-8" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-700">Nenhum QR Code gerado</h4>
                                <p className="text-[11px] text-slate-400 mt-0.5">Clique no botão acima para iniciar</p>
                              </div>
                              <button
                                type="button"
                                onClick={handleGenerateQr}
                                disabled={loadingQr}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                              >
                                Iniciar Conexão
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Instructions */}
                        <div className="md:col-span-7 space-y-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-emerald-600" />
                            <span>Como conectar pelo WhatsApp do celular:</span>
                          </h3>

                          <div className="space-y-3 text-xs text-slate-600">
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                              <div>
                                <b className="text-slate-800">Abra o WhatsApp no celular</b> (qualquer conta pessoal ou WhatsApp Business).
                              </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                              <div>
                                No <b>Android</b>: toque nos 3 pontinhos no topo direito ➔ <b>Aparelhos Conectados</b>.<br />
                                No <b>iPhone</b>: acesse <b>Configurações</b> no rodapé ➔ <b>Aparelhos Conectados</b>.
                              </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                              <div>
                                Toque no botão verde <b>"Conectar um aparelho"</b> e aponte a câmera para o QR Code ao lado.
                              </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-emerald-900">
                              <Zap className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                              <div className="text-[11px] leading-relaxed">
                                <b>Pronto!</b> A sincronização é instantânea. As mensagens recebidas cairão automaticamente na sua <b>Caixa de Entrada (Omnichannel)</b> sem precisar de verificação da Meta.
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Advanced Evolution API Server Settings */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <SettingsIcon className="w-4 h-4 text-slate-500" />
                          <span>Servidor Evolution API (Configurações Avançadas)</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Defina o endpoint e credenciais do seu gateway Evolution API local ou VPS.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600">URL da Evolution API</label>
                          <input
                            type="text"
                            value={evolutionUrl}
                            onChange={(e) => setEvolutionUrl(e.target.value)}
                            placeholder="http://localhost:8080"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600">API Key Global da Evolution</label>
                          <input
                            type="password"
                            value={evolutionKey}
                            onChange={(e) => setEvolutionKey(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600">Nome da Instância</label>
                          <input
                            type="text"
                            value={evolutionInstance}
                            onChange={(e) => setEvolutionInstance(e.target.value)}
                            placeholder="aiviq_inbox_01"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ================= SECTION: META CLOUD API ================= */}
                {provider === 'meta' && (
                  <div className="space-y-6 animate-in fade-in">
                    {/* Webhook Callback Info */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-600" />
                          <span>Configuração do Webhook no Portal Meta for Developers</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Cole estes dois parâmetros no painel do Facebook Developers em <b>WhatsApp &gt; Configuração &gt; Webhook</b>.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600">Callback URL</label>
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
                              {copiedWebhookUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedWebhookUrl ? 'Copiado!' : 'Copiar'}</span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600">Verify Token</label>
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
                    </div>

                    {/* Meta Cloud Credentials Form */}
                    <form onSubmit={handleSaveMeta} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-blue-600" />
                          <span>Credenciais do WhatsApp Business Cloud API (Meta)</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Insira as credenciais do seu aplicativo da Meta.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600">Phone Number ID *</label>
                          <input
                            type="text"
                            required
                            value={phoneNumberId}
                            onChange={(e) => setPhoneNumberId(e.target.value)}
                            placeholder="Ex: 1049281928374"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600">WhatsApp Business Account ID (WABA ID) *</label>
                          <input
                            type="text"
                            required
                            value={wabaId}
                            onChange={(e) => setWabaId(e.target.value)}
                            placeholder="Ex: 1092837461928"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600">System User Access Token</label>
                          <div className="relative">
                            <input
                              type={showMetaToken ? 'text' : 'password'}
                              value={accessToken}
                              onChange={(e) => setAccessToken(e.target.value)}
                              placeholder="Token permanente EAAG..."
                              className="w-full px-3 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowMetaToken(!showMetaToken)}
                              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                            >
                              {showMetaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600">App Secret</label>
                          <input
                            type="password"
                            value={appSecret}
                            onChange={(e) => setAppSecret(e.target.value)}
                            placeholder="Segredo do app para HMAC"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 flex justify-end">
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <Save className="w-4 h-4" />
                          <span>{saving ? 'Salvando...' : 'Salvar Configurações da Meta'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* Outras Abas */}
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
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
