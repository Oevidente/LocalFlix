import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Play, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem, Episode } from '../types';
import { formatTime, formatDurationLabel } from '../utils';

interface HeroBannerProps {
  items?: MediaItem[];
  media?: MediaItem;
  onPlayEpisode: (media: MediaItem, episode: Episode) => void;
  onOpenDetails: (media: MediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  items,
  media,
  onPlayEpisode,
  onOpenDetails,
}) => {
  // Extract up to 5 items for the carousel
  const mediaList = useMemo(() => {
    if (items && items.length > 0) {
      return items.slice(0, 5);
    }
    if (media) {
      return [media];
    }
    return [];
  }, [items, media]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [logoFailedMap, setLogoFailedMap] = useState<Record<string, boolean>>({});

  // Touch gesture coordinates
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // Keep index within bounds
  const safeIndex =
    mediaList.length > 0
      ? ((currentIndex % mediaList.length) + mediaList.length) % mediaList.length
      : 0;

  const currentMedia: MediaItem | undefined = mediaList[safeIndex];

  // Auto-advance every 7 seconds when not paused/hovered
  useEffect(() => {
    if (mediaList.length <= 1 || isHovered) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % mediaList.length);
    }, 7000);

    return () => clearInterval(timer);
  }, [mediaList.length, isHovered, safeIndex]);

  const handleNext = () => {
    if (mediaList.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % mediaList.length);
  };

  const handlePrev = () => {
    if (mediaList.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY =
      touchStartYRef.current !== null
        ? Math.abs(e.changedTouches[0].clientY - touchStartYRef.current)
        : 0;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > deltaY) {
      if (deltaX < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  if (!currentMedia) {
    return null;
  }

  // Determine target episode: next unwatched or in-progress
  let targetEpisode: Episode | undefined;
  const allEpisodes = currentMedia.seasons.flatMap((s) => s.episodes);
  if (currentMedia.lastWatchedEpisodeId) {
    const lastIdx = allEpisodes.findIndex((e) => e.id === currentMedia.lastWatchedEpisodeId);
    if (lastIdx >= 0) {
      const lastEp = allEpisodes[lastIdx];
      if (lastEp.watched && currentMedia.kind === 'series') {
        const nextUnwatched = allEpisodes.slice(lastIdx + 1).find((e) => !e.watched);
        targetEpisode = nextUnwatched || lastEp;
      } else {
        targetEpisode = lastEp;
      }
    }
  }
  if (!targetEpisode) {
    targetEpisode =
      allEpisodes.find((e) => e.progressSeconds > 10 && !e.watched) ||
      allEpisodes.find((e) => !e.watched) ||
      allEpisodes[0];
  }

  const isContinue = Boolean(
    targetEpisode && targetEpisode.progressSeconds > 10 && !targetEpisode.watched
  );

  const logoUrl = currentMedia.logoPath?.startsWith('http')
    ? currentMedia.logoPath
    : currentMedia.logoPath || currentMedia.tmdbId
      ? `/api/media/${currentMedia.id}/logo`
      : undefined;

  const isLogoFailed = Boolean(logoUrl && logoFailedMap[currentMedia.id]);

  // Dot-separated meta items
  const metaElements: string[] = [];
  metaElements.push(currentMedia.kind === 'series' ? 'Série' : 'Filme');

  if (currentMedia.genres && currentMedia.genres.length > 0) {
    metaElements.push(currentMedia.genres.slice(0, 2).join(' • '));
  }

  if (currentMedia.year) {
    metaElements.push(String(currentMedia.year));
  }

  if (currentMedia.kind === 'series') {
    metaElements.push(
      `${currentMedia.totalSeasons} Temporada${currentMedia.totalSeasons > 1 ? 's' : ''}`
    );
  } else if (targetEpisode?.durationSeconds) {
    metaElements.push(formatDurationLabel(targetEpisode.durationSeconds));
  }

  const overviewText =
    currentMedia.overview ||
    targetEpisode?.overview ||
    (currentMedia.kind === 'series'
      ? 'Assista a todos os episódios no seu servidor local offline com áudio original e suporte a legendas.'
      : 'Filme disponível para reprodução imediata na sua biblioteca local com qualidade de alta definição.');

  return (
    <div
      className="w-full pt-16 sm:pt-20 pb-2 select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="relative mx-auto w-[calc(100%-1.5rem)] sm:w-[86%] h-[40vw] min-h-[300px] max-h-[80vh] rounded-xl overflow-hidden bg-neutral-950 border border-white/10 shadow-2xl group">
        {/* Backdrop Images Stack for Smooth Crossfade */}
        {mediaList.map((item, idx) => {
          const isActive = idx === safeIndex;
          const bannerUrl = item.backdropPath
            ? item.backdropPath.startsWith('http')
              ? item.backdropPath
              : `/api/media/${item.id}/backdrop`
            : item.posterPath?.startsWith('http')
              ? item.posterPath
              : `/api/media/${item.id}/poster`;

          return (
            <div
              key={item.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                isActive ? 'opacity-90 z-0' : 'opacity-0 pointer-events-none -z-10'
              }`}
            >
              <img
                src={bannerUrl}
                alt={item.title}
                className="w-full h-full object-cover object-center transition-transform duration-1000 ease-out group-hover:scale-102"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          );
        })}

        {/* Subtle cinematic gradients (matching Netflix style) */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-black/40 to-transparent z-[1] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141414]/90 via-[#141414]/50 to-transparent w-full md:w-3/5 z-[1] pointer-events-none" />

        {/* Billboard Hero Content */}
        <div
          key={`content-${currentMedia.id}`}
          className="relative h-full w-full px-4 pb-8 sm:px-6 sm:pb-12 lg:px-8 lg:pb-16 flex flex-col justify-end z-10 animate-fade-in"
        >
          {/* Title or Official Transparent Logo */}
          {logoUrl && !isLogoFailed ? (
            <div className="mb-3 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
              <img
                src={logoUrl}
                alt={currentMedia.title}
                className="max-h-20 sm:max-h-28 lg:max-h-36 w-auto object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]"
                onError={() =>
                  setLogoFailedMap((prev) => ({ ...prev, [currentMedia.id]: true }))
                }
              />
            </div>
          ) : (
            <h1
              id="hero-media-title"
              className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-2xl mb-2.5 max-w-3xl line-clamp-2"
            >
              {currentMedia.title}
            </h1>
          )}

          {/* Dot-separated Meta Info Bar */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm font-semibold text-neutral-300 mb-2.5 drop-shadow">
            {metaElements.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-neutral-500">·</span>}
                <span>{item}</span>
              </React.Fragment>
            ))}

            {/* Resolution or Rating Pill */}
            {targetEpisode?.resolution ? (
              <>
                <span className="text-neutral-500">·</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-white/10 text-neutral-200 border border-white/20">
                  {targetEpisode.resolution}
                </span>
              </>
            ) : currentMedia.rating ? (
              <>
                <span className="text-neutral-500">·</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-800/60">
                  ★ {currentMedia.rating.toFixed(1)}
                </span>
              </>
            ) : null}
          </div>

          {/* Episode Info if Series / Continue Watching */}
          {targetEpisode && isContinue && (
            <div className="text-xs sm:text-sm text-neutral-300 font-medium mb-2 flex items-center flex-wrap gap-2">
              <span className="text-red-400 font-bold">
                {currentMedia.kind === 'series'
                  ? `T${targetEpisode.seasonNumber}:E${targetEpisode.episodeNumber} - ${targetEpisode.title}`
                  : targetEpisode.title}
              </span>
              <span className="text-neutral-400 text-xs">
                (Parou em {formatTime(targetEpisode.progressSeconds)})
              </span>
            </div>
          )}

          {/* Progress Bar if partially watched */}
          {targetEpisode &&
            targetEpisode.durationSeconds > 0 &&
            targetEpisode.progressSeconds > 0 &&
            isContinue && (
              <div className="w-60 max-w-full bg-neutral-800/90 rounded-full h-1.5 mb-3 overflow-hidden border border-white/10">
                <div
                  className="bg-[#E50914] h-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (targetEpisode.progressSeconds / targetEpisode.durationSeconds) * 100
                    )}%`,
                  }}
                />
              </div>
            )}

          {/* Synopsis / Description */}
          <p className="text-xs sm:text-sm lg:text-base text-neutral-200 line-clamp-2 max-w-2xl font-normal leading-relaxed mb-4 drop-shadow text-neutral-300">
            {overviewText}
          </p>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {targetEpisode && (
              <button
                id="hero-play-button"
                onClick={() => onPlayEpisode(currentMedia, targetEpisode!)}
                className="flex items-center space-x-2 px-6 py-2.5 sm:px-7 sm:py-3 rounded-md bg-white text-black font-bold hover:bg-neutral-200 transition-all shadow-xl active:scale-95 shrink-0 whitespace-nowrap cursor-pointer z-10"
              >
                <Play className="w-5 h-5 fill-black shrink-0" />
                <span>{isContinue ? 'Continuar Assistindo' : 'Assistir'}</span>
              </button>
            )}

            <button
              id="hero-info-button"
              onClick={() => onOpenDetails(currentMedia)}
              className="flex items-center space-x-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-md bg-neutral-500/80 hover:bg-neutral-400/90 text-white font-semibold backdrop-blur-md transition-all shadow-lg active:scale-95 shrink-0 whitespace-nowrap cursor-pointer z-10"
            >
              <Info className="w-5 h-5 shrink-0" />
              <span>Mais Informações</span>
            </button>
          </div>
        </div>

        {/* Carousel Navigation Arrows */}
        {mediaList.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              aria-label="Item anterior do carrossel"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full bg-black/40 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition-all active:scale-95 shadow-xl opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 flex items-center justify-center cursor-pointer min-w-[44px] min-h-[44px]"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <button
              onClick={handleNext}
              aria-label="Próximo item do carrossel"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full bg-black/40 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition-all active:scale-95 shadow-xl opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 flex items-center justify-center cursor-pointer min-w-[44px] min-h-[44px]"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </>
        )}

        {/* Netflix-Style Carousel Slide Indicators */}
        {mediaList.length > 1 && (
          <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-8 z-30 flex items-center space-x-1.5 sm:space-x-2">
            {mediaList.map((item, idx) => {
              const isActive = idx === safeIndex;
              return (
                <button
                  key={`indicator-${item.id}-${idx}`}
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Slide ${idx + 1} de ${mediaList.length}: ${item.title}`}
                  className="group/ind py-2 px-1 focus:outline-none cursor-pointer"
                >
                  <div
                    className={`h-1 sm:h-1.5 rounded-full transition-all duration-300 relative overflow-hidden ${
                      isActive
                        ? 'w-7 sm:w-10 bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)]'
                        : 'w-3 sm:w-4 bg-white/35 hover:bg-white/65 group-hover/ind:w-5'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
