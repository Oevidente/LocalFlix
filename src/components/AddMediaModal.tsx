import React, { useState } from 'react';
import { X, FolderPlus, FolderSearch, AlertCircle, Loader2 } from 'lucide-react';
import { FolderBrowser } from './FolderBrowser';

interface AddMediaModalProps {
  onClose: () => void;
  onAddFolder: (folderPath: string, title?: string) => Promise<void>;
}

export const AddMediaModal: React.FC<AddMediaModalProps> = ({
  onClose,
  onAddFolder,
}) => {
  const [folderPath, setFolderPath] = useState('');
  const [title, setTitle] = useState('');
  const [showBrowser, setShowBrowser] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) {
      setError('Informe o caminho da pasta onde estão os vídeos.');
      return;
    }

    setError(null);
    setIsScanning(true);
    try {
      await onAddFolder(folderPath.trim(), title.trim() || undefined);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao escanear pasta');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div
      id="add-media-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="add-media-modal"
        className="relative w-full max-w-xl bg-[#181818] rounded-xl overflow-hidden shadow-2xl border border-white/10 p-6 text-neutral-200"
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
          <div className="w-10 h-10 rounded-lg bg-[#E50914]/20 border border-[#E50914]/40 flex items-center justify-center text-[#E50914]">
            <FolderPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Adicionar Série ou Filme</h2>
            <p className="text-xs text-neutral-400">
              Escaneia vídeos (MP4, MKV, AVI, WebM) e extrai temporadas e episódios
            </p>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-800/60 flex items-start space-x-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-neutral-300">Caminho da Pasta no PC</label>
              <button
                type="button"
                onClick={() => setShowBrowser(!showBrowser)}
                className="text-xs text-red-400 hover:text-red-300 flex items-center space-x-1"
              >
                <FolderSearch className="w-3.5 h-3.5" />
                <span>{showBrowser ? 'Ocultar Navegador' : 'Explorar Pastas'}</span>
              </button>
            </div>

            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="Ex: C:\Series\Stranger Things ou ./demo_media"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono text-xs"
              required
            />
          </div>

          {/* Folder Browser */}
          {showBrowser && (
            <div className="animate-in fade-in duration-150">
              <div className="text-[11px] text-neutral-400 mb-1">Navegue pelas pastas do PC:</div>
              <FolderBrowser
                onSelectPath={(path) => setFolderPath(path)}
                currentSelected={folderPath}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Título Personalizado <span className="text-neutral-500 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deixe em branco para usar o nome da pasta"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 text-xs"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs sm:text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isScanning}
              className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-[#E50914] hover:bg-red-700 text-white text-xs sm:text-sm font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Escaneando...</span>
                </>
              ) : (
                <span>Escanear Pasta</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
