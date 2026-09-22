import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Subtitles,
  SkipForward,
  Settings,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { MediaItem, Episode, AudioTrackInfo, SubtitleTrackInfo } from '../types';
import { formatTime } from '../utils';

interface VideoPlayerProps {
  media: MediaItem;
  episode: Episode;
  onClose: () => void;
  onPlayNextEpisode?: () => void;
  nextEpisode?: Episode;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  media,
  episode,
  onClose,
  onPlayNextEpisode,
  nextEpisode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<any>(null);
  const progressSaveTimer = useRef<any>(null);
  const saveProgressDebounceTimer = useRef<any>(null);
  const isSeekingRef = useRef<boolean>(false);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(episode.durationSeconds || 0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Audio & Subtitle Tracks
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number>(
    episode.selectedAudioIndex !== undefined ? episode.selectedAudioIndex : 0
  );
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number>(
    episode.selectedSubtitleIndex !== undefined ? episode.selectedSubtitleIndex : -1 // -1 = off
  );
  const [showAudioSubModal, setShowAudioSubModal] = useState<boolean>(false);

  // Next Episode Auto-Countdown
  const [showNextCountdown, setShowNextCountdown] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(5);
  const countdownInterval = useRef<any>(null);

  // Recovery & Transcode Fallback States
  const [isForceTranscode, setIsForceTranscode] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState<boolean>(false);

  // Calculate stream source
  const isDirectMP4 = episode.extension === '.mp4' || episode.extension === '.webm';
  // If user selected non-default audio or it's MKV/AVI, use ffmpeg streaming
  const [seekOffset, setSeekOffset] = useState<number>(0);

  // Build stream URL
  const getStreamUrl = useCallback(
    (audioIdx: number, seekSec: number = 0, forceTrans: boolean = false) => {
      let url = `/api/media/${media.id}/episode/${episode.id}/stream`;
      const params = new URLSearchParams();
      const needsTranscode = forceTrans || isForceTranscode;
      if (audioIdx > 0 || !isDirectMP4 || needsTranscode) {
        params.append('audio', audioIdx.toString());
      }
      if (needsTranscode) {
        params.append('transcode', '1');
      }
      if ((!isDirectMP4 || needsTranscode) && seekSec > 0) {
        params.append('seek', Math.floor(seekSec).toString());
      }
      const qs = params.toString();
      return qs ? `${url}?${qs}` : url;
    },
    [media.id, episode.id, isDirectMP4, isForceTranscode]
  );

  const [streamSrc, setStreamSrc] = useState<string>(() => {
    // Initial start: resume from episode.progressSeconds if exists
    const initialProgress =
      episode.progressSeconds > 10 && !episode.watched ? episode.progressSeconds : 0;
    return getStreamUrl(selectedAudioIndex, !isDirectMP4 ? initialProgress : 0, false);
  });

  // Save progress helper (debounced to avoid thrashing server and disk)
  const saveProgress = useCallback(
    (timeSec: number, totalDur?: number, completed?: boolean, immediate = false) => {
      if (timeSec < 0 || isNaN(timeSec)) return;

      const performSave = () => {
        const payload = {
          mediaId: media.id,
          episodeId: episode.id,
          progressSeconds: Math.floor(timeSec),
          durationSeconds: totalDur || duration,
          completed: completed,
          audioIndex: selectedAudioIndex,
          subtitleIndex: selectedSubtitleIndex,
        };

        try {
          fetch('/api/library/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch((err) => console.error('Error saving progress:', err));
        } catch (e) {
          console.error('Error saving progress:', e);
        }
      };

      if (saveProgressDebounceTimer.current) {
        clearTimeout(saveProgressDebounceTimer.current);
        saveProgressDebounceTimer.current = null;
      }

      if (immediate || completed) {
        performSave();
      } else {
        saveProgressDebounceTimer.current = setTimeout(performSave, 1500);
      }
    },
    [media.id, episode.id, duration, selectedAudioIndex, selectedSubtitleIndex]
  );

  // Auto-hide controls
  const handleUserActivity = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
        setShowAudioSubModal(false);
      }
    }, 3500);
  }, []);

  // Initialize playback and seek to saved position
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const initialSeek = episode.progressSeconds > 10 && !episode.watched ? episode.progressSeconds : 0;

    const handleLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
        setDuration(video.duration);
      }
      if (isDirectMP4 && initialSeek > 0) {
        video.currentTime = initialSeek;
      }
      video.play().catch(() => {});
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [episode.id, isDirectMP4]);

  // Periodic progress saving (every 5 seconds)
  useEffect(() => {
    progressSaveTimer.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const exactTime = isDirectMP4
          ? videoRef.current.currentTime
          : seekOffset + videoRef.current.currentTime;
        saveProgress(exactTime);
      }
    }, 5000);

    return () => {
      if (progressSaveTimer.current) clearInterval(progressSaveTimer.current);
    };
  }, [saveProgress, isDirectMP4, seekOffset]);

  // Save on pause or beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (videoRef.current) {
        const exactTime = isDirectMP4
          ? videoRef.current.currentTime
          : seekOffset + videoRef.current.currentTime;
        saveProgress(exactTime);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [saveProgress, isDirectMP4, seekOffset]);

  // Subtitle track application
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (selectedSubtitleIndex >= 0 && i === selectedSubtitleIndex) {
        track.mode = 'showing';
      } else {
        track.mode = 'disabled';
      }
    }
  }, [selectedSubtitleIndex, episode.subtitleTracks]);

  // Handle switching audio tracks
  const handleSelectAudio = (index: number) => {
    setSelectedAudioIndex(index);
    const video = videoRef.current;
    if (!video) return;

    const currentExact = isDirectMP4 && !isForceTranscode
      ? video.currentTime
      : seekOffset + video.currentTime;

    saveProgress(currentExact);

    // Reload stream with chosen audio
    if (!isDirectMP4 || isForceTranscode) {
      setSeekOffset(currentExact);
      setStreamSrc(getStreamUrl(index, currentExact, isForceTranscode));
    } else {
      // In direct mp4, if audio index > 0, switch to ffmpeg remux
      if (index > 0) {
        setSeekOffset(currentExact);
        setStreamSrc(getStreamUrl(index, currentExact, false));
      } else {
        setSeekOffset(0);
        setStreamSrc(getStreamUrl(0, 0, false));
        video.currentTime = currentExact;
      }
    }
  };

  // Handle seeking
  const handleSeek = (targetSec: number) => {
    const video = videoRef.current;
    if (!video) return;

    // Immediately cancel any active countdown when user manually seeks
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    setShowNextCountdown(false);

    isSeekingRef.current = true;
    const clampedSec = Math.max(0, Math.min(targetSec, duration > 0 ? duration : targetSec));

    if (isDirectMP4 && !isForceTranscode && streamSrc.indexOf('seek=') === -1) {
      try {
        video.currentTime = clampedSec;
      } catch (err) {
        console.warn('Seek error on HTML5 video:', err);
      }
      setCurrentTime(clampedSec);
    } else {
      // MKV or transcoded stream: reload stream from seek position
      setSeekOffset(clampedSec);
      setStreamSrc(getStreamUrl(selectedAudioIndex, clampedSec, isForceTranscode));
      setCurrentTime(clampedSec);
    }
    saveProgress(clampedSec, duration, false, false);

    setTimeout(() => {
      isSeekingRef.current = false;
    }, 1000);
  };

  // Sync isFullscreen with native browser events
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if inside input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      const video = videoRef.current;
      if (!video) return;

      handleUserActivity();

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (video.paused) {
            video.play();
            setIsPlaying(true);
          } else {
            video.pause();
            setIsPlaying(false);
          }
          break;
        case 'arrowleft':
          e.preventDefault();
          handleSeek(currentTime - 10);
          break;
        case 'arrowright':
          e.preventDefault();
          handleSeek(currentTime + 10);
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.min(1, Math.round((v + 0.1) * 10) / 10);
            video.volume = nv;
            setIsMuted(nv === 0);
            return nv;
          });
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.max(0, Math.round((v - 0.1) * 10) / 10);
            video.volume = nv;
            setIsMuted(nv === 0);
            return nv;
          });
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'escape':
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
            setIsFullscreen(false);
          } else {
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, duration, isFullscreen, onClose, handleUserActivity]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Mute toggle
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  // Video timeupdate listener
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const exact = isDirectMP4 && streamSrc.indexOf('seek=') === -1
      ? video.currentTime
      : seekOffset + video.currentTime;

    setCurrentTime(exact);

    if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
      if (isDirectMP4) {
        setDuration(video.duration);
      }
    }

    // Reset countdown if user moved back before the final 15 seconds
    if (showNextCountdown && duration > 30 && exact < duration - 15) {
      setShowNextCountdown(false);
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
    }

    // Auto next episode countdown if within 15 seconds of completion
    if (nextEpisode && duration > 30 && exact >= duration - 15 && !showNextCountdown) {
      setShowNextCountdown(true);
      setCountdownSeconds(10);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      countdownInterval.current = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval.current);
            if (onPlayNextEpisode) onPlayNextEpisode();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  // Automatic Stream Recovery when stream terminates prematurely or decode fails
  const handleStreamRecovery = useCallback(
    (enableTranscode = true) => {
      if (isRecovering) return;
      setIsRecovering(true);
      const video = videoRef.current;
      const exact = isDirectMP4 && streamSrc.indexOf('seek=') === -1 && !isForceTranscode
        ? video?.currentTime || currentTime
        : seekOffset + (video?.currentTime || 0);

      const resumeTime = Math.max(0, exact);

      if (enableTranscode) {
        setIsForceTranscode(true);
      }

      setSeekOffset(resumeTime);
      setCurrentTime(resumeTime);
      const newUrl = getStreamUrl(selectedAudioIndex, resumeTime, enableTranscode || isForceTranscode);
      setStreamSrc(newUrl);

      setTimeout(() => {
        setIsRecovering(false);
        if (videoRef.current) {
          videoRef.current.load();
          videoRef.current.play().catch(() => {});
        }
      }, 400);
    },
    [isRecovering, isDirectMP4, streamSrc, isForceTranscode, currentTime, seekOffset, selectedAudioIndex, getStreamUrl]
  );

  const handleEnded = () => {
    // Ignore ended events triggered during seek transitions
    if (isSeekingRef.current) {
      return;
    }
    setIsPlaying(false);
    const video = videoRef.current;
    const exact = isDirectMP4 && streamSrc.indexOf('seek=') === -1 && !isForceTranscode
      ? video?.currentTime || currentTime
      : seekOffset + (video?.currentTime || 0);

    // Only consider the episode genuinely completed if it played through near the real duration
    const isActuallyFinished =
      duration > 30 && isFinite(duration) ? exact >= Math.max(duration - 20, duration * 0.9) : false;

    if (isActuallyFinished) {
      saveProgress(duration, duration, true, true);
      if (nextEpisode && onPlayNextEpisode) {
        onPlayNextEpisode();
      }
    } else {
      // Premature stream cutoff (common after bumper/vinheta splice)
      handleStreamRecovery(true);
    }
  };

  const handleVideoError = () => {
    // Ignore error events triggered during seek or stream transition
    if (isSeekingRef.current) {
      return;
    }
    const err = videoRef.current?.error;
    console.warn('[VideoPlayer] Video element error encountered:', err);
    if (!isForceTranscode) {
      handleStreamRecovery(true);
    } else {
      setPlaybackError('Não foi possível continuar a reprodução deste formato diretamente.');
    }
  };

  // Progress scrubbing calculation
  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * (duration || 100));
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * (duration || 100);
    handleSeek(target);
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      id="video-player-container"
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center select-none overflow-hidden"
      onMouseMove={handleUserActivity}
      onClick={handleUserActivity}
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        id="html5-video-player"
        src={streamSrc}
        className="w-full h-full object-contain cursor-pointer"
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => {
          setIsPlaying(true);
          isSeekingRef.current = false;
        }}
        onSeeking={() => {
          isSeekingRef.current = true;
        }}
        onSeeked={() => {
          setTimeout(() => {
            isSeekingRef.current = false;
          }, 400);
        }}
        onPause={() => {
          setIsPlaying(false);
          const exact = isDirectMP4 && !isForceTranscode ? videoRef.current?.currentTime || 0 : seekOffset + (videoRef.current?.currentTime || 0);
          saveProgress(exact, duration, false, true);
        }}
        onEnded={handleEnded}
        onError={handleVideoError}
        onClick={(e) => {
          e.stopPropagation();
          if (videoRef.current?.paused) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current?.pause();
          }
        }}
        playsInline
      >
        {/* Render subtitle tracks */}
        {episode.subtitleTracks.map((track) => (
          <track
            key={`sub-${track.index}`}
            kind="subtitles"
            label={track.title || `Legenda ${track.index + 1}`}
            srcLang={track.language || 'pt'}
            src={`/api/media/${media.id}/episode/${episode.id}/subtitles/${track.index}`}
          />
        ))}
      </video>

      {/* Stream Recovery Indicator */}
      {isRecovering && (
        <div
          id="player-recovering-indicator"
          className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center z-30 pointer-events-none"
        >
          <Loader2 className="w-12 h-12 text-red-500 animate-spin mb-3" />
          <p className="text-white text-sm font-medium tracking-wide">Sincronizando reprodução...</p>
        </div>
      )}

      {/* Playback Error Overlay */}
      {playbackError && (
        <div
          id="player-error-overlay"
          className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-6 text-center"
        >
          <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-4 text-red-400">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Falha na Reprodução</h3>
          <p className="text-neutral-400 text-sm max-w-md mb-6">{playbackError}</p>
          <div className="flex items-center space-x-3">
            <button
              id="player-retry-transcode-btn"
              onClick={() => {
                setPlaybackError(null);
                handleStreamRecovery(true);
              }}
              className="px-5 py-2.5 rounded bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors shadow-lg"
            >
              Tentar Novamente
            </button>
            <button
              id="player-close-error-btn"
              onClick={onClose}
              className="px-5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-sm transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div
        id="player-top-bar"
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between z-40 transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center space-x-4">
          <button
            id="player-back-btn"
            onClick={onClose}
            className="p-2 rounded-full bg-black/50 hover:bg-neutral-800 text-white transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-white font-bold text-base sm:text-lg drop-shadow">{media.title}</h2>
            <div className="text-xs sm:text-sm text-neutral-300 drop-shadow">
              {media.kind === 'series'
                ? `Temporada ${episode.seasonNumber} : Episódio ${episode.episodeNumber} - ${episode.title}`
                : episode.title}
            </div>
          </div>
        </div>

        {/* Codec & Mode Badge */}
        <div className="hidden sm:flex items-center space-x-2 text-xs text-neutral-400 font-mono">
          <span className="bg-black/60 px-2 py-0.5 rounded border border-neutral-700">
            {episode.extension.toUpperCase()}
          </span>
          {isDirectMP4 ? (
            <span className="bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/40">
              Direto (Range 206)
            </span>
          ) : (
            <span className="bg-blue-950/80 text-blue-400 px-2 py-0.5 rounded border border-blue-800/40">
              FFmpeg Remux
            </span>
          )}
        </div>
      </div>

      {/* Next Episode Countdown Overlay */}
      {showNextCountdown && nextEpisode && (
        <div
          id="player-next-countdown"
          className="absolute bottom-28 right-6 z-40 bg-neutral-900/95 border border-white/20 p-4 rounded-xl shadow-2xl backdrop-blur-md max-w-sm flex items-center space-x-4 animate-in slide-in-from-right duration-300"
        >
          <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
            <svg className="w-12 h-12 -rotate-90">
              <circle cx="24" cy="24" r="20" stroke="#333" strokeWidth="4" fill="transparent" />
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="#E50914"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray="125.6"
                strokeDashoffset={`${125.6 * (1 - countdownSeconds / 10)}`}
                className="transition-all duration-1000"
              />
            </svg>
            <span className="absolute font-black text-white text-sm">{countdownSeconds}s</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs text-neutral-400 uppercase font-semibold">Próximo Episódio</div>
            <div className="text-sm font-bold text-white truncate">{nextEpisode.title}</div>
            <div className="flex items-center space-x-2 mt-2">
              <button
                onClick={() => {
                  if (countdownInterval.current) clearInterval(countdownInterval.current);
                  if (onPlayNextEpisode) onPlayNextEpisode();
                }}
                className="px-3 py-1 bg-[#E50914] hover:bg-red-700 text-white text-xs font-bold rounded"
              >
                Assistir Agora
              </button>
              <button
                onClick={() => {
                  setShowNextCountdown(false);
                  if (countdownInterval.current) clearInterval(countdownInterval.current);
                }}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio & Subtitle Modal Popover */}
      {showAudioSubModal && (
        <div
          id="audio-subtitle-menu"
          className="absolute bottom-24 right-8 z-40 bg-[#181818]/95 border border-neutral-700 rounded-xl p-4 shadow-2xl backdrop-blur-md w-80 text-sm text-neutral-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-2 gap-4">
            {/* Audio Section */}
            <div>
              <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-2 flex items-center space-x-1">
                <span>Áudio</span>
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar">
                {episode.audioTracks.length === 0 ? (
                  <div className="text-xs text-neutral-400">Áudio padrão</div>
                ) : (
                  episode.audioTracks.map((track) => (
                    <button
                      key={`aud-${track.index}`}
                      onClick={() => handleSelectAudio(track.index)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs truncate transition-colors ${
                        selectedAudioIndex === track.index
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'hover:bg-neutral-700 text-neutral-300'
                      }`}
                    >
                      {track.title || `Faixa ${track.index + 1}`}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Subtitle Section */}
            <div>
              <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-2 flex items-center space-x-1">
                <span>Legendas</span>
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar">
                <button
                  onClick={() => setSelectedSubtitleIndex(-1)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                    selectedSubtitleIndex === -1
                      ? 'bg-[#E50914] text-white font-semibold'
                      : 'hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  Desativadas
                </button>
                {episode.subtitleTracks.map((track, idx) => (
                  <button
                    key={`sub-${track.index}`}
                    onClick={() => setSelectedSubtitleIndex(idx)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs truncate transition-colors ${
                      selectedSubtitleIndex === idx
                        ? 'bg-[#E50914] text-white font-semibold'
                        : 'hover:bg-neutral-700 text-neutral-300'
                    }`}
                  >
                    {track.title || `Legenda ${idx + 1}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div
        id="player-bottom-bar"
        className={`absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col space-y-3 z-40 transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrub Bar */}
        <div
          ref={progressBarRef}
          id="player-scrub-bar"
          className="relative h-2 bg-neutral-700/80 hover:h-3 rounded-full cursor-pointer transition-all flex items-center"
          onMouseMove={handleProgressBarMouseMove}
          onMouseLeave={() => setHoverTime(null)}
          onClick={handleProgressBarClick}
        >
          {/* Filled Progress */}
          <div
            className="h-full bg-[#E50914] rounded-full relative flex items-center justify-end"
            style={{ width: `${progressPercent}%` }}
          >
            {/* Scrubber handle */}
            <div className="w-3.5 h-3.5 rounded-full bg-white shadow-md scale-0 hover:scale-100 group-hover:scale-100 transition-transform" />
          </div>

          {/* Hover Tooltip Time */}
          {hoverTime !== null && (
            <div
              className="absolute -top-8 px-2 py-1 bg-black/90 text-white text-xs font-mono rounded pointer-events-none transform -translate-x-1/2 shadow"
              style={{ left: `${hoverPosition}%` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Buttons Row */}
        <div className="flex items-center justify-between text-white">
          {/* Left Controls */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Play / Pause */}
            <button
              id="player-play-pause-btn"
              onClick={() => {
                if (videoRef.current?.paused) {
                  videoRef.current.play();
                } else {
                  videoRef.current?.pause();
                }
              }}
              className="p-1 text-white hover:text-red-500 transition-colors"
              title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
            </button>

            {/* Rewind 10s */}
            <button
              id="player-rewind-10-btn"
              onClick={() => handleSeek(currentTime - 10)}
              className="p-1 text-neutral-300 hover:text-white transition-colors"
              title="Voltar 10s (Seta Esquerda)"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            {/* Forward 10s */}
            <button
              id="player-forward-10-btn"
              onClick={() => handleSeek(currentTime + 10)}
              className="p-1 text-neutral-300 hover:text-white transition-colors"
              title="Avançar 10s (Seta Direita)"
            >
              <RotateCw className="w-5 h-5" />
            </button>

            {/* Next Episode Button */}
            {nextEpisode && onPlayNextEpisode && (
              <button
                id="player-next-ep-btn"
                onClick={onPlayNextEpisode}
                className="p-1 text-neutral-300 hover:text-white transition-colors"
                title={`Próximo Episódio: ${nextEpisode.title}`}
              >
                <SkipForward className="w-5 h-5" />
              </button>
            )}

            {/* Volume & Mute Slider */}
            <div className="flex items-center space-x-2 group/volume">
              <button
                onClick={toggleMute}
                className="p-1 text-neutral-300 hover:text-white transition-colors"
                title={isMuted ? 'Ativar Som (M)' : 'Silenciar (M)'}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-red-500" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  if (videoRef.current) {
                    videoRef.current.volume = val;
                    videoRef.current.muted = val === 0;
                  }
                  setIsMuted(val === 0);
                }}
                className="w-16 sm:w-24 h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-[#E50914]"
              />
            </div>

            {/* Time Indicator */}
            <div className="text-xs sm:text-sm font-mono text-neutral-300">
              <span>{formatTime(currentTime)}</span>
              <span className="mx-1 text-neutral-500">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Audio & Subtitles Selector */}
            <button
              id="player-audio-sub-btn"
              onClick={() => setShowAudioSubModal(!showAudioSubModal)}
              className={`p-1 transition-colors ${
                showAudioSubModal ? 'text-red-500' : 'text-neutral-300 hover:text-white'
              }`}
              title="Áudio e Legendas"
            >
              <Subtitles className="w-5 h-5" />
            </button>

            {/* Fullscreen */}
            <button
              id="player-fullscreen-btn"
              onClick={toggleFullscreen}
              className="p-1 text-neutral-300 hover:text-white transition-colors"
              title="Tela Cheia (F)"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
