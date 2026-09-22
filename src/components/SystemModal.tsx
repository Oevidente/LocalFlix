import React, { useState, useEffect } from 'react';
import { X, HardDrive, CheckCircle, AlertTriangle, Terminal, FileJson, Download, Loader2 } from 'lucide-react';
import { SystemStatus } from '../types';

interface SystemModalProps {
  onClose: () => void;
}

export const SystemModal: React.FC<SystemModalProps> = ({
  onClose,
}) => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installingFfmpeg, setInstallingFfmpeg] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  const fetchStatus = () => {
    fetch('/api/system/status')
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch((err) => console.error('Error fetching system status:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleInstallFfmpeg = async () => {
    setInstallingFfmpeg(true);
    setInstallMessage(null);
    try {
      const res = await fetch('/api/system/install-ffmpeg', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setInstallMessage('FFmpeg instalado com sucesso na pasta bin!');
        fetchStatus();
      } else {
        setInstallMessage(data.message || 'Falha ao instalar automaticamente.');
      }
    } catch {
      setInstallMessage('Erro ao comunicar com o servidor.');
    } finally {
      setInstallingFfmpeg(false);
    }
  };

  return (
    <div
      id="system-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="system-modal"
        className="relative w-full max-w-lg bg-[#181818] rounded-xl overflow-hidden shadow-2xl border border-white/10 p-6 text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Status do CineLocal</h2>
            <p className="text-xs text-neutral-400">Ambiente 100% offline, local e portátil</p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-neutral-400">Consultando sistema...</div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Storage info */}
            <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between text-neutral-200 font-semibold border-b border-neutral-800 pb-1.5">
                <span className="flex items-center space-x-1.5">
                  <FileJson className="w-4 h-4 text-amber-400" />
                  <span>Armazenamento de Dados</span>
                </span>
                <span className="text-emerald-400 text-[11px]">100% Offline (Sem Nuvem)</span>
              </div>
              <div className="space-y-1 text-neutral-400">
                <div>
                  <span className="text-neutral-500">Arquivo do Banco: </span>
                  <span className="font-mono text-neutral-300 text-[11px]">data/library.json</span>
                </div>
                <div>
                  <span className="text-neutral-500">Títulos cadastrados: </span>
                  <span className="text-white font-semibold">{status?.totalItems || 0}</span>
                </div>
              </div>
            </div>

            {/* FFmpeg / FFprobe info */}
            <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between text-neutral-200 font-semibold border-b border-neutral-800 pb-1.5">
                <span className="flex items-center space-x-1.5">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  <span>Motor de Mídia (FFmpeg & FFprobe)</span>
                </span>
              </div>

              <div className="space-y-1.5 text-neutral-400">
                <div className="flex items-center justify-between">
                  <span>FFmpeg:</span>
                  {status?.ffmpegFound ? (
                    <span className="flex items-center space-x-1 text-emerald-400 font-mono text-[11px] truncate max-w-[280px]">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{status.ffmpegPath}</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Não encontrado</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span>FFprobe:</span>
                  {status?.ffprobeFound ? (
                    <span className="flex items-center space-x-1 text-emerald-400 font-mono text-[11px] truncate max-w-[280px]">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{status.ffprobePath}</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Não encontrado</span>
                    </span>
                  )}
                </div>

                {!status?.ffmpegFound && (
                  <div className="mt-2 pt-2 border-t border-neutral-800 space-y-2">
                    <p className="text-[11px] text-neutral-400">
                      O FFmpeg é necessário para reproduzir arquivos <strong>.MKV</strong> e áudios com múltiplos canais.
                    </p>
                    <button
                      type="button"
                      onClick={handleInstallFfmpeg}
                      disabled={installingFfmpeg}
                      className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-700 text-white rounded-md font-medium text-xs transition-colors shadow"
                    >
                      {installingFfmpeg ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Baixando e instalando FFmpeg em bin/...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Instalar FFmpeg Automaticamente (1 Clique)</span>
                        </>
                      )}
                    </button>
                    {installMessage && (
                      <p className={`text-[11px] font-medium ${installMessage.includes('sucesso') ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {installMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Portable Pendrive guide */}
            <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-400 space-y-1.5">
              <div className="font-semibold text-white">Como rodar no Windows:</div>
              <p className="text-[11px] leading-relaxed">
                1. Dê um duplo clique no arquivo <strong className="text-white">start.bat</strong> na pasta do CineLocal.
                <br />
                2. O app iniciará e abrirá automaticamente seu navegador em <strong className="text-white">http://localhost:3050</strong>.
                <br />
                3. Para instalar manualmente o FFmpeg, basta extrair o <strong>ffmpeg.exe</strong> e <strong>ffprobe.exe</strong> para dentro da pasta <strong>bin/</strong>.
              </p>
            </div>

            {/* Close button */}
            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-[#E50914] hover:bg-red-700 text-white font-bold transition-colors shadow-lg active:scale-95"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
