import React, { useState, useEffect } from 'react';
import { Play, Info, Sparkles, Film, Tv } from 'lucide-react';
import { MediaItem, Episode } from '../types';
import { formatTime, formatDurationLabel } from '../utils';

interface HeroBannerProps {
  media: MediaItem;
  onPlayEpisode: (media: MediaItem, episode: Episode) => void;
  onOpenDetails: (media: MediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  media,
  onPlayEpisode,
  onOpenDetails,
}) => {
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [media.id, media.logoPath]);

  const logoUrl = media.logoPath?.startsWith('http')
    ? media.logoPath
    : (media.logoPath || media.tmdbId ? `/api/media/${media.id}/logo` : undefined);
  // Determine episode to play: last watched or first episode
  let targetEpisode: Episode | undefined;
  if (media.lastWatchedEpisodeId) {
    for (const s of media.seasons) {
      const ep = s.episodes.find((e) => e.id === media.lastWatchedEpisodeId);
      if (ep) {
        targetEpisode = ep;
        break;
      }
    }
  }
  if (!targetEpisode && media.seasons[0]?.episodes[0]) {
    targetEpisode = media.seasons[0].episodes[0];
  }

  const bannerUrl = media.backdropPath
    ? (media.backdropPath.startsWith('http') ? media.backdropPath : `/api/media/${media.id}/backdrop`)
    : (media.posterPath?.startsWith('http') ? media.posterPath : `/api/media/${media.id}/poster`);

  const isContinue = Boolean(targetEpisode && targetEpisode.progressSeconds > 10 && !targetEpisode.watched);

  // Dot-separated meta items like Netflix
  const metaElements: string[] = [];
  metaElements.push(media.kind === 'series' ? 'Série' : 'Filme');

  if (media.genres && media.genres.length > 0) {
    metaElements.push(media.genres.slice(0, 2).join(' • '));
  }

  if (media.year) {
    metaElements.push(String(media.year));
  }

  if (media.kind === 'series') {
    metaElements.push(`${media.totalSeasons} Temporada${media.totalSeasons > 1 ? 's' : ''}`);
  } else if (targetEpisode?.durationSeconds) {
    metaElements.push(formatDurationLabel(targetEpisode.durationSeconds));
  }

  const overviewText =
    media.overview ||
    targetEpisode?.overview ||
    (media.kind === 'series'
      ? 'Assista a todos os episódios no seu servidor local offline com áudio original e suporte a legendas.'
      : 'Filme disponível para reprodução imediata na sua biblioteca local com qualidade de alta definição.');

  return (
    <div className="w-full pt-16 sm:pt-20 pb-2 select-none">
      <div className="relative mx-auto w-[calc(100%-1.5rem)] sm:w-[86%] h-[40vw] min-h-[300px] max-h-[80vh] rounded-xl overflow-hidden bg-neutral-950 border border-white/10 shadow-2xl group">
        {/* Backdrop Image */}
        <div className="absolute inset-0">
          <img
            src={bannerUrl}
            alt={media.title}
            className="w-full h-full object-cover object-center opacity-90 transition-transform duration-700 ease-out group-hover:scale-102"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          {/* Subtle cinematic gradients (matching Netflix style) */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#141414]/90 via-[#141414]/50 to-transparent w-full md:w-3/5" />
        </div>

        {/* Billboard Hero Content */}
        <div className="relative h-full w-full px-4 pb-8 sm:px-6 sm:pb-12 lg:px-8 lg:pb-16 flex flex-col justify-end z-10">
          {/* Title or Official Transparent Logo */}
          {logoUrl && !logoFailed ? (
            <div className="mb-3 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
              <img
                src={logoUrl}
                alt={media.title}
                className="max-h-20 sm:max-h-28 lg:max-h-36 w-auto object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]"
                onError={() => setLogoFailed(true)}
              />
            </div>
          ) : (
            <h1
              id="hero-media-title"
              className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-2xl mb-2.5 max-w-3xl line-clamp-2"
            >
              {media.title}
            </h1>
          )}

          {/* Dot-separated Meta Info Bar (e.g. Filme • Fantasia • 2025 • 1h 41min • 10) */}
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
            ) : media.rating ? (
              <>
                <span className="text-neutral-500">·</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-800/60">
                  ★ {media.rating.toFixed(1)}
                </span>
              </>
            ) : null}
          </div>

          {/* Episode Info if Series / Continue Watching */}
          {targetEpisode && isContinue && (
            <div className="text-xs sm:text-sm text-neutral-300 font-medium mb-2 flex items-center flex-wrap gap-2">
              <span className="text-red-400 font-bold">
                {media.kind === 'series' ? `T${targetEpisode.seasonNumber}:E${targetEpisode.episodeNumber} - ${targetEpisode.title}` : targetEpisode.title}
              </span>
              <span className="text-neutral-400 text-xs">
                (Parou em {formatTime(targetEpisode.progressSeconds)})
              </span>
            </div>
          )}

          {/* Progress Bar if partially watched */}
          {targetEpisode && targetEpisode.durationSeconds > 0 && targetEpisode.progressSeconds > 0 && isContinue && (
            <div className="w-60 max-w-full bg-neutral-800/90 rounded-full h-1.5 mb-3 overflow-hidden border border-white/10">
              <div
                className="bg-[#E50914] h-full transition-all"
                style={{
                  width: `${Math.min(100, (targetEpisode.progressSeconds / targetEpisode.durationSeconds) * 100)}%`,
                }}
              />
            </div>
          )}

          {/* Synopsis / Description (2 lines max like Netflix) */}
          <p className="text-xs sm:text-sm lg:text-base text-neutral-200 line-clamp-2 max-w-2xl font-normal leading-relaxed mb-4 drop-shadow text-neutral-300">
            {overviewText}
          </p>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {targetEpisode && (
              <button
                id="hero-play-button"
                onClick={() => onPlayEpisode(media, targetEpisode!)}
                className="flex items-center space-x-2 px-6 py-2.5 sm:px-7 sm:py-3 rounded-md bg-white text-black font-bold hover:bg-neutral-200 transition-all shadow-xl active:scale-95 shrink-0 whitespace-nowrap cursor-pointer z-10"
              >
                <Play className="w-5 h-5 fill-black shrink-0" />
                <span>{isContinue ? 'Continuar Assistindo' : 'Assistir'}</span>
              </button>
            )}

            <button
              id="hero-info-button"
              onClick={() => onOpenDetails(media)}
              className="flex items-center space-x-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-md bg-neutral-500/80 hover:bg-neutral-400/90 text-white font-semibold backdrop-blur-md transition-all shadow-lg active:scale-95 shrink-0 whitespace-nowrap cursor-pointer z-10"
            >
              <Info className="w-5 h-5 shrink-0" />
              <span>Mais Informações</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
