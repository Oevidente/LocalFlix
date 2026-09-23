import React, { useState } from 'react';
import {
  X,
  Play,
  RotateCw,
  FolderSync,
  Trash2,
  CheckCircle2,
  Circle,
  Folder,
  Layers,
  Subtitles,
  Volume2,
  Image as ImageIcon,
  Check,
  Loader2,
  Upload,
  Search,
  Download,
  Star,
  Radio,
} from 'lucide-react';
import { MediaItem, Episode, OnlineSubtitleOption, Season } from '../types';
import { formatTime, formatBytes } from '../utils';

interface MediaDetailModalProps {
  media: MediaItem;
  onClose: () => void;
  onPlayEpisode: (media: MediaItem, episode: Episode) => void;
  onToggleWatched: (mediaId: string, episodeId: string, watched?: boolean) => void;
  onRescan: (mediaId: string) => Promise<void>;
  onOpenRelocate: (media: MediaItem) => void;
  onDeleteMedia: (mediaId: string) => void;
  onUpdateBanner?: (mediaId: string, bannerUrl: string) => Promise<boolean>;
  onImportSubtitle: (mediaId: string, episodeId: string, file: File) => Promise<void>;
  onRemoveImportedSubtitle: (mediaId: string, episodeId: string, trackIndex: number) => Promise<void>;
  onSearchOnlineSubtitles: (mediaId: string, episodeId: string) => Promise<OnlineSubtitleOption[]>;
  onDownloadOnlineSubtitle: (mediaId: string, episodeId: string, option: OnlineSubtitleOption) => Promise<void>;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  media,
  onClose,
  onPlayEpisode,
  onToggleWatched,
  onRescan,
  onOpenRelocate,
  onDeleteMedia,
  onUpdateBanner,
  onImportSubtitle,
  onRemoveImportedSubtitle,
  onSearchOnlineSubtitles,
  onDownloadOnlineSubtitle,
}) => {
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(
    media.seasons[0]?.seasonNumber || 1
  );
  const [isRescanning, setIsRescanning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showBannerInput, setShowBannerInput] = useState(false);
  const [bannerUrlInput, setBannerUrlInput] = useState(media.backdropPath || '');
  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [importingSubtitleEpisodeId, setImportingSubtitleEpisodeId] = useState<string | null>(null);
  const [removingSubtitleKey, setRemovingSubtitleKey] = useState<string | null>(null);
  const [subtitleMessage, setSubtitleMessage] = useState<{ episodeId: string; text: string; error?: boolean } | null>(null);
  const [onlineSubtitleOptions, setOnlineSubtitleOptions] = useState<Record<string, OnlineSubtitleOption[]>>({});
  const [searchingOnlineEpisodeId, setSearchingOnlineEpisodeId] = useState<string | null>(null);
  const [downloadingOnlineFileId, setDownloadingOnlineFileId] = useState<number | null>(null);

  const selectedSeason: Season | undefined =
    media.seasons.find((s) => s.seasonNumber === selectedSeasonNumber) || media.seasons[0];

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      await onRescan(media.id);
    } finally {
      setIsRescanning(false);
    }
  };

  const handleSubtitleFileChange = async (episodeId: string, file?: File) => {
    if (!file) return;
    setImportingSubtitleEpisodeId(episodeId);
    setSubtitleMessage(null);
    try {
      await onImportSubtitle(media.id, episodeId, file);
      setSubtitleMessage({ episodeId, text: 'Legenda importada.' });
    } catch (error) {
      setSubtitleMessage({
        episodeId,
        text: error instanceof Error ? error.message : 'Não foi possível importar a legenda.',
        error: true,
      });
    } finally {
      setImportingSubtitleEpisodeId(null);
    }
  };

  const handleRemoveImportedSubtitle = async (episodeId: string, trackIndex: number) => {
    const key = `${episodeId}-${trackIndex}`;
    setRemovingSubtitleKey(key);
    setSubtitleMessage(null);
    try {
      await onRemoveImportedSubtitle(media.id, episodeId, trackIndex);
      setSubtitleMessage({ episodeId, text: 'Legenda removida.' });
    } catch (error) {
      setSubtitleMessage({
        episodeId,
        text: error instanceof Error ? error.message : 'Não foi possível remover a legenda.',
        error: true,
      });
    } finally {
      setRemovingSubtitleKey(null);
    }
  };

  const handleSearchOnline = async (episodeId: string) => {
    setSearchingOnlineEpisodeId(episodeId);
    setSubtitleMessage(null);
    try {
      const options = await onSearchOnlineSubtitles(media.id, episodeId);
      setOnlineSubtitleOptions((current) => ({ ...current, [episodeId]: options }));
      if (options.length === 0) {
        setSubtitleMessage({ episodeId, text: 'Nenhuma legenda encontrada para este episódio.', error: true });
      }
    } catch (error) {
      setSubtitleMessage({
        episodeId,
        text: error instanceof Error ? error.message : 'Não foi possível buscar legendas online.',
        error: true,
      });
    } finally {
      setSearchingOnlineEpisodeId(null);
    }
  };

  const handleDownloadOnline = async (episodeId: string, option: OnlineSubtitleOption) => {
    setDownloadingOnlineFileId(option.fileId);
    setSubtitleMessage(null);
    try {
      await onDownloadOnlineSubtitle(media.id, episodeId, option);
      setSubtitleMessage({ episodeId, text: 'Legenda online baixada e adicionada.' });
      setOnlineSubtitleOptions((current) => ({ ...current, [episodeId]: [] }));
    } catch (error) {
      setSubtitleMessage({
        episodeId,
        text: error instanceof Error ? error.message : 'Não foi possível baixar a legenda online.',
        error: true,
      });
    } finally {
      setDownloadingOnlineFileId(null);
    }
  };

  const handleSaveBanner = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!onUpdateBanner) return;

    setIsSavingBanner(true);
    setBannerMessage(null);
    try {
      const ok = await onUpdateBanner(media.id, bannerUrlInput.trim());
      if (ok) {
        setBannerMessage('Banner salvo com sucesso!');
        setTimeout(() => {
          setBannerMessage(null);
          setShowBannerInput(false);
        }, 1200);
      } else {
        setBannerMessage('Não foi possível salvar o banner.');
      }
    } catch {
      setBannerMessage('Erro ao atualizar banner.');
    } finally {
      setIsSavingBanner(false);
    }
  };

  const handleRemoveBanner = async () => {
    if (!onUpdateBanner) return;
    setIsSavingBanner(true);
    setBannerMessage(null);
    try {
      const ok = await onUpdateBanner(media.id, '');
      if (ok) {
        setBannerUrlInput('');
        setBannerMessage('Banner removido!');
        setTimeout(() => {
          setBannerMessage(null);
          setShowBannerInput(false);
        }, 1200);
      }
    } finally {
      setIsSavingBanner(false);
    }
  };

  const bannerUrl = media.backdropPath
    ? (media.backdropPath.startsWith('http') ? media.backdropPath : `/api/media/${media.id}/backdrop`)
    : (media.posterPath?.startsWith('http') ? media.posterPath : `/api/media/${media.id}/poster`);

  return (
    <div
      id="media-detail-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="media-detail-modal"
        className="relative w-full max-w-4xl bg-[#181818] rounded-xl overflow-hidden shadow-2xl border border-white/10 my-auto text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-black/70 hover:bg-neutral-800 text-white flex items-center justify-center transition-colors border border-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Banner Edit Header Button */}
        {onUpdateBanner && (
          <button
            id="detail-edit-banner-header-btn"
            onClick={() => setShowBannerInput(!showBannerInput)}
            className="absolute top-4 left-4 z-30 flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-xs font-semibold text-white/90 hover:text-white transition-all border border-white/10 backdrop-blur-sm cursor-pointer shadow-lg active:scale-95"
            title="Adicionar ou alterar imagem do banner através de URL"
          >
            <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
            <span>{media.backdropPath ? 'Alterar Banner (URL)' : 'Adicionar Banner (URL)'}</span>
          </button>
        )}

        {/* Modal Header Banner */}
        <div className="relative h-64 sm:h-80 w-full overflow-hidden bg-black">
          <img
            src={bannerUrl}
            alt={media.title}
            className="w-full h-full object-cover opacity-50 filter blur-xs scale-105"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-[#181818]/60 to-transparent" />

          {/* Title & Quick Info */}
          <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-semibold mb-2">
                <span className="bg-[#E50914] text-white px-2 py-0.5 rounded font-black text-[11px] tracking-tight">
                  {media.kind === 'series' ? 'SÉRIE' : 'FILME'}
                </span>
                {media.isTorrent && (
                  <span className="bg-red-950/90 text-red-300 border border-red-800/60 text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                    <Radio className="w-3 h-3 text-red-400" />
                    MAGNET / TORRENT
                  </span>
                )}
                <span className="text-neutral-400">·</span>
                <span>{media.totalEpisodes} Episódio{media.totalEpisodes > 1 ? 's' : ''}</span>
                {media.totalSeasons > 1 && (
                  <>
                    <span className="text-neutral-400">·</span>
                    <span>{media.totalSeasons} Temporadas</span>
                  </>
                )}
              </div>
              <h1 className="text-2xl sm:text-4xl font-black text-white drop-shadow-md">
                {media.title}
              </h1>
              {(media.year || media.rating !== undefined || media.genres?.length) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-300">
                  {media.year && <span>{media.year}</span>}
                  {media.rating !== undefined && (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {media.rating.toFixed(1)}
                    </span>
                  )}
                  {media.genres?.slice(0, 4).map((genre) => (
                    <span key={genre} className="rounded bg-white/10 px-1.5 py-0.5">{genre}</span>
                  ))}
                </div>
              )}
              {media.overview && (
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-neutral-300 line-clamp-3">
                  {media.overview}
                </p>
              )}
            </div>

            {/* Main Play Button */}
            {selectedSeason?.episodes[0] && (
              <button
                onClick={() => onPlayEpisode(media, selectedSeason.episodes[0])}
                className="shrink-0 flex items-center space-x-2 px-6 py-2.5 rounded bg-white text-black font-bold hover:bg-neutral-200 transition-all shadow-lg active:scale-95"
              >
                <Play className="w-5 h-5 fill-black" />
                <span>Reproduzir</span>
              </button>
            )}
          </div>
        </div>

        {/* Action & Path Bar */}
        <div className="px-6 py-3 bg-black/40 border-y border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Path info */}
          <div className="flex items-center space-x-2 text-neutral-400 max-w-md truncate">
            {media.isTorrent ? (
              <>
                <Radio className="w-4 h-4 shrink-0 text-red-500" />
                <span className="font-mono truncate text-neutral-300" title={media.magnetUri || media.folderPath}>
                  {media.infoHash ? `Hash: ${media.infoHash}` : media.folderPath}
                </span>
              </>
            ) : (
              <>
                <Folder className="w-4 h-4 shrink-0 text-amber-500" />
                <span className="font-mono truncate" title={media.folderPath}>
                  {media.folderPath}
                </span>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {onUpdateBanner && (
              <button
                id="detail-edit-banner-action-btn"
                onClick={() => setShowBannerInput(!showBannerInput)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded font-medium transition-colors border ${
                  showBannerInput
                    ? 'bg-pink-950/70 border-pink-700/70 text-pink-300'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-white/5'
                }`}
                title="Adicionar ou alterar imagem do banner através de URL"
              >
                <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                <span>Banner (URL)</span>
              </button>
            )}

            {!media.isTorrent && (
              <button
                onClick={() => onOpenRelocate(media)}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition-colors border border-white/5"
                title="Mudar pasta (caso a letra do drive do pendrive mude)"
              >
                <FolderSync className="w-3.5 h-3.5 text-blue-400" />
                <span>Relocalizar</span>
              </button>
            )}

            {!media.isTorrent && (
              <button
                onClick={handleRescan}
                disabled={isRescanning}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition-colors border border-white/5 disabled:opacity-50"
                title="Escanear pasta novamente para novos episódios"
              >
                <RotateCw className={`w-3.5 h-3.5 text-emerald-400 ${isRescanning ? 'animate-spin' : ''}`} />
                <span>{isRescanning ? 'Escaneando...' : 'Re-escanear'}</span>
              </button>
            )}

            {confirmDelete ? (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => onDeleteMedia(media.id)}
                  className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-white font-bold text-xs"
                >
                  Confirmar Remoção
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white text-xs"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded bg-neutral-800 hover:bg-red-950/40 text-neutral-400 hover:text-red-400 transition-colors border border-white/5"
                title="Remover da biblioteca (não apaga os arquivos do PC)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {media.cast && media.cast.length > 0 && (
          <div className="border-b border-white/5 bg-black/20 px-6 py-3 text-xs text-neutral-400">
            <span className="font-semibold text-neutral-300">Elenco: </span>
            {media.cast.slice(0, 8).map((member, index) => (
              <React.Fragment key={member.id}>
                {index > 0 && ', '}
                <span className="text-neutral-400">{member.name}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Banner URL Editor Panel */}
        {showBannerInput && (
          <div className="p-4 bg-neutral-900 border-b border-neutral-800 animate-in fade-in duration-200">
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-bold text-white">
                  <ImageIcon className="w-4 h-4 text-pink-400" />
                  <span>Personalizar Imagem do Banner (Backdrop por URL)</span>
                </div>
                {bannerMessage && (
                  <span className="text-xs font-semibold text-emerald-400 flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>{bannerMessage}</span>
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveBanner} className="space-y-3">
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1">
                    Insira a URL direta da imagem (ex: https://image.tmdb.org/... ou link de imagem web):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="banner-url-input"
                      type="url"
                      value={bannerUrlInput}
                      onChange={(e) => setBannerUrlInput(e.target.value)}
                      placeholder="https://exemplo.com/imagem-banner.jpg"
                      className="flex-1 bg-black/60 border border-neutral-700 focus:border-pink-500 rounded-lg px-3 py-1.5 text-xs text-white placeholder-neutral-500 font-mono outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isSavingBanner || !bannerUrlInput.trim()}
                      className="px-4 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow active:scale-95 flex items-center space-x-1"
                    >
                      {isSavingBanner ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <span>Salvar Banner</span>
                      )}
                    </button>
                    {media.backdropPath && (
                      <button
                        type="button"
                        onClick={handleRemoveBanner}
                        disabled={isSavingBanner}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
                      >
                        Remover
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowBannerInput(false)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs font-medium transition-colors"
                    >
                      Fechar
                    </button>
                  </div>
                </div>

                {/* Banner Live Preview */}
                {bannerUrlInput.trim() && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-neutral-500">Prévia da Imagem do Banner:</div>
                    <div className="relative w-full h-32 rounded-lg overflow-hidden bg-black border border-white/10">
                      <img
                        src={bannerUrlInput.trim()}
                        alt="Prévia do Banner"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Season Selector & Episode List */}
        <div className="p-6">
          {media.seasons.length > 1 && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-neutral-400" />
                <span className="text-sm font-semibold text-neutral-300">Temporada:</span>
              </div>
              <select
                value={selectedSeasonNumber}
                onChange={(e) => setSelectedSeasonNumber(Number(e.target.value))}
                className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-red-500"
              >
                {media.seasons.map((season) => (
                  <option key={season.seasonNumber} value={season.seasonNumber}>
                    {season.title} ({season.episodes.length} episódios)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Episode List */}
          <div className="space-y-3">
            {selectedSeason?.episodes.map((ep) => {
              const hasProgress = ep.durationSeconds > 0 && ep.progressSeconds > 0 && !ep.watched;
              const progressPercent = hasProgress
                ? Math.min(100, Math.floor((ep.progressSeconds / ep.durationSeconds) * 100))
                : 0;
              const importedSubtitles = ep.subtitleTracks.filter((track) => track.isImported);

              return (
                <div
                  key={ep.id}
                  id={`episode-row-${ep.id}`}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-neutral-900/60 hover:bg-neutral-800/80 transition-colors border border-white/5 gap-3"
                >
                  {/* Left: Episode info & Thumb */}
                  <div
                    className="flex items-center space-x-3 sm:space-x-4 cursor-pointer flex-1"
                    onClick={() => onPlayEpisode(media, ep)}
                  >
                    {/* Episode Thumbnail Container */}
                    <div className="relative w-28 sm:w-36 aspect-video bg-black rounded overflow-hidden shrink-0 border border-neutral-800">
                      <img
                        src={`/api/media/${media.id}/episode/${ep.id}/thumb`}
                        alt={ep.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      {/* Play Icon on hover */}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-8 h-8 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg">
                          <Play className="w-4 h-4 fill-black ml-0.5" />
                        </div>
                      </div>

                      {/* Red Progress Bar */}
                      {hasProgress && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800">
                          <div className="h-full bg-[#E50914]" style={{ width: `${progressPercent}%` }} />
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-red-500">
                          E{ep.episodeNumber.toString().padStart(2, '0')}
                        </span>
                        <h4 className="text-sm font-semibold text-white truncate group-hover:text-red-400 transition-colors">
                          {ep.title}
                        </h4>
                      </div>

                      <div className="text-xs text-neutral-400 mt-1 flex flex-wrap items-center gap-2">
                        {ep.durationSeconds > 0 && <span>{formatTime(ep.durationSeconds)}</span>}
                        {ep.resolution && <span>· {ep.resolution}</span>}
                        {ep.extension && <span className="uppercase text-[10px] bg-neutral-800 px-1 rounded">{ep.extension.replace('.', '')}</span>}
                        <span>· {formatBytes(ep.sizeBytes)}</span>
                      </div>

                      {/* Audio & Subtitle stream tags */}
                      <div className="flex items-center space-x-3 text-[11px] text-neutral-400 mt-1">
                        {ep.audioTracks.length > 0 && (
                          <span className="flex items-center space-x-1" title={`${ep.audioTracks.length} faixa(s) de áudio`}>
                            <Volume2 className="w-3 h-3 text-emerald-400" />
                            <span>{ep.audioTracks.length} áudio{ep.audioTracks.length > 1 ? 's' : ''}</span>
                          </span>
                        )}
                        {ep.subtitleTracks.length > 0 && (
                          <span className="flex items-center space-x-1" title={`${ep.subtitleTracks.length} legenda(s)`}>
                            <Subtitles className="w-3 h-3 text-sky-400" />
                            <span>{ep.subtitleTracks.length} legenda{ep.subtitleTracks.length > 1 ? 's' : ''}</span>
                          </span>
                        )}
                      </div>

                      {importedSubtitles.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {importedSubtitles.map((track) => {
                            const removeKey = `${ep.id}-${track.index}`;
                            return (
                              <span
                                key={removeKey}
                                className="inline-flex max-w-full items-center gap-1 rounded bg-sky-950/50 px-1.5 py-0.5 text-[10px] text-sky-300"
                                title={track.filePath}
                              >
                                <span className="max-w-[12rem] truncate">{track.title || 'Legenda importada'}</span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleRemoveImportedSubtitle(ep.id, track.index);
                                  }}
                                  disabled={removingSubtitleKey === removeKey}
                                  className="rounded p-0.5 text-sky-300 hover:bg-sky-800/70 hover:text-white disabled:opacity-50"
                                  title="Remover legenda importada"
                                  aria-label="Remover legenda importada"
                                >
                                  {removingSubtitleKey === removeKey ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {subtitleMessage?.episodeId === ep.id && (
                        <div className={`mt-1 text-[10px] ${subtitleMessage.error ? 'text-red-400' : 'text-emerald-400'}`}>
                          {subtitleMessage.text}
                        </div>
                      )}
                      {(onlineSubtitleOptions[ep.id] || []).length > 0 && (
                        <div className="mt-2 flex max-w-xl flex-wrap gap-1.5">
                          {(onlineSubtitleOptions[ep.id] || []).slice(0, 6).map((option) => (
                            <button
                              key={option.fileId}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDownloadOnline(ep.id, option);
                              }}
                              disabled={downloadingOnlineFileId === option.fileId}
                              className="inline-flex max-w-[16rem] items-center gap-1 rounded bg-indigo-950/60 px-2 py-1 text-[10px] text-indigo-200 hover:bg-indigo-800/70 disabled:opacity-50"
                              title={option.release || option.fileName || 'Baixar legenda'}
                            >
                              {downloadingOnlineFileId === option.fileId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              <span className="truncate">
                                {option.languageName || option.language} {option.release ? `· ${option.release}` : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center justify-end space-x-3 shrink-0 self-end sm:self-center">
                    {/* Search online subtitle */}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleSearchOnline(ep.id);
                      }}
                      disabled={searchingOnlineEpisodeId === ep.id}
                      className="flex items-center space-x-1 rounded bg-indigo-950/60 px-2.5 py-1 text-xs text-indigo-200 transition-colors hover:bg-indigo-800/70 hover:text-white disabled:opacity-60"
                      title="Buscar legendas no OpenSubtitles"
                    >
                      {searchingOnlineEpisodeId === ep.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Online</span>
                    </button>

                    {/* Import subtitle */}
                    <label
                      htmlFor={`subtitle-import-${ep.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className={`flex cursor-pointer items-center space-x-1 rounded bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white ${
                        importingSubtitleEpisodeId === ep.id ? 'pointer-events-none opacity-60' : ''
                      }`}
                      title="Importar legenda (.srt, .vtt, .ass ou .ssa)"
                    >
                      {importingSubtitleEpisodeId === ep.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 text-sky-400" />
                      )}
                      <span className="hidden sm:inline">Legenda</span>
                      <input
                        id={`subtitle-import-${ep.id}`}
                        type="file"
                        accept=".srt,.vtt,.ass,.ssa,text/plain,text/vtt"
                        className="hidden"
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          void handleSubtitleFileChange(ep.id, file);
                        }}
                      />
                    </label>

                    {/* Watched toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWatched(media.id, ep.id, !ep.watched);
                      }}
                      className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition-colors ${
                        ep.watched
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 hover:bg-emerald-900/50'
                          : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
                      }`}
                      title={ep.watched ? 'Marcar como não assistido' : 'Marcar como assistido'}
                    >
                      {ep.watched ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                      <span>{ep.watched ? 'Assistido' : 'Não visto'}</span>
                    </button>

                    {/* Play */}
                    <button
                      onClick={() => onPlayEpisode(media, ep)}
                      className="p-2 rounded-full bg-neutral-800 hover:bg-[#E50914] text-white transition-colors"
                      title="Assistir"
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
