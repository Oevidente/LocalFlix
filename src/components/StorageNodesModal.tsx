import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  HardDrive,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  Laptop,
  Network,
  Zap,
} from 'lucide-react';
import { StorageNode } from '../types';

interface StorageNodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNodesUpdated?: () => void;
}

export const StorageNodesModal: React.FC<StorageNodesModalProps> = ({
  isOpen,
  onClose,
  onNodesUpdated,
}) => {
  const [nodes, setNodes] = useState<StorageNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'nodes' | 'guide'>('nodes');

  // Form state
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchNodes = async (checkLive = true) => {
    if (checkLive) setChecking(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/nodes${checkLive ? '?check=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes || []);
      }
    } catch (err) {
      console.error('Falha ao carregar nós:', err);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNodes(true);
      setShowAddForm(false);
      setTestResult(null);
      setSaveError(null);
    }
  }, [isOpen]);

  const handleTestConnection = async () => {
    if (!baseUrl.trim()) {
      setTestResult({ ok: false, error: 'Digite a URL do nó (ex: https://100.82.15.42:3050)' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    setSaveError(null);

    try {
      const res = await fetch('/api/nodes/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: baseUrl.trim(), authToken: authToken.trim() }),
      });
      const data = await res.json();

      if (data.ok) {
        setTestResult(data);
        if (data.suggestedUrl && data.suggestedUrl !== baseUrl.trim()) {
          setBaseUrl(data.suggestedUrl);
        }
      } else {
        // Fallback: se o backend estiver na nuvem (AI Studio preview) e não puder alcançar o IP privado Tailscale,
        // testa a conexão diretamente a partir do navegador do usuário, que está conectado ao Tailscale!
        let clientOk = false;
        try {
          let testCandidate = baseUrl.trim().replace(/\/+$/, '');
          if (!/^https?:\/\//i.test(testCandidate)) {
            testCandidate = `https://${testCandidate}`;
          }
          const clientStart = Date.now();
          const clientRes = await fetch(`${testCandidate}/api/nodes/ping`, {
            method: 'GET',
            mode: 'cors',
          });
          if (clientRes.ok) {
            clientOk = true;
            setTestResult({
              ok: true,
              latencyMs: Date.now() - clientStart,
            });
            setBaseUrl(testCandidate);
          }
        } catch {}

        if (!clientOk) {
          setTestResult(data);
        }
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || 'Erro ao conectar' });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim()) {
      setSaveError('Preencha o nome amigável e a URL do nó.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          authToken: authToken.trim() || undefined,
          isLocal: false,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao salvar nó.');
      }

      setName('');
      setBaseUrl('');
      setAuthToken('');
      setTestResult(null);
      setShowAddForm(false);
      await fetchNodes(true);
      onNodesUpdated?.();
    } catch (err: any) {
      setSaveError(err.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNode = async (id: string, nodeName: string) => {
    if (!window.confirm(`Deseja remover o nó "${nodeName}"? O acervo local desse PC não será apagado do disco.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/nodes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNodes((prev) => prev.filter((n) => n.id !== id));
        onNodesUpdated?.();
      }
    } catch (err) {
      console.error('Falha ao remover nó:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-[#E50914]/10 text-[#E50914] border border-[#E50914]/20">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">
                Nuvem Privada Multi-PC
              </h2>
              <p className="text-xs text-neutral-400">
                Interligue múltiplos computadores em estados diferentes via Tailscale
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center border-b border-neutral-800 px-5 bg-neutral-950/40">
          <button
            onClick={() => setActiveTab('nodes')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'nodes'
                ? 'border-[#E50914] text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Computadores & Armazenamentos</span>
            <span className="text-[11px] text-neutral-500 font-mono">({nodes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'guide'
                ? 'border-[#E50914] text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Guia Passo a Passo (Tailscale)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'nodes' ? (
            <>
              {/* Header actions */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">
                  Nós de armazenamento conectados à sua malha privada
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => fetchNodes(true)}
                    disabled={checking}
                    className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors disabled:opacity-50"
                    title="Verificar status e latência de todos os computadores"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                    <span>{checking ? 'Testando...' : 'Atualizar Ping'}</span>
                  </button>
                  {!showAddForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(true);
                        setTestResult(null);
                        setSaveError(null);
                      }}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#E50914] hover:bg-[#b80710] text-xs font-medium text-white transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar 2º PC</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Add Node Form */}
              {showAddForm && (
                <form
                  onSubmit={handleSaveNode}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3.5"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                    <span className="text-xs font-medium text-white flex items-center space-x-1.5">
                      <Laptop className="w-4 h-4 text-emerald-400" />
                      <span>Conectar Segundo Computador (ex: Piauí)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="text-neutral-400 hover:text-white text-xs"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1">
                        Nome do Computador
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: PC Piauí - Armazenamento"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-300 mb-1">
                        Endereço Tailscale (com porta)
                      </label>
                      <input
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://100.82.15.42:3050"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914]"
                        required
                      />
                      <p className="text-[10px] text-neutral-400 mt-1">
                        Dica: Pelo <strong className="text-neutral-300">start.bat</strong> padrão, o CineLocal roda em <strong className="text-emerald-400">HTTPS</strong> na porta <strong className="text-white">3050</strong> (ex: <span className="font-mono text-emerald-400">https://100.x.y.z:3050</span>).
                      </p>
                    </div>
                  </div>

                  {/* Test button & status */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testing || !baseUrl.trim()}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition-colors disabled:opacity-50"
                      >
                        <Zap className={`w-3 h-3 ${testing ? 'animate-pulse text-amber-400' : 'text-amber-400'}`} />
                        <span>{testing ? 'Testando Conexão...' : 'Testar Conexão'}</span>
                      </button>

                      {testResult && (
                        <div className="flex items-center space-x-1.5 text-xs">
                          {testResult.ok ? (
                            <span className="text-emerald-400 flex items-center space-x-1 font-mono">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Online ({testResult.latencyMs}ms)</span>
                            </span>
                          ) : (
                            <span className="text-red-400 flex items-center space-x-1">
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate max-w-[200px]" title={testResult.error}>
                                {testResult.error || 'Inacessível'}
                              </span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={saving || !name.trim() || !baseUrl.trim()}
                      className="px-4 py-1.5 rounded-lg bg-[#E50914] hover:bg-[#b80710] text-xs font-medium text-white transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Salvando...' : 'Salvar Nó'}
                    </button>
                  </div>

                  {saveError && (
                    <p className="text-xs text-red-400 bg-red-950/40 p-2 rounded border border-red-900/50">
                      {saveError}
                    </p>
                  )}
                </form>
              )}

              {/* Node List */}
              <div className="space-y-2.5">
                {loading ? (
                  <div className="text-center py-10 text-xs text-neutral-400">
                    Carregando computadores conectados...
                  </div>
                ) : nodes.length === 0 ? (
                  <div className="text-center py-10 text-xs text-neutral-500">
                    Nenhum computador cadastrado.
                  </div>
                ) : (
                  nodes.map((node) => {
                    const isOnline = node.status === 'online';
                    return (
                      <div
                        key={node.id}
                        className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl transition-colors hover:border-neutral-700"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              node.isLocal
                                ? 'bg-blue-950/50 text-blue-400 border border-blue-800/30'
                                : 'bg-purple-950/50 text-purple-400 border border-purple-800/30'
                            }`}
                          >
                            {node.isLocal ? (
                              <HardDrive className="w-4 h-4" />
                            ) : (
                              <Laptop className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-semibold text-white truncate">
                                {node.name}
                              </span>
                              {node.isLocal && (
                                <span className="text-[10px] text-blue-400 font-mono">
                                  (Local · Pernambuco)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 text-[11px] text-neutral-400 truncate font-mono mt-0.5">
                              <span>{node.baseUrl || 'localhost'}</span>
                              <span aria-hidden="true">·</span>
                              <span className="flex items-center space-x-1">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isOnline ? 'bg-emerald-400' : 'bg-red-400'
                                  }`}
                                />
                                <span className={isOnline ? 'text-emerald-400' : 'text-red-400'}>
                                  {isOnline ? 'Ativo' : 'Inacessível'}
                                </span>
                                {node.latencyMs !== undefined && isOnline && (
                                  <span className="text-neutral-500 tabular-nums">
                                    ({node.latencyMs}ms)
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {!node.isLocal && (
                          <button
                            type="button"
                            onClick={() => handleDeleteNode(node.id, node.name)}
                            className="p-1.5 text-neutral-500 hover:text-red-400 rounded-lg hover:bg-neutral-800 transition-colors ml-2 shrink-0"
                            title="Desconectar este PC"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* Guide Tab */
            <div className="space-y-4 text-xs text-neutral-300">
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                <h3 className="font-semibold text-white flex items-center space-x-2">
                  <Network className="w-4 h-4 text-[#E50914]" />
                  <span>Como funciona a conexão Pernambuco ⇄ Piauí?</span>
                </h3>
                <p className="text-neutral-400 leading-relaxed">
                  Operadoras de internet comuns bloqueiam portas e usam CGNAT, o que impede
                  conectar dois computadores diretamente pelo IP normal da internet sem pagar caro. O{' '}
                  <strong className="text-white">Tailscale</strong> cria uma rede virtual privada
                  ponto-a-ponto (P2P baseada em WireGuard), segura e 100% gratuita, fazendo ambos os
                  PCs funcionarem como se estivessem no mesmo cômodo.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-white">Passo a passo rápido (3 minutos):</h4>

                <div className="flex space-x-3 p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#E50914] text-white text-[10px] font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold text-white">Instale o Tailscale nos dois PCs</p>
                    <p className="text-neutral-400">
                      Acesse <a href="https://tailscale.com" target="_blank" rel="noreferrer" className="text-[#E50914] underline inline-flex items-center gap-0.5">tailscale.com <ExternalLink className="w-2.5 h-2.5" /></a>, baixe o instalador gratuito no PC de Pernambuco e no PC do Piauí, e faça login com a <strong>mesma conta</strong> (Google, Microsoft ou GitHub).
                    </p>
                  </div>
                </div>

                <div className="flex space-x-3 p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#E50914] text-white text-[10px] font-bold shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold text-white">Copie o IP Tailscale do 2º PC (Piauí)</p>
                    <p className="text-neutral-400">
                      No ícone do Tailscale junto ao relógio do Windows no 2º PC, clique com o botão direito e copie o IP atribuído (ele sempre começa com <code className="text-amber-400 bg-neutral-900 px-1 rounded font-mono">100.x.y.z</code>).
                    </p>
                  </div>
                </div>

                <div className="flex space-x-3 p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#E50914] text-white text-[10px] font-bold shrink-0 mt-0.5">
                    3
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold text-white">Inicie o CineLocal no 2º PC e Cadastre Aqui</p>
                    <p className="text-neutral-400">
                      Abra o CineLocal no 2º PC usando o <strong className="text-white">start.bat</strong> (porta padrão :3050 com HTTPS). Em seguida, volte aqui na aba <strong className="text-white">Computadores</strong>, clique em <strong className="text-white">Adicionar 2º PC</strong> e informe o endereço: <code className="text-emerald-400 bg-neutral-900 px-1 rounded font-mono">https://100.82.15.42:3050</code>.
                    </p>
                  </div>
                </div>

                <div className="flex space-x-3 p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#E50914] text-white text-[10px] font-bold shrink-0 mt-0.5">
                    4
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold text-white">Cadastre as Pastas Remotas Normal</p>
                    <p className="text-neutral-400">
                      Ao clicar em <strong className="text-white">Adicionar Mídia</strong>, basta trocar o seletor de origem para o <strong className="text-white">PC Piauí</strong>. Você poderá navegar pelas pastas do disco rígido dele e adicionar os filmes e séries normalmente!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between text-xs text-neutral-400">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span>Streaming P2P direto ativado (sem sobrecarregar o upload do PC 1)</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors font-medium"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
