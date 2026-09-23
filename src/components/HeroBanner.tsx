import React from 'react';
import { Play, Info, RotateCcw } from 'lucide-react';
import { MediaItem, Episode } from '../types';
import { formatTime } from '../utils';

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
  const isContinue = targetEpisode && targetEpisode.progressSeconds > 10 && !targetEpisode.watched;

  return (
    <div className="relative w-full h-[68vh] min-h-[480px] max-h-[720px] overflow-hidden bg-black select-none">
      {/* Background Image / Backdrop */}
      <div className="absolute inset-0">
        <img
          src={bannerUrl}
          alt={media.title}
          className="w-full h-full object-cover object-center opacity-45 scale-105 filter blur-xs"
          onError={(e) => {
            // Fallback gradient if poster is missing
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        {/* Cinematic Vignette Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/80 to-transparent w-full md:w-3/4" />
      </div>

      {/* Hero Content */}
      <div className="relative max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-12 sm:pb-16 lg:pb-20 z-10">
        {/* Badges */}
        <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-2">
          <span className="bg-[#E50914] text-white px-2 py-0.5 rounded font-black text-[11px] tracking-tight">
            {media.kind === 'series' ? 'SÉRIE' : 'FILME'}
          </span>
          <span className="text-neutral-400">·</span>
          <span>
            {media.kind === 'series'
              ? `${media.totalSeasons} Temporada${media.totalSeasons > 1 ? 's' : ''} (${media.totalEpisodes} eps)`
              : 'Filme Completo'}
          </span>
          {targetEpisode?.resolution && (
            <>
              <span className="text-neutral-400">·</span>
              <span className="border border-neutral-600 px-1.5 py-0.2 rounded text-[10px] text-neutral-300">
                {targetEpisode.resolution}
              </span>
            </>
          )}
        </div>

        {/* Title */}
        <h1
          id="hero-media-title"
          className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-2xl mb-3 max-w-2xl line-clamp-2"
        >
          {media.title}
        </h1>

        {/* Episode context if continue watching */}
        {targetEpisode && media.kind === 'series' && (
          <div className="text-sm sm:text-base text-neutral-300 font-medium mb-3 flex flex-wrap items-center gap-2">
            <span className="text-red-400 font-semibold">
              T{targetEpisode.seasonNumber}:E{targetEpisode.episodeNumber}
            </span>
            <span>-</span>
            <span className="text-neutral-200">{targetEpisode.title}</span>
            {isContinue && (
              <span className="text-xs text-neutral-400">
                (Parou em {formatTime(targetEpisode.progressSeconds)})
              </span>
            )}
          </div>
        )}

        {/* Progress bar if partially watched */}
        {targetEpisode && targetEpisode.durationSeconds > 0 && targetEpisode.progressSeconds > 0 && (
          <div className="w-64 max-w-full bg-neutral-800 rounded-full h-1.5 mb-4 overflow-hidden">
            <div
              className="bg-[#E50914] h-full transition-all"
              style={{
                width: `${Math.min(100, (targetEpisode.progressSeconds / targetEpisode.durationSeconds) * 100)}%`,
              }}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {targetEpisode && (
            <button
              id="hero-play-button"
              onClick={() => onPlayEpisode(media, targetEpisode!)}
              className="flex items-center space-x-2 px-6 py-2.5 sm:px-7 sm:py-3 rounded bg-white text-black font-bold hover:bg-neutral-200 transition-all shadow-xl active:scale-95 shrink-0 whitespace-nowrap cursor-pointer z-10"
            >
              <Play className="w-5 h-5 fill-black shrink-0" />
              <span>{isContinue ? 'Continuar Assistindo' : 'Assistir'}</span>
            </button>
          )}

          <button
            id="hero-info-button"
            onClick={() => onOpenDetails(media)}
            className="flex items-center space-x-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded bg-neutral-700/80 hover:bg-neutral-600/80 text-white font-semibold backdrop-blur-sm transition-all shadow-lg active:scale-95 shrink-0 whitespace-nowrap cursor-pointer z-10"
          >
            <Info className="w-5 h-5 shrink-0" />
            <span>Mais Informações</span>
          </button>
        </div>
      </div>
    </div>
  );
};
