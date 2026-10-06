import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Info, CheckCircle2, Radio, Laptop } from 'lucide-react';
import { MediaItem, Episode } from '../types';
import { formatTime } from '../utils';

interface MediaCardProps {
  media: MediaItem;
  continueEpisode?: Episode;
  onPlay: (media: MediaItem, episode?: Episode) => void;
  onOpenDetails: (media: MediaItem) => void;
  variant?: 'poster' | 'backdrop';
}

export const MediaCard: React.FC<MediaCardProps> = ({
  media,
  continueEpisode,
  onPlay,
  onOpenDetails,
  variant = 'poster',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimeout = useRef<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (!isHovered) return;

    const updateHoverPosition = () => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const width = Math.min(rect.width * 1.2, window.innerWidth - 24);
      const height = width * (9 / 16) + 112;
      const left = Math.max(12, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 12));
      const top = Math.min(Math.max(8, rect.top - 8), Math.max(8, window.innerHeight - height - 8));
      setHoverPosition({ left, top, width });
    };

    updateHoverPosition();
    window.addEventListener('resize', updateHoverPosition);
    window.addEventListener('scroll', updateHoverPosition, true);
    return () => {
      window.removeEventListener('resize', updateHoverPosition);
      window.removeEventListener('scroll', updateHoverPosition, true);
    };
  }, [isHovered]);

  const openHoverCard = () => {
    if (hoverCloseTimeout.current !== null) {
      window.clearTimeout(hoverCloseTimeout.current);
    }
    setIsHovered(true);
  };

  const scheduleHoverCardClose = () => {
    hoverCloseTimeout.current = window.setTimeout(() => setIsHovered(false), 120);
  };

  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [media.id, media.logoPath]);

  // Check if fully watched
  const isAllWatched = media.seasons.every((s) => s.episodes.every((e) => e.watched));

  // Determine active episode for progress
  const activeEp =
    continueEpisode ||
    (media.lastWatchedEpisodeId
      ? media.seasons.flatMap((s) => s.episodes).find((e) => e.id === media.lastWatchedEpisodeId)
      : media.seasons[0]?.episodes[0]);

  const hasProgress = activeEp && activeEp.durationSeconds > 0 && activeEp.progressSeconds > 0 && !activeEp.watched;
  const progressPercent = hasProgress
    ? Math.min(100, Math.floor((activeEp.progressSeconds / activeEp.durationSeconds) * 100))
    : 0;

  const posterUrl = media.posterPath?.startsWith('http')
    ? media.posterPath
    : `/api/media/${media.id}/poster`;

  const backdropUrl = media.backdropPath
    ? (media.backdropPath.startsWith('http') ? media.backdropPath : `/api/media/${media.id}/backdrop`)
    : (activeEp ? `/api/media/${media.id}/episode/${activeEp.id}/thumb` : posterUrl);

  const displayImage = variant === 'backdrop' ? backdropUrl : posterUrl;

  const logoUrl = media.logoPath?.startsWith('http')
    ? media.logoPath
    : (media.logoPath || media.tmdbId ? `/api/media/${media.id}/logo` : undefined);

  return (
    <div
      ref={cardRef}
      id={`media-card-${media.id}`}
      className="group relative shrink-0 select-none cursor-pointer"
      onClick={() => onOpenDetails(media)}
      onMouseEnter={openHoverCard}
      onMouseLeave={scheduleHoverCardClose}
    >
      <div
        className={`relative rounded-md overflow-hidden bg-neutral-900 border border-white/5 ${
          variant === 'backdrop'
            ? 'w-[42vw] sm:w-[calc((100vw_-_4rem)/3)] md:w-[calc((100vw_-_4.5rem)/4)] lg:w-[calc((100vw_-_6rem)/5)] xl:w-[calc((100vw_-_6.5rem)/6)] 2xl:w-[calc((100vw_-_7rem)/7)] aspect-video'
            : 'w-36 sm:w-44 aspect-[2/3]'
        }`}
      >
        {/* Poster / Thumbnail Image */}
        <img
          src={displayImage}
          alt={media.title}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback gradient with clean typography if file poster fails
            const target = e.currentTarget;
            target.style.display = 'none';
            if (target.parentElement) {
              target.parentElement.classList.add('flex', 'items-center', 'justify-center', 'p-3', 'text-center');
            }
          }}
        />

        {/* Top Badges */}
        <div className="absolute top-2 left-2 flex items-center space-x-1 z-10">
          <span className="bg-black/70 backdrop-blur-xs text-[10px] uppercase font-bold text-neutral-200 px-1.5 py-0.5 rounded">
            {media.kind === 'series' ? 'Série' : 'Filme'}
          </span>
          {media.isTorrent && (
            <span className="bg-red-950/90 text-red-300 border border-red-800/60 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
              <Radio className="w-2.5 h-2.5 text-red-400" />
              Magnet
            </span>
          )}
          {media.nodeName && media.nodeId && media.nodeId !== 'local' && (
            <span
              className="bg-purple-950/90 text-purple-300 border border-purple-800/60 text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm"
              title={`Armazenado no nó remoto: ${media.nodeName}`}
            >
              <Laptop className="w-2.5 h-2.5 text-purple-400" />
              <span className="truncate max-w-[65px]">{media.nodeName}</span>
            </span>
          )}
          {isAllWatched && (
            <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-800/40 p-0.5 rounded-full" title="Assistido">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        {/* Bottom-left Logo / Stylized Title overlay */}
        <div className="absolute inset-x-0 bottom-0 pt-6 pb-2 px-2 sm:px-2.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10 flex items-end">
          {logoUrl && !logoFailed ? (
            <img
              src={logoUrl}
              alt={media.title}
              className={`object-contain object-left-bottom drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] transition-transform duration-300 group-hover:scale-105 ${
                variant === 'backdrop' ? 'max-h-7 sm:max-h-8.5 max-w-[80%]' : 'max-h-6 sm:max-h-7.5 max-w-[88%]'
              }`}
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span
              className={`font-extrabold text-white tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] line-clamp-2 ${
                variant === 'backdrop' ? 'text-xs sm:text-sm leading-tight' : 'text-[11px] sm:text-xs leading-tight'
              }`}
            >
              {media.title}
            </span>
          )}
        </div>

        {/* Bottom Red Progress Bar */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800 z-20">
            <div className="h-full bg-[#E50914]" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </div>

      {/* Subtitle text below card for backdrop variant */}
      {variant === 'backdrop' && continueEpisode && (
        <div className="mt-1.5 px-0.5">
          <div className="text-xs font-semibold text-neutral-200 line-clamp-1">{media.title}</div>
          <div className="text-[11px] text-neutral-400 flex items-center justify-between">
            <span>
              T{continueEpisode.seasonNumber}:E{continueEpisode.episodeNumber}
            </span>
            {continueEpisode.durationSeconds > 0 && (
              <span>
                {formatTime(continueEpisode.progressSeconds)} / {formatTime(continueEpisode.durationSeconds)}
              </span>
            )}
          </div>
        </div>
      )}

      {isHovered && hoverPosition && createPortal(
        <div
          className="fixed z-[45] overflow-hidden rounded-md border border-white/10 bg-[#181818] shadow-2xl shadow-black/80"
          style={{ left: hoverPosition.left, top: hoverPosition.top, width: hoverPosition.width }}
          onMouseEnter={openHoverCard}
          onMouseLeave={scheduleHoverCardClose}
          onClick={() => onOpenDetails(media)}
        >
          <div className="relative aspect-video bg-neutral-900">
            <img src={displayImage} alt={media.title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            {logoUrl && !logoFailed && (
              <div className="absolute left-3 bottom-3 right-3 z-10 pointer-events-none">
                <img
                  src={logoUrl}
                  alt={media.title}
                  className="max-h-8 sm:max-h-10 max-w-[75%] object-contain object-left-bottom drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]"
                />
              </div>
            )}
            {hasProgress && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700 z-20">
                <div className="h-full bg-[#E50914]" style={{ width: `${progressPercent}%` }} />
              </div>
            )}
          </div>

          <div className="space-y-2.5 p-3">
            <div className="flex items-center gap-2">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onPlay(media, activeEp);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-neutral-200"
                title="Assistir agora"
              >
                <Play className="ml-0.5 h-4 w-4 fill-black" />
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetails(media);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-500 text-white transition-colors hover:border-white"
                title="Mais informações"
              >
                <Info className="h-4 w-4" />
              </button>
              <span className="ml-auto text-xs font-semibold text-neutral-300">
                {media.kind === 'series'
                  ? `${media.totalSeasons} temporada${media.totalSeasons === 1 ? '' : 's'}`
                  : activeEp?.durationSeconds
                    ? formatTime(activeEp.durationSeconds)
                    : 'Filme'}
              </span>
            </div>

            <div>
              <h3 className="line-clamp-1 text-sm font-bold text-white">{media.title}</h3>
              <p className="mt-1 line-clamp-1 text-xs text-neutral-400">
                {[media.year, media.genres?.slice(0, 2).join(' · '), media.rating ? `★ ${media.rating.toFixed(1)}` : undefined]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            {continueEpisode && (
              <p className="line-clamp-1 text-xs text-neutral-300">
                T{continueEpisode.seasonNumber}:E{continueEpisode.episodeNumber} · {continueEpisode.title}
              </p>
            )}
            {media.overview && <p className="line-clamp-2 text-xs leading-relaxed text-neutral-400">{media.overview}</p>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
