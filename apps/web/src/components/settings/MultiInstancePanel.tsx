'use client';

import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  Plus,
  QrCode,
  Power,
  Trash2,
  Check,
  X,
  RefreshCw,
  Loader2,
  Send,
  Globe,
} from 'lucide-react';
import { useInstanceStore } from '@/store/useInstanceStore';

const statusStyle: Record<string, { dot: string; text: string; label: string }> = {
  connected: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Conectado' },
  connecting: { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Conectando…' },
  disconnected: { dot: 'bg-slate-300', text: 'text-slate-500', label: 'Desconectado' },
};

export default function MultiInstancePanel() {
  const { instances, selected, fetchInstances, setSelected, setDispatchEnabled, setMaturidade } =
    useInstanceStore();
  const repararWebhook = useInstanceStore((s) => s.repararWebhook);
  const setProxy = useInstanceStore((s) => s.setProxy);
  const removeProxy = useInstanceStore((s) => s.removeProxy);
  const liberarCooldown = useInstanceStore((s) => s.liberarCooldown);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [qrModal, setQrModal] = useState<{
    instanceName: string;
    label: string;
    qrCode?: string;
    pairingCode?: string;
  } | null>(null);

  const [proxyModal, setProxyModal] = useState<{ instanceName: string; label: string } | null>(null);
  const [proxyForm, setProxyForm] = useState({ host: '', port: '', protocol: 'http', username: '', password: '' });
  const [proxySaving, setProxySaving] = useState(false);
  const [proxyMsg, setProxyMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchInstances();
    const id = setInterval(fetchInstances, 15000);
    return () => clearInterval(id);
  }, [fetchInstances]);

  // Enquanto o modal QR estiver aberto, faz polling do status; ao conectar, fecha.
  useEffect(() => {
    if (!qrModal) return;
    const id = setInterval(async () => {
      await fetchInstances();
      const inst = useInstanceStore.getState().instances.find(
        (i) => i.instanceName === qrModal.instanceName
      );
      if (inst?.status === 'connected') {
        setQrModal(null);
      }
    }, 3500);
    return () => clearInterval(id);
  }, [qrModal, fetchInstances]);

  // O QR code do WhatsApp expira rapido (segundos). Sem isto, ele ficava "morto"
  // na tela ate o operador notar e clicar manualmente em "Gerar novo QR" -- e
  // enquanto isso o celular so recusava a leitura, parecendo bug. Renova sozinho
  // a cada 25s enquanto o modal estiver aberto e o numero ainda nao conectou.
  useEffect(() => {
    if (!qrModal) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/instances/${encodeURIComponent(qrModal.instanceName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_qr' }),
        });
        const data = await res.json();
        if (data.success && data.qrCode) {
          setQrModal((cur) =>
            cur && cur.instanceName === qrModal.instanceName
              ? { ...cur, qrCode: data.qrCode, pairingCode: data.pairingCode }
              : cur
          );
        }
      } catch {
        // silencioso: tenta de novo no proximo ciclo
      }
    }, 25000);
    return () => clearInterval(id);
  }, [qrModal?.instanceName]);

  async function handleCreate() {
    setError(null);
    const name = newName.trim();
    if (!/^[A-Za-z0-9_-]{3,48}$/.test(name)) {
      setError('Nome inválido. Use 3 a 48 caracteres: letras, números, _ ou -.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: name, label: newLabel.trim() || name }),
      });
      const data = await res.json();
      if (data.success) {
        // Instancia criada mas sem webhook e o pior cenario: ela conecta, dispara
        // normalmente e nao coleta NADA -- e o painel so mostra envios, entao o
        // problema passa despercebido por horas. Avisa alto na hora.
        if (data.webhookConfigurado === false) {
          setError(
            'Número criado, mas o webhook NÃO foi configurado' +
              (data.webhookErro ? ' (' + data.webhookErro + ')' : '') +
              '. Ele vai disparar sem receber respostas nem confirmações de entrega. ' +
              'Use o botão SEM WEBHOOK na lista para corrigir antes de usá-lo em campanha.'
          );
        }
        setShowAdd(false);
        setNewName('');
        setNewLabel('');
        await fetchInstances();
        setQrModal({
          instanceName: name,
          label: newLabel.trim() || name,
          qrCode: data.qrCode,
          pairingCode: data.pairingCode,
        });
        // Se não veio QR na criação, busca via get_qr.
        if (!data.qrCode) handleConnect(name, newLabel.trim() || name);
      } else {
        setError(data.message || 'Falha ao criar o número.');
      }
    } catch (e: any) {
      setError('Erro de rede ao criar o número.');
    } finally {
      setCreating(false);
    }
  }

  async function handleConnect(instanceName: string, label: string) {
    setBusy(instanceName);
    setError(null);
    try {
      const res = await fetch(`/api/instances/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_qr' }),
      });
      const data = await res.json();
      if (data.success && data.qrCode) {
        setQrModal({ instanceName, label, qrCode: data.qrCode, pairingCode: data.pairingCode });
      } else {
        setError(data.message || 'Não foi possível gerar o QR Code.');
      }
    } catch {
      setError('Erro de rede ao gerar o QR Code.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect(instanceName: string) {
    setBusy(instanceName);
    try {
      await fetch(`/api/instances/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      await fetchInstances();
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(instanceName: string) {
    if (!confirm(`Remover o número "${instanceName}"? Essa ação desconecta e apaga a instância no servidor.`)) {
      return;
    }
    setBusy(instanceName);
    try {
      await fetch(`/api/instances/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
      await fetchInstances();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Números de WhatsApp (Multi-instância)</h3>
            <p className="text-[11px] text-slate-500">
              Conecte vários celulares. A lista é <strong className="text-slate-700">dividida entre todos os números marcados em &quot;No disparo&quot;</strong> na importação — 1 lead a cada 5 min em cada (tempo fixo, das 8h às 21h), teto de 150/dia por número. O selo ATIVO é outra coisa: define só qual número o Inbox e os Contatos exibem.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setShowAdd((v) => !v);
            setError(null);
          }}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar número
        </button>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {showAdd && (
        <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Identificador da instância
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ex: aiviq_inbox_02"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Rótulo (exibição)
              </label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="ex: Ouvidoria Central"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
              Criar e conectar
            </button>
          </div>
        </div>
      )}

      {/* Resumo do cluster de disparo: o que realmente define a vazao da campanha. */}
      {(() => {
        const noPool = instances.filter((i) => i.dispatchEnabled !== false);
        const prontos = noPool.filter((i) => i.status === 'connected');
        return (
          <div className="mb-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5">
            <Send className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <p className="text-[11px] text-slate-600">
              <strong className="text-slate-800">
                {prontos.length} {prontos.length === 1 ? 'número disparando' : 'números disparando'}
              </strong>
              {noPool.length > prontos.length && (
                <span className="text-amber-700">
                  {' '}
                  ({noPool.length - prontos.length} marcado
                  {noPool.length - prontos.length === 1 ? '' : 's'} mas ainda não conectado
                  {noPool.length - prontos.length === 1 ? '' : 's'})
                </span>
              )}
              {' · '}
              capacidade de{' '}
              <strong className="text-slate-800">
                {prontos.reduce((s, i) => s + (i.capHoje ?? 0), 0)} mensagens hoje
              </strong>
              {prontos.length > 0 && ' (' + prontos.map((i) => i.capHoje ?? 0).join(' + ') + ')'}
            </p>
          </div>
        );
      })()}

      <div className="space-y-2">
        {instances.length === 0 && (
          <div className="text-xs text-slate-400 py-4 text-center">Nenhum número cadastrado ainda.</div>
        )}
        {instances.map((i) => {
          const st = statusStyle[i.status] || statusStyle.disconnected;
          const isSel = i.instanceName === selected;
          const noDisparo = i.dispatchEnabled !== false; // ausente = participa
          const isBusy = busy === i.instanceName;
          return (
            <div
              key={i.instanceName}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                isSel ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />
              {i.webhookOk === false && (
                <button
                  onClick={async () => {
                    setBusy(i.instanceName);
                    const ok = await repararWebhook(i.instanceName);
                    if (!ok) setError('Não foi possível configurar o webhook deste número.');
                    setBusy(null);
                  }}
                  disabled={busy === i.instanceName}
                  title="Sem webhook, a Evolution não avisa as respostas nem as confirmações de entrega: a campanha dispara mas não coleta nada."
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 shrink-0 hover:bg-rose-200 disabled:opacity-60"
                >
                  {busy === i.instanceName ? 'CORRIGINDO…' : 'SEM WEBHOOK ⟳'}
                </button>
              )}
              <button
                onClick={() => {
                  setProxyModal({ instanceName: i.instanceName, label: i.label });
                  setProxyForm({ host: '', port: '', protocol: 'http', username: '', password: '' });
                  setProxyMsg(null);
                }}
                title={
                  i.proxyOk
                    ? `IP dedicado: ${i.proxyHost}. Clique para trocar ou remover.`
                    : 'Sem IP dedicado: este número sai pelo IP COMPARTILHADO do servidor, o mesmo de todos os outros chips. Clique para configurar um proxy próprio.'
                }
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 flex items-center gap-0.5 ${
                  i.proxyOk
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                }`}
              >
                <Globe className="w-2.5 h-2.5" />
                {i.proxyOk ? 'IP PRÓPRIO' : 'IP COMPARTILHADO'}
              </button>
              {i.cooldownAte && new Date(i.cooldownAte) > new Date() && (
                <button
                  onClick={async () => {
                    setBusy(i.instanceName);
                    await liberarCooldown(i.instanceName);
                    setBusy(null);
                  }}
                  disabled={busy === i.instanceName}
                  title={'Fora do disparo até ' +
                    new Date(i.cooldownAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
                    (i.cooldownMotivo === 'falhas_seguidas' ? ' (falhas seguidas)' : ' (pausa de lote)') +
                    ' — clique para liberar agora'}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0 hover:bg-amber-200 disabled:opacity-60"
                >
                  {busy === i.instanceName
                    ? 'LIBERANDO…'
                    : (i.cooldownMotivo === 'falhas_seguidas' ? 'RESFRIANDO' : 'PAUSA DE LOTE') + ' ⟳'}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800 truncate">{i.label}</span>
                  {i.isDefault && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                      PADRÃO
                    </span>
                  )}
                  {isSel && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                      NO INBOX
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  <span className="font-mono">{i.instanceName}</span>
                  {' · '}
                  <span className={st.text}>{i.phoneNumber || st.label}</span>
                </div>
              </div>

              {/* WARM-UP: teto do dia e declaracao de maturidade. Um numero
                  novo despejando centenas de mensagens no primeiro dia e o
                  perfil de ban mais classico; um numero antigo estrangulado a
                  30/dia e perda pura. Por isso quem decide e o operador. */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <select
                  value={i.maturidade || 'novo'}
                  onChange={(e) => setMaturidade(i.instanceName, e.target.value as 'novo' | 'maduro')}
                  title="Número novo entra na curva de warm-up. Número já aquecido usa o teto cheio."
                  className={`text-[11px] font-semibold rounded-lg border px-2 py-1 cursor-pointer ${
                    i.maturidade === 'maduro'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  <option value="novo">Em warm-up</option>
                  <option value="maduro">Já aquecido</option>
                </select>
                <span className="text-[10px] text-slate-500 font-mono">
                  teto hoje: {i.capHoje ?? '—'}/dia
                </span>
              </div>

              {/* SELECAO MULTIPLA: quais chips entram no rodizio da campanha.
                  Independente do radio ATIVO (visualizacao do Inbox). */}
              <label
                title={
                  noDisparo
                    ? 'Este número participa do disparo das campanhas'
                    : 'Este número fica fora do disparo (segue disponível para atendimento no Inbox)'
                }
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer select-none shrink-0 transition-colors ${
                  noDisparo
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={noDisparo}
                  onChange={(e) => setDispatchEnabled(i.instanceName, e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
                />
                <span className="text-[11px] font-semibold whitespace-nowrap">No disparo</span>
              </label>

              <div className="flex items-center gap-1.5 shrink-0">
                {!isSel && (
                  <button
                    onClick={() => setSelected(i.instanceName)}
                    title="Exibir este número no Inbox e nos Contatos (não afeta o disparo)"
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50 flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Ver no Inbox
                  </button>
                )}
                {i.status === 'connected' ? (
                  <button
                    onClick={() => handleDisconnect(i.instanceName)}
                    disabled={isBusy}
                    title="Desconectar"
                    className="w-8 h-8 rounded-lg text-amber-600 border border-amber-200 hover:bg-amber-50 flex items-center justify-center disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(i.instanceName, i.label)}
                    disabled={isBusy}
                    title="Conectar (QR Code)"
                    className="w-8 h-8 rounded-lg text-emerald-700 border border-emerald-200 hover:bg-emerald-50 flex items-center justify-center disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                  </button>
                )}
                {!i.isDefault && (
                  <button
                    onClick={() => handleRemove(i.instanceName)}
                    disabled={isBusy}
                    title="Remover número"
                    className="w-8 h-8 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 flex items-center justify-center disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal QR */}
      {qrModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 text-center relative">
            <button
              onClick={() => setQrModal(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Conectar {qrModal.label}</h3>
            <p className="text-[11px] text-slate-500 mb-4">
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho.
            </p>
            {qrModal.qrCode ? (
              <img
                src={qrModal.qrCode}
                alt="QR Code"
                className="w-56 h-56 mx-auto rounded-lg border border-slate-200"
              />
            ) : (
              <div className="w-56 h-56 mx-auto rounded-lg border border-slate-200 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            )}
            {qrModal.pairingCode && (
              <p className="mt-3 text-xs text-slate-600">
                Código de pareamento: <span className="font-mono font-bold">{qrModal.pairingCode}</span>
              </p>
            )}
            <button
              onClick={() => handleConnect(qrModal.instanceName, qrModal.label)}
              className="mt-4 w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Gerar novo QR
            </button>
            <p className="mt-2 text-[10px] text-slate-400">
              A janela fecha sozinha quando o número conectar. O código se renova
              sozinho a cada 25s — se o WhatsApp recusar a leitura, espere a
              imagem trocar antes de apontar a câmera de novo.
            </p>
          </div>
        </div>
      )}

      {/* Modal Proxy: IP dedicado por instancia. Sem isso, todo chip sai pelo
          mesmo IP do servidor Evolution -- um numero quente herda a reputacao
          do IP compartilhado (foi o caso do Antonio, banido no 1o disparo). */}
      {proxyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 relative">
            <button
              onClick={() => setProxyModal(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-emerald-600" /> IP dedicado — {proxyModal.label}
            </h3>
            <p className="text-[11px] text-slate-500 mb-4">
              Informe o proxy (ISP/residencial) contratado para este número. Sem isso, ele sai pelo
              IP compartilhado do servidor — o mesmo de todos os outros chips.
            </p>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Host / IP"
                  value={proxyForm.host}
                  onChange={(e) => setProxyForm({ ...proxyForm, host: e.target.value })}
                  className="flex-[2] px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <input
                  type="text"
                  placeholder="Porta"
                  value={proxyForm.port}
                  onChange={(e) => setProxyForm({ ...proxyForm, port: e.target.value })}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
              </div>
              <select
                value={proxyForm.protocol}
                onChange={(e) => setProxyForm({ ...proxyForm, protocol: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Usuário (opcional)"
                  value={proxyForm.username}
                  onChange={(e) => setProxyForm({ ...proxyForm, username: e.target.value })}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <input
                  type="password"
                  placeholder="Senha (opcional)"
                  value={proxyForm.password}
                  onChange={(e) => setProxyForm({ ...proxyForm, password: e.target.value })}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
              </div>
            </div>
            {proxyMsg && <p className="mt-3 text-[11px] text-slate-600">{proxyMsg}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={async () => {
                  setProxySaving(true);
                  setProxyMsg(null);
                  const r = await removeProxy(proxyModal.instanceName);
                  setProxyMsg(r.message || null);
                  setProxySaving(false);
                  if (r.ok) setProxyModal(null);
                }}
                disabled={proxySaving}
                className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold disabled:opacity-60"
              >
                Remover proxy
              </button>
              <button
                onClick={async () => {
                  if (!proxyForm.host || !proxyForm.port) {
                    setProxyMsg('Informe host e porta.');
                    return;
                  }
                  setProxySaving(true);
                  setProxyMsg(null);
                  const r = await setProxy(proxyModal.instanceName, proxyForm);
                  setProxyMsg(r.message || null);
                  setProxySaving(false);
                  if (r.ok) setProxyModal(null);
                }}
                disabled={proxySaving}
                className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {proxySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
