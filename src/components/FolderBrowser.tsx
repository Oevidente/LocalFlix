import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  Video,
  ArrowUp,
  Server,
  Laptop,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { BrowseItem, StorageNode } from '../types';

interface FolderBrowserProps {
  onSelectPath: (path: string, nodeId?: string) => void;
  currentSelected?: string;
  onOpenNodesModal?: () => void;
}

export const FolderBrowser: React.FC<FolderBrowserProps> = ({
  onSelectPath,
  currentSelected,
  onOpenNodesModal,
}) => {
  const [nodes, setNodes] = useState<StorageNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('local');
  const [currentDir, setCurrentDir] = useState<string>('');
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load storage nodes
  useEffect(() => {
    const loadNodes = async () => {
      try {
        const res = await fetch('/api/nodes');
        if (res.ok) {
          const data = await res.json();
          setNodes(data.nodes || []);
        }
      } catch (err) {
        console.warn('Falha ao carregar nós:', err);
      }
    };
    loadNodes();
  }, []);

  const fetchDir = async (dir?: string, nodeId: string = selectedNodeId) => {
    setLoading(true);
    setError(null);
    try {
      const url =
        nodeId === 'local'
          ? dir
            ? `/api/browse?dir=${encodeURIComponent(dir)}`
            : '/api/browse'
          : dir
          ? `/api/nodes/${nodeId}/browse?dir=${encodeURIComponent(dir)}`
          : `/api/nodes/${nodeId}/browse`;

      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Não foi possível abrir o diretório');
      }
      const data = await res.json();
      setCurrentDir(data.currentDir);
      setParentDir(data.parentDir);
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar diretório');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDir(undefined, selectedNodeId);
  }, [selectedNodeId]);

  const handleNodeChange = (newNodeId: string) => {
    setSelectedNodeId(newNodeId);
    setCurrentDir('');
    setParentDir(null);
    setItems([]);
  };

  const activeNode = nodes.find((n) => n.id === selectedNodeId) || {
    id: 'local',
    name: 'Este Computador (Local)',
    isLocal: true,
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-sm space-y-2.5">
      {/* Node selector bar */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800 gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1 rounded bg-neutral-800 text-neutral-300 shrink-0">
            {activeNode.isLocal ? (
              <HardDrive className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Laptop className="w-3.5 h-3.5 text-purple-400" />
            )}
          </div>
          <div className="flex items-center space-x-1.5 min-w-0">
            <span className="text-xs text-neutral-400 shrink-0 hidden sm:inline">Origem:</span>
            <select
              value={selectedNodeId}
              onChange={(e) => handleNodeChange(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 text-xs text-white rounded px-2 py-1 focus:outline-none focus:border-[#E50914] truncate max-w-[200px]"
            >
              <option value="local">Este Computador (Local · PE)</option>
              {nodes
                .filter((n) => !n.isLocal && n.id !== 'local')
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            type="button"
            onClick={() => fetchDir(currentDir, selectedNodeId)}
            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors"
            title="Recarregar pastas"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onOpenNodesModal && (
            <button
              type="button"
              onClick={onOpenNodesModal}
              className="text-[11px] text-[#E50914] hover:text-[#ff3b47] hover:underline whitespace-nowrap"
            >
              + Conectar 2º PC
            </button>
          )}
        </div>
      </div>

      {/* Current Dir Header with Up navigation */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
        <div
          className="flex items-center space-x-2 font-mono text-xs text-neutral-300 truncate"
          title={currentDir}
        >
          <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="truncate">{currentDir || 'Carregando diretório...'}</span>
        </div>

        {parentDir && (
          <button
            type="button"
            onClick={() => fetchDir(parentDir, selectedNodeId)}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors shrink-0 ml-2"
            title="Subir um nível"
          >
            <ArrowUp className="w-3 h-3" />
            <span>Subir</span>
          </button>
        )}
      </div>

      {/* Directory list */}
      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
        {loading ? (
          <div className="text-center py-6 text-xs text-neutral-400">
            {selectedNodeId === 'local'
              ? 'Carregando pastas...'
              : `Consultando pastas remotas no ${activeNode.name}...`}
          </div>
        ) : error ? (
          <div className="text-center py-4 text-xs text-red-400 space-y-1">
            <p>{error}</p>
            {selectedNodeId !== 'local' && (
              <p className="text-[11px] text-neutral-500">
                Verifique se o CineLocal e o Tailscale estão ativos no segundo computador.
              </p>
            )}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-6 text-xs text-neutral-500">Nenhuma subpasta encontrada</div>
        ) : (
          items.map((item) => {
            if (item.name === '..') return null;
            const isSelected = currentSelected === item.path;

            return (
              <div
                key={item.path}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#E50914]/20 border border-[#E50914]/40 text-white font-medium'
                    : 'hover:bg-neutral-800 text-neutral-300'
                }`}
                onClick={() => onSelectPath(item.path, selectedNodeId)}
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate text-xs">{item.name}</span>
                  {item.hasMediaFiles && (
                    <span className="flex items-center space-x-0.5 text-[10px] text-emerald-400 bg-emerald-950/60 px-1 rounded border border-emerald-800/40">
                      <Video className="w-2.5 h-2.5" />
                      <span>Vídeos</span>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchDir(item.path, selectedNodeId);
                  }}
                  className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
                  title="Abrir pasta"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
