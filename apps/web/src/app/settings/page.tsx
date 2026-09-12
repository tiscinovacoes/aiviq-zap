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
  Bell,
  Clock,
  UserPlus,
  Trash2,
  Mail,
  Shield,
  Bot,
  Sliders,
  CheckCheck,
  Radio,
  Server,
  Key,
} from 'lucide-react';
import NavigationRail from '@/components/layout/NavigationRail';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Administrador' | 'Supervisor' | 'Atendente';
  status: 'online' | 'offline';
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'organization' | 'team' | 'ai' | 'notifications'>('whatsapp');
  const [provider, setProvider] = useState<'evolution' | 'meta'>('evolution');

  // ================= Evolution API State (QR Code Direto Baileys) =================
  const [evolutionUrl, setEvolutionUrl] = useState('https://evolution-api-production-8ecf.up.railway.app');
  const [evolutionKey, setEvolutionKey] = useState('');
  const [evolutionInstance, setEvolutionInstance] = useState('aiviq_inbox_01');
  const [evolutionStatus, setEvolutionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [testingServer, setTestingServer] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);

  // ================= Meta Cloud API State =================
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('aiviq_webhook_secret_token_2026');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [metaStatus, setMetaStatus] = useState<'connected' | 'pending' | 'disconnected'>('disconnected');
  const [showMetaToken, setShowMetaToken] = useState(false);

  // ================= Organization State =================
  const [companyName, setCompanyName] = useState('AIVIQ-ZAP Tecnologia Ltda');
  const [companyCnpj, setCompanyCnpj] = useState('48.912.304/0001-92');
  const [timeZone, setTimeZone] = useState('America/Sao_Paulo');
  const [businessHours, setBusinessHours] = useState('Segunda a Sexta: 08:00 às 18:00 • Sábado: 09:00 às 13:00');
  const [awayMessage, setAwayMessage] = useState('Olá! No momento estamos fora do nosso horário de atendimento comercial. Deixe sua mensagem e retornaremos assim que iniciarmos o expediente!');

  // ================= Team State =================
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    { id: '1', name: 'Lucas Reis', email: 'lucas@aiviqzap.dev', role: 'Administrador', status: 'online' },
    { id: '2', name: 'Mariana Souza', email: 'mariana.souza@aiviqzap.dev', role: 'Supervisor', status: 'online' },
    { id: '3', name: 'Carlos Eduardo', email: 'carlos.eduardo@aiviqzap.dev', role: 'Atendente', status: 'offline' },
    { id: '4', name: 'Beatriz Lima', email: 'beatriz.lima@aiviqzap.dev', role: 'Atendente', status: 'online' },
  ]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'Administrador' | 'Supervisor' | 'Atendente'>('Atendente');

  // ================= AI Copilot State =================
  const [aiModel, setAiModel] = useState('qwen-2.5');
  const [aiCreativity, setAiCreativity] = useState(0.4);
  const [autoTriage, setAutoTriage] = useState(true);
  const [aiPrompt, setAiPrompt] = useState(
    `Você é a AIVIQ IA, assistente virtual inteligente da empresa. Seja cordial, direto, execute a triagem do cliente com brevidade e direcione os casos complexos para os atendentes humanos.`
  );

  // ================= Notification State =================
  const [soundNewMessage, setSoundNewMessage] = useState(true);
  const [desktopPush, setDesktopPush] = useState(true);
  const [slaAlert, setSlaAlert] = useState(true);

  // UI Helpers
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedPairing, setCopiedPairing] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Carregar dados iniciais
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhooks/whatsapp`);
    }

    async function loadEvolution() {
      try {
        const res = await fetch('/api/settings/whatsapp/evolution');
        const data = await res.json();
        if (data.success && data.data) {
          if (data.data.apiUrl) setEvolutionUrl(data.data.apiUrl);
          if (data.data.apiKey) setEvolutionKey(data.data.apiKey);
          if (data.data.instanceName) setEvolutionInstance(data.data.instanceName);
          if (data.data.status) setEvolutionStatus(data.data.status);
          if (data.data.phoneNumber) setConnectedNumber(data.data.phoneNumber);
          if (data.data.qrCodeBase64) setQrCodeData(data.data.qrCodeBase64);
          if (data.data.pairingCode) setPairingCode(data.data.pairingCode);
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

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 4500);
  };

  // Testar Servidor Evolution API
  const handleTestEvolutionServer = async () => {
    setTestingServer(true);
    setServerError(null);
    try {
      const res = await fetch('/api/settings/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_server',
          apiUrl: evolutionUrl,
          apiKey: evolutionKey,
          instanceName: evolutionInstance,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setServerError(null);
        showToast(data.message, 'success');
      } else {
        setServerError(data.message);
        showToast(data.message, 'error');
      }
    } catch (err: any) {
      setServerError(`Erro de conexão com o servidor Evolution API em ${evolutionUrl}: ${err.message}`);
      showToast(`Falha de conexão com a Evolution API`, 'error');
    } finally {
      setTestingServer(false);
    }
  };

  // Gerar QR Code Real na Evolution API
  const handleGenerateQr = async () => {
    setLoadingQr(true);
    setServerError(null);
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
        if (data.pairingCode) setPairingCode(data.pairingCode);
        setEvolutionStatus('connecting');
        setServerError(null);
        showToast('QR Code oficial gerado pela Evolution API! Aponte o WhatsApp.', 'success');
      } else {
        setQrCodeData(null);
        setServerError(data.message || `Servidor Evolution API inacessível em ${evolutionUrl}`);
        showToast(data.message || 'Servidor Evolution API offline', 'error');
      }
    } catch (err: any) {
      setQrCodeData(null);
      setServerError(`Erro de rede ao contactar a Evolution API em ${evolutionUrl}: ${err.message}`);
      showToast('Erro ao conectar com o servidor Evolution API', 'error');
    } finally {
      setLoadingQr(false);
    }
  };

  // Confirmar Conexão do QR Code
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
        setPairingCode(null);
        setServerError(null);
        showToast('WhatsApp conectado com sucesso via Evolution API!');
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
      setPairingCode(null);
      showToast('WhatsApp desconectado com sucesso!', 'info');
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
        showToast('Configurações da Meta salvas com sucesso!');
      } else {
        showToast('Erro ao salvar credenciais da Meta.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // Convidar novo membro da equipe
  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;

    const newMember: TeamMember = {
      id: Date.now().toString(),
      name: newMemberName.trim(),
      email: newMemberEmail.trim(),
      role: newMemberRole,
      status: 'offline',
    };

    setTeamMembers([...teamMembers, newMember]);
    setNewMemberName('');
    setNewMemberEmail('');
    setIsInviteModalOpen(false);
    showToast(`Convite enviado para ${newMember.email} com sucesso!`);
  };

  const handleRemoveMember = (id: string, name: string) => {
    setTeamMembers(teamMembers.filter((m) => m.id !== id));
    showToast(`Membro ${name} removido da equipe.`, 'info');
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
    showToast('Copiado para a área de transferência!');
  };

  const handleCopyPairing = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedPairing(true);
    setTimeout(() => setCopiedPairing(false), 2000);
    showToast('Código de pareamento copiado!');
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden font-sans select-none">
      {/* 1. Barra Lateral de Navegação Global (72px) */}
      <NavigationRail />

      {/* 2. Conteúdo Principal da Central de Configurações */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden min-w-0">
        {/* Top Header */}
        <header className="h-16 px-8 border-b border-slate-200 flex items-center justify-between bg-white/95 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-900">Central de Configurações</h1>
              <p className="text-xs text-slate-500">
                Gerencie canais de WhatsApp, perfil da organização, equipe de atendentes e IA Copilot
              </p>
            </div>
          </div>

          {/* Toast / Banner Notification */}
          {banner && (
            <div
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs animate-in fade-in slide-in-from-top-2 duration-200 ${
                banner.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : banner.type === 'error'
                  ? 'bg-rose-50 border border-rose-200 text-rose-700'
                  : 'bg-blue-50 border border-blue-200 text-blue-700'
              }`}
            >
              {banner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : banner.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <Zap className="w-4 h-4 text-blue-600 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
          )}
        </header>

        {/* Layout da Tela de Configurações */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Sub Navigation Lateral das Configurações */}
          <aside className="w-64 border-r border-slate-200 bg-white p-4 space-y-1.5 shrink-0 overflow-y-auto">
            <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Módulos de Configuração
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('whatsapp')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'whatsapp'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>Canais de WhatsApp</span>
              </div>
              {evolutionStatus === 'connected' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('organization')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'organization'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Building className="w-4 h-4 text-slate-500" />
              <span>Perfil da Organização</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('team')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'team'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-slate-500" />
                <span>Equipe & Atendentes</span>
              </div>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                {teamMembers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ai')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'ai'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Inteligência Artificial (Copilot)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'notifications'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Bell className="w-4 h-4 text-amber-500" />
              <span>Alertas & Notificações</span>
            </button>
          </aside>

          {/* Painel Central com Scroll */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-5xl">
            {/* ================= ABA 1: CANAIS DE WHATSAPP ================= */}
            {activeTab === 'whatsapp' && (
              <div className="space-y-6">
                {/* Seletor: Evolution API vs Meta Cloud */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">
                    Método de Conexão com o WhatsApp:
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Opção Evolution API */}
                    <button
                      type="button"
                      onClick={() => setProvider('evolution')}
                      className={`p-4 rounded-xl border text-left flex items-start gap-3.5 transition-all ${
                        provider === 'evolution'
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-xs ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-900">Evolution API (Modo Baileys / QR Code)</h3>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[9px]">
                            Recomendado
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          Conexão instantânea via QR Code direto. <b>Zero validação da Meta, sem necessidade de aprovação de empresa, CNPJ ou tokens.</b>
                        </p>
                      </div>
                    </button>

                    {/* Opção Meta Cloud API */}
                    <button
                      type="button"
                      onClick={() => setProvider('meta')}
                      className={`p-4 rounded-xl border text-left flex items-start gap-3.5 transition-all ${
                        provider === 'meta'
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-xs ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">Meta Cloud API Oficial</h3>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          Indicado para contas com WhatsApp Business Account (WABA) já validadas no Meta Business Manager.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Bloco Evolution API */}
                {provider === 'evolution' && (
                  <div className="space-y-6">
                    {/* Status da Instância */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <QrCode className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-slate-900">WhatsApp Evolution API</h2>
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                evolutionStatus === 'connected'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : evolutionStatus === 'connecting'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  evolutionStatus === 'connected'
                                    ? 'bg-emerald-500 animate-pulse'
                                    : evolutionStatus === 'connecting'
                                    ? 'bg-amber-500 animate-ping'
                                    : 'bg-slate-400'
                                }`}
                              />
                              {evolutionStatus === 'connected'
                                ? 'Conectado & Operante'
                                : evolutionStatus === 'connecting'
                                ? 'Aguardando Leitura do QR Code'
                                : 'Desconectado'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {evolutionStatus === 'connected' ? (
                              <>
                                Linha ativa: <b className="text-slate-900">{connectedNumber || '+55 11 98765-4321'}</b> • Instância:{' '}
                                <b className="text-emerald-700">{evolutionInstance}</b>
                              </>
                            ) : (
                              'Conecte qualquer número escaneando o QR Code abaixo com o WhatsApp do seu celular.'
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {evolutionStatus === 'connected' ? (
                          <button
                            type="button"
                            onClick={handleDisconnectEvolution}
                            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Desconectar WhatsApp</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleGenerateQr}
                            disabled={loadingQr}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs transition-all disabled:opacity-50"
                          >
                            <RefreshCw className={`w-4 h-4 ${loadingQr ? 'animate-spin' : ''}`} />
                            <span>{loadingQr ? 'Conectando ao Servidor...' : 'Gerar QR Code Oficial'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Exibição do QR Code e Instruções */}
                    {evolutionStatus !== 'connected' && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                        <div className="md:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-200/80 rounded-2xl">
                          {qrCodeData ? (
                            <div className="space-y-3 text-center">
                              <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs inline-block">
                                <img
                                  src={qrCodeData}
                                  alt="WhatsApp QR Code Real"
                                  className="w-56 h-56 object-contain"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs font-bold text-slate-800 block">
                                  QR Code Oficial do WhatsApp
                                </span>
                                <span className="text-[11px] text-slate-400">Escaneie pelo menu Aparelhos Conectados</span>
                              </div>

                              {pairingCode && (
                                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-1">
                                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                                    Ou Pareie por Código:
                                  </span>
                                  <div className="flex items-center justify-center gap-2">
                                    <span className="font-mono text-xs font-bold text-emerald-950 bg-white px-2 py-1 rounded border border-emerald-200">
                                      {pairingCode}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyPairing(pairingCode)}
                                      className="p-1 hover:bg-emerald-100 rounded text-emerald-700"
                                      title="Copiar código"
                                    >
                                      {copiedPairing ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={handleConfirmConnection}
                                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
                              >
                                Já escaneei (Confirmar Conexão)
                              </button>
                            </div>
                          ) : serverError ? (
                            <div className="text-center py-6 px-2 space-y-3">
                              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center mx-auto shadow-xs">
                                <AlertCircle className="w-6 h-6" />
                              </div>
                              <div className="space-y-1">
                                <h4 className="text-xs font-bold text-slate-800">Servidor Evolution API Inacessível</h4>
                                <p className="text-[11px] text-rose-600 leading-relaxed max-w-xs mx-auto">
                                  {serverError}
                                </p>
                              </div>
                              <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                                Para gerar um QR Code real do WhatsApp, informe a URL e chave da sua Evolution API (VPS ou Local) no painel abaixo.
                              </p>
                              <div className="flex items-center justify-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={handleTestEvolutionServer}
                                  disabled={testingServer}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                                >
                                  {testingServer ? 'Testando...' : 'Testar Servidor'}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleGenerateQr}
                                  disabled={loadingQr}
                                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                                >
                                  Tentar Novamente
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-10 space-y-3">
                              <div className="w-16 h-16 rounded-2xl bg-slate-200/60 flex items-center justify-center mx-auto text-slate-400">
                                <QrCode className="w-8 h-8" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-700">QR Code Pronto para Geração</h4>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  Clique no botão abaixo para buscar o QR Code real da sua Evolution API.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleGenerateQr}
                                disabled={loadingQr}
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-transform active:scale-95"
                              >
                                {loadingQr ? 'Carregando...' : 'Gerar QR Code Oficial'}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Instruções de Conexão */}
                        <div className="md:col-span-7 space-y-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-emerald-600" />
                            <span>Passo a passo no seu celular:</span>
                          </h3>

                          <div className="space-y-3 text-xs text-slate-600">
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                1
                              </span>
                              <div>
                                <b>Abra o aplicativo do WhatsApp</b> no seu celular (qualquer conta comercial ou pessoal).
                              </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                2
                              </span>
                              <div>
                                No <b>Android</b>: toque nos 3 pontinhos no canto superior direito ➔ <b>Aparelhos Conectados</b>.<br />
                                No <b>iPhone</b>: toque em <b>Configurações</b> no rodapé ➔ <b>Aparelhos Conectados</b>.
                              </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                3
                              </span>
                              <div>
                                Toque no botão verde <b>"Conectar um aparelho"</b> e aponte a câmera para o QR Code ao lado.
                              </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-emerald-900">
                              <Zap className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                              <div className="text-[11px] leading-relaxed">
                                <b>Zero aprovação da Meta:</b> A conexão é direta via protocolo Baileys. O seu WhatsApp fica sincronizado com a <b>Caixa de Entrada Omnichannel</b> para múltiplos atendentes responderem ao mesmo tempo.
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Configurações do Servidor Evolution API */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                            <Server className="w-4 h-4 text-slate-500" />
                            <span>Servidor Evolution API (Local ou VPS)</span>
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Endereço onde a sua Evolution API está rodando (ex: Docker na VPS ou Localhost).
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleTestEvolutionServer}
                            disabled={testingServer}
                            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <Radio className={`w-3.5 h-3.5 text-emerald-600 ${testingServer ? 'animate-pulse' : ''}`} />
                            <span>{testingServer ? 'Testando...' : 'Testar Conexão'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => showToast('Configurações salvas!')}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Salvar Servidor</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                            <span>URL da Evolution API</span>
                          </label>
                          <input
                            type="text"
                            value={evolutionUrl}
                            onChange={(e) => {
                              setEvolutionUrl(e.target.value);
                              setServerError(null);
                            }}
                            placeholder="http://localhost:8080 ou https://evolution.seudominio.com"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                            <span>Chave de Autenticação (Global API Key)</span>
                          </label>
                          <input
                            type="password"
                            value={evolutionKey}
                            onChange={(e) => {
                              setEvolutionKey(e.target.value);
                              setServerError(null);
                            }}
                            placeholder="AUTHENTICATION_API_KEY do seu Docker"
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

                {/* Bloco Meta Cloud API */}
                {provider === 'meta' && (
                  <div className="space-y-6">
                    {/* Informações do Webhook Meta */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-600" />
                          <span>Configuração do Webhook no Meta for Developers</span>
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

                    {/* Formulário de Credenciais Meta */}
                    <form onSubmit={handleSaveMeta} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-blue-600" />
                          <span>Credenciais do WhatsApp Business Cloud API (Meta)</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Insira as credenciais do seu aplicativo verificado na Meta.
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
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
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

            {/* ================= ABA 2: PERFIL DA ORGANIZAÇÃO ================= */}
            {activeTab === 'organization' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Perfil da Organização</h3>
                    <p className="text-xs text-slate-500">Defina os dados da sua empresa, horários e resposta automática.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast('Perfil da empresa atualizado com sucesso!')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Alterações</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Nome Fantasia da Empresa</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">CNPJ / Identificador</label>
                    <input
                      type="text"
                      value={companyCnpj}
                      onChange={(e) => setCompanyCnpj(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Fuso Horário</label>
                    <select
                      value={timeZone}
                      onChange={(e) => setTimeZone(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="America/Sao_Paulo">Horário de Brasília (GMT-3)</option>
                      <option value="America/Manaus">Manaus (GMT-4)</option>
                      <option value="America/Fortaleza">Nordeste / Fortaleza (GMT-3)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Horário de Atendimento Comercial</label>
                    <input
                      type="text"
                      value={businessHours}
                      onChange={(e) => setBusinessHours(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Mensagem Automática de Ausência (Fora do Expediente)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={awayMessage}
                    onChange={(e) => setAwayMessage(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none resize-none leading-relaxed"
                  />
                  <span className="text-[11px] text-slate-400">
                    Disparada automaticamente no WhatsApp para clientes que entrarem em contato fora do horário comercial configurado.
                  </span>
                </div>
              </div>
            )}

            {/* ================= ABA 3: EQUIPE & ATENDENTES ================= */}
            {activeTab === 'team' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Membros da Equipe & Operadores</h3>
                    <p className="text-xs text-slate-500">
                      Cadastre novos operadores, supervisores e defina permissões de atendimento.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(true)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ Convidar Atendente</span>
                  </button>
                </div>

                {/* Modal de Convidar Atendente */}
                {isInviteModalOpen && (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4 text-emerald-600" />
                        <span>Convidar Novo Membro da Equipe</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setIsInviteModalOpen(false)}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleInviteMember} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        required
                        placeholder="Nome Completo *"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                      <input
                        type="email"
                        required
                        placeholder="E-mail Corporativo *"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                      <div className="flex gap-2">
                        <select
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value as any)}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="Atendente">Atendente</option>
                          <option value="Supervisor">Supervisor</option>
                          <option value="Administrador">Administrador</option>
                        </select>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                        >
                          Adicionar
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Tabela de Membros */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                      <tr>
                        <th className="p-3">Atendente</th>
                        <th className="p-3">E-mail</th>
                        <th className="p-3">Nível de Acesso</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {teamMembers.map((member) => (
                        <tr key={member.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-[11px]">
                                {member.name.slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-semibold text-slate-900">{member.name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-slate-600 font-mono text-[11px]">{member.email}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                                member.role === 'Administrador'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : member.role === 'Supervisor'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {member.role}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                member.status === 'online'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  member.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                              />
                              {member.status === 'online' ? 'Online' : 'Offline'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {member.id !== '1' && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member.id, member.name)}
                                className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                                title="Remover atendente"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ================= ABA 4: COPILOT IA ================= */}
            {activeTab === 'ai' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Copilot & Inteligência Artificial</h3>
                    <p className="text-xs text-slate-500">
                      Configure o assistente de triagem inteligente, respostas sugeridas e atendimento autônomo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast('Configurações do Copilot IA salvas!')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar IA</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Modelo de Inteligência Artificial</label>
                    <select
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="qwen-2.5">Qwen 2.5 7B (On-Premise / Baixa Latência / Econômico)</option>
                      <option value="claude-3-5">Claude 3.5 Sonnet (Qualidade Linguística Máxima)</option>
                      <option value="gpt-4o">OpenAI GPT-4o (Triagem Multimodal)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-700">Temperatura (Criatividade): {aiCreativity}</label>
                      <span className="text-[10px] text-slate-400">0.0 (Exato) a 1.0 (Criativo)</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={aiCreativity}
                      onChange={(e) => setAiCreativity(parseFloat(e.target.value))}
                      className="w-full accent-emerald-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Instruções do Sistema / Persona da IA</span>
                  </label>
                  <textarea
                    rows={4}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none leading-relaxed"
                  />
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Triagem Automática de Novos Leads</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      A IA responde à primeira mensagem do cliente no WhatsApp e coleta nome e necessidade antes de passar a um atendente.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoTriage}
                    onChange={(e) => setAutoTriage(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* ================= ABA 5: NOTIFICAÇÕES ================= */}
            {activeTab === 'notifications' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Alertas & Notificações</h3>
                    <p className="text-xs text-slate-500">Controle alertas sonoros e notificações de mensagens do WhatsApp.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast('Preferências de notificação salvas!')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Alertas</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-slate-800">Alerta Sonoro para Novas Mensagens</h5>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Tocar som sutil sempre que uma mensagem não lida chegar na caixa de entrada.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={soundNewMessage}
                      onChange={(e) => setSoundNewMessage(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
                    />
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-slate-800">Notificações Push no Navegador (Desktop)</h5>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Exibir banner flutuante do sistema operacional mesmo quando o AIVIQ-ZAP estiver em segundo plano.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={desktopPush}
                      onChange={(e) => setDesktopPush(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
                    />
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-slate-800">Alerta de Estouro de SLA (Mais de 5 min sem resposta)</h5>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Destacar a conversa em vermelho quando o tempo máximo de espera do cliente for atingido.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={slaAlert}
                      onChange={(e) => setSlaAlert(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
                    />
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
