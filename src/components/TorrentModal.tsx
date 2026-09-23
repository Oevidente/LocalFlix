import React, { useState, useEffect } from 'react';
import {
  X,
  Radio,
  Play,
  Trash2,
  Clock,
  HardDrive,
  Download,
  Users,
  Film,
  FileVideo,
  Loader2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { TorrentStatus, TorrentHistoryItem, TorrentFileItem } from '../types';
import { formatTime, formatBytes } from '../utils';

interface TorrentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayTorrent: (status: TorrentStatus, selectedFileIndex: number) => void;
}

export const TorrentModal: React.FC<TorrentModalProps> = ({
  isOpen,
  onClose,
  onPlayTorrent,
}) => {
  const [magnetInput, setMagnetInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<TorrentStatus | null>(null);
  const [history, setHistory] = useState<TorrentHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);

  // Fetch history when modal opens
  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/torrent/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Erro ao buscar histórico de torrents:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      setError(null);
    } else {
      setStatus(null);
      setMagnetInput('');
      setLoading(false);
    }
  }, [isOpen]);

  // Poll status when a torrent is actively connecting or loading metadata
  useEffect(() => {
    if (!status || (status.state !== 'connecting' && status.state !== 'metadata')) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/torrent/status/${status.infoHash}`);
        if (res.ok) {
          const updated: TorrentStatus = await res.json();
          setStatus(updated);
          if (updated.state === 'ready' || updated.state === 'downloading') {
            if (updated.files.length > 0) {
              const videoFiles = updated.files.filter((f) => f.isVideo);
              if (videoFiles.length > 0) {
                setSelectedFileIdx(updated.selectedFileIndex ?? videoFiles[0].index);
              }
            }
          }
        }
      } catch {}
    }, 1200);

    return () => clearInterval(interval);
  }, [status?.infoHash, status?.state]);

  const handleStartTorrent = async (magnetUri: string) => {
    if (!magnetUri.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/torrent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnetUri: magnetUri.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao iniciar torrent');
      }

      const initialStatus: TorrentStatus = await res.json();
      setStatus(initialStatus);

      if (initialStatus.files && initialStatus.files.length > 0) {
        const videoFiles = initialStatus.files.filter((f) => f.isVideo);
        if (videoFiles.length > 0) {
          setSelectedFileIdx(initialStatus.selectedFileIndex ?? videoFiles[0].index);
        }
      }

      await fetchHistory();
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar ao torrent.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = async (infoHash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/torrent/history/${infoHash}`, { method: 'DELETE' });
      await fetch(`/api/torrent/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ infoHash, deleteCache: true }),
      });
      setHistory((prev) => prev.filter((item) => item.infoHash !== infoHash));
      if (status && status.infoHash === infoHash) {
        setStatus(null);
      }
    } catch (err) {
      console.error('Erro ao deletar torrent do histórico:', err);
    }
  };

  const handleLaunchPlayer = () => {
    if (!status) return;
    onPlayTorrent(status, selectedFileIdx);
    onClose();
  };

  if (!isOpen) return null;

  const videoFiles = status?.files?.filter((f) => f.isVideo) || [];
  const otherFiles = status?.files?.filter((f) => !f.isVideo) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center shadow-lg shadow-red-950/40">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Player Torrent & Magnet</h2>
              <p className="text-xs text-zinc-400">Transmissão instantânea direta via streaming P2P</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Input Magnet Box */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Cole o link Magnet ou Hash
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={magnetInput}
                onChange={(e) => setMagnetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleStartTorrent(magnetInput);
                }}
                placeholder="magnet:?xt=urn:btih:..."
                className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700/80 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition"
              />
              <button
                onClick={() => handleStartTorrent(magnetInput)}
                disabled={loading || !magnetInput.trim()}
                className="px-5 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition shadow-md shadow-red-900/20"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                <span>Abrir</span>
              </button>
            </div>
            {error && (
              <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Active Torrent Loading / Ready Card */}
          {status && (
            <div className="p-4 bg-zinc-900/80 border border-zinc-700/60 rounded-xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${
                        status.state === 'ready' || status.state === 'downloading'
                          ? 'bg-emerald-500 animate-pulse'
                          : status.state === 'error'
                          ? 'bg-red-500'
                          : 'bg-amber-500 animate-ping'
                      }`}
                    />
                    <h3 className="text-sm font-semibold text-white line-clamp-1">{status.name}</h3>
                  </div>
                  <p className="text-xs text-zinc-400">
                    {status.state === 'connecting' && 'Buscando peers na rede BitTorrent...'}
                    {status.state === 'metadata' && 'Baixando metadados do torrent...'}
                    {(status.state === 'ready' || status.state === 'downloading') && 'Pronto para reproduzir!'}
                    {status.state === 'error' && (status.errorMessage || 'Erro ao carregar torrent')}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 text-zinc-300 bg-zinc-800 px-2 py-1 rounded-md">
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                    <span>{status.peers} peers</span>
                  </div>
                  {status.downloadSpeed > 0 && (
                    <div className="flex items-center gap-1 text-zinc-300 bg-zinc-800 px-2 py-1 rounded-md">
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{formatBytes(status.downloadSpeed)}/s</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-zinc-400">
                  <span>{formatBytes(status.downloadedBytes)} baixados</span>
                  <span>{formatBytes(status.totalBytes)}</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-red-600 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(status.progress, 1)}%` }}
                  />
                </div>
              </div>

              {/* Multi-file selection if series or multi-video */}
              {videoFiles.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <label className="block text-xs font-medium text-zinc-300">
                    {videoFiles.length > 1 ? `Selecione o episódio / vídeo (${videoFiles.length}):` : 'Arquivo de vídeo:'}
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {videoFiles.map((file) => {
                      const isSelected = selectedFileIdx === file.index;
                      return (
                        <button
                          key={file.index}
                          onClick={() => setSelectedFileIdx(file.index)}
                          className={`w-full text-left p-2.5 rounded-lg text-xs flex items-center justify-between transition ${
                            isSelected
                              ? 'bg-red-950/60 border border-red-800 text-white font-medium'
                              : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileVideo className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-red-400' : 'text-zinc-400'}`} />
                            <span className="truncate">{file.name}</span>
                          </div>
                          <span className="text-[10px] text-zinc-400 flex-shrink-0 ml-2">
                            {formatBytes(file.length)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="space-y-2">
                <button
                  onClick={handleLaunchPlayer}
                  disabled={status.state === 'error' || (videoFiles.length === 0 && status.state !== 'ready')}
                  className="w-full py-3 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-red-950/40 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Assistir no Player CineLocal</span>
                </button>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-400/90 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Salvo na sua Biblioteca (disponível no catálogo principal)</span>
                </div>
              </div>
            </div>
          )}

          {/* History List */}
          {history.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Torrents na Biblioteca
                </h3>
                <span className="text-[11px] text-zinc-500">Salvos no catálogo</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {history.map((item) => (
                  <div
                    key={item.infoHash}
                    onClick={() => handleStartTorrent(item.magnetUri)}
                    className="p-3 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl flex items-center justify-between gap-3 cursor-pointer group transition"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-red-400 transition flex-shrink-0">
                        <Radio className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-medium text-white truncate group-hover:text-red-300 transition">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                          <span className="text-emerald-400/80 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Na Biblioteca
                          </span>
                          {item.totalBytes ? <span>• {formatBytes(item.totalBytes)}</span> : null}
                          {item.progressSeconds && item.progressSeconds > 10 ? (
                            <span className="text-amber-400">
                              • Parou em: {formatTime(item.progressSeconds)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => handleDeleteHistory(item.infoHash, e)}
                        title="Remover do histórico e limpar cache"
                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <Play className="w-4 h-4 text-zinc-400 group-hover:text-white transition" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
