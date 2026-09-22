import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
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
  SkipBack,
  Settings,
  AlertTriangle,
  Loader2,
  Download,
} from 'lucide-react';
import { MediaItem, Episode, AudioTrackInfo, SubtitleTrackInfo } from '../types';
import { formatTime } from '../utils';

interface VideoPlayerProps {
  media: MediaItem;
  episode: Episode;
  onClose: () => void;
  onPlayNextEpisode?: () => void;
  nextEpisode?: Episode;
  onPlayPrevEpisode?: () => void;
  prevEpisode?: Episode;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  media,
  episode,
  onClose,
  onPlayNextEpisode,
  nextEpisode,
  onPlayPrevEpisode,
  prevEpisode,
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
  const [isInstallingFfmpeg, setIsInstallingFfmpeg] = useState<boolean>(false);
  const [installFfmpegMsg, setInstallFfmpegMsg] = useState<string | null>(null);

  const hlsRef = useRef<Hls | null>(null);
  const isDirectMP4 = episode.extension === '.mp4' || episode.extension === '.webm';

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

  // Initialize playback (HLS engine for MKV/transcoded, native HTTP Range 206 for MP4/WebM)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const initialSeek =
      episode.progressSeconds > 10 && !episode.watched ? episode.progressSeconds : 0;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const shouldUseHls = !isDirectMP4 || isForceTranscode || selectedAudioIndex > 0;

    if (shouldUseHls) {
      const hlsUrl = `/api/media/${media.id}/episode/${episode.id}/hls/master.m3u8?audio=${selectedAudioIndex}${
        isForceTranscode ? '&transcode=1' : ''
      }`;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          backBufferLength: 60,
          manifestLoadingTimeOut: 15000,
          levelLoadingTimeOut: 15000,
        });
        hlsRef.current = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (initialSeek > 0) {
            try {
              video.currentTime = initialSeek;
            } catch {}
          }
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
          if (data.details.totalduration && isFinite(data.details.totalduration)) {
            if (data.details.live) {
              if (!episode.durationSeconds || episode.durationSeconds <= 0) {
                setDuration((prev) => Math.max(prev, data.details.totalduration));
              }
            } else if (data.details.totalduration > 0) {
              setDuration(data.details.totalduration);
            }
          }
        });

        let networkErrorCount = 0;
        hls.on(Hls.Events.ERROR, async (_event, data) => {
          if (data.fatal) {
            console.warn('[HLS] Fatal error:', data);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                networkErrorCount++;
                if (data.response?.code === 500 || networkErrorCount > 2) {
                  hls.destroy();
                  try {
                    const res = await fetch('/api/system/status');
                    const sys = await res.json();
                    if (!sys.ffmpegFound) {
                      setPlaybackError(
                        'O FFmpeg não foi encontrado no seu computador. Para reproduzir arquivos .MKV ou com múltiplos áudios, coloque o arquivo "ffmpeg.exe" dentro da pasta "bin" do aplicativo ou instale o FFmpeg no Windows.'
                      );
                      return;
                    }
                  } catch {}
                  setPlaybackError(
                    'Não foi possível inicializar o motor de reprodução do vídeo. Verifique se o arquivo existe e se o FFmpeg está instalado.'
                  );
                } else {
                  hls.startLoad();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                if (!isForceTranscode) {
                  setIsForceTranscode(true);
                } else {
                  setPlaybackError('Não foi possível continuar a reprodução deste arquivo MKV.');
                }
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        const onLoaded = () => {
          if (initialSeek > 0) video.currentTime = initialSeek;
          video.play().catch(() => {});
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
      }
    } else {
      // Direct native MP4 / WebM
      const directUrl = `/api/media/${media.id}/episode/${episode.id}/stream`;
      video.src = directUrl;
      const onLoaded = () => {
        if (video.duration && isFinite(video.duration)) {
          setDuration(video.duration);
        }
        if (initialSeek > 0) {
          video.currentTime = initialSeek;
        }
        video.play().catch(() => {});
      };
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [media.id, episode.id, isDirectMP4, isForceTranscode, selectedAudioIndex]);

  // Periodic progress saving (every 5 seconds)
  useEffect(() => {
    progressSaveTimer.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        saveProgress(videoRef.current.currentTime);
      }
    }, 5000);

    return () => {
      if (progressSaveTimer.current) clearInterval(progressSaveTimer.current);
    };
  }, [saveProgress]);

  // Save on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (videoRef.current) {
        saveProgress(videoRef.current.currentTime);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [saveProgress]);

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
    if (video) {
      saveProgress(video.currentTime);
    }
  };

  // Handle seeking
  const handleSeek = (targetSec: number) => {
    const video = videoRef.current;
    if (!video) return;

    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    setShowNextCountdown(false);

    isSeekingRef.current = true;
    const clampedSec = Math.max(0, Math.min(targetSec, duration > 0 ? duration : targetSec));

    try {
      video.currentTime = clampedSec;
    } catch (err) {
      console.warn('Seek error on video:', err);
    }
    setCurrentTime(clampedSec);
    saveProgress(clampedSec, duration, false, false);

    setTimeout(() => {
      isSeekingRef.current = false;
    }, 600);
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
            video.play().catch(() => {});
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
        case 'p':
          if (e.shiftKey && prevEpisode && onPlayPrevEpisode) {
            e.preventDefault();
            onPlayPrevEpisode();
          }
          break;
        case 'n':
          if (e.shiftKey && nextEpisode && onPlayNextEpisode) {
            e.preventDefault();
            onPlayNextEpisode();
          }
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

    const exact = video.currentTime;
    setCurrentTime(exact);

    if (video.duration && !isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
      if (!episode.durationSeconds || episode.durationSeconds <= 0) {
        setDuration((prev) => Math.max(prev, video.duration));
      }
    }

    const totalDur = (episode.durationSeconds && episode.durationSeconds > 0) ? episode.durationSeconds : duration;

    // Reset countdown if user moved back before the final 15 seconds
    if (showNextCountdown && totalDur > 30 && exact < totalDur - 15) {
      setShowNextCountdown(false);
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
    }

    // Auto next episode countdown if within 15 seconds of completion
    if (nextEpisode && totalDur > 30 && exact >= totalDur - 15 && !showNextCountdown) {
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

  // Automatic Stream Recovery
  const handleStreamRecovery = useCallback(
    (enableTranscode = true) => {
      if (isRecovering) return;
      setIsRecovering(true);

      if (enableTranscode) {
        setIsForceTranscode(true);
      }

      setTimeout(() => {
        setIsRecovering(false);
      }, 800);
    },
    [isRecovering]
  );

  const handleEnded = () => {
    if (isSeekingRef.current) return;
    const video = videoRef.current;
    const exact = video?.currentTime || currentTime;
    const totalExpectedDuration = (episode.durationSeconds && episode.durationSeconds > 0) ? episode.durationSeconds : duration;

    const isActuallyFinished =
      totalExpectedDuration > 30 && isFinite(totalExpectedDuration)
        ? exact >= Math.max(totalExpectedDuration - 20, totalExpectedDuration * 0.9)
        : false;

    if (isActuallyFinished) {
      setIsPlaying(false);
      saveProgress(totalExpectedDuration, totalExpectedDuration, true, true);
      if (nextEpisode && onPlayNextEpisode) {
        onPlayNextEpisode();
      }
    } else {
      console.warn('[VideoPlayer] Playback ended prematurely at', exact, 'of', totalExpectedDuration);
      handleStreamRecovery(true);
    }
  };

  const handleVideoError = () => {
    if (isSeekingRef.current || isRecovering) return;
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
      {/* HTML5 Video Element with HLS / Native streaming */}
      <video
        ref={videoRef}
        id="html5-video-player"
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
          saveProgress(videoRef.current?.currentTime || 0, duration, false, true);
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
          className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center z-50 p-6 text-center"
        >
          <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-4 text-red-400">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Falha na Reprodução</h3>
          <p className="text-neutral-300 text-sm max-w-lg mb-6 leading-relaxed">{playbackError}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mb-4">
            {playbackError.toLowerCase().includes('ffmpeg') && (
              <button
                id="player-install-ffmpeg-btn"
                type="button"
                disabled={isInstallingFfmpeg}
                onClick={async () => {
                  setIsInstallingFfmpeg(true);
                  setInstallFfmpegMsg(null);
                  try {
                    const res = await fetch('/api/system/install-ffmpeg', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                      setInstallFfmpegMsg('FFmpeg instalado! Reiniciando reprodução...');
                      setTimeout(() => {
                        setPlaybackError(null);
                        setInstallFfmpegMsg(null);
                        handleStreamRecovery(true);
                      }, 1500);
                    } else {
                      setInstallFfmpegMsg(data.message || 'Não foi possível baixar automaticamente. Baixe o ffmpeg.exe e coloque na pasta bin.');
                    }
                  } catch {
                    setInstallFfmpegMsg('Erro ao contatar o servidor.');
                  } finally {
                    setIsInstallingFfmpeg(false);
                  }
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-700 text-white font-medium text-sm transition-colors shadow-lg flex items-center justify-center space-x-2"
              >
                {isInstallingFfmpeg ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Instalando FFmpeg na pasta bin...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Instalar FFmpeg (1 Clique)</span>
                  </>
                )}
              </button>
            )}

            <button
              id="player-retry-transcode-btn"
              onClick={() => {
                setPlaybackError(null);
                setInstallFfmpegMsg(null);
                handleStreamRecovery(true);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors shadow-lg"
            >
              Tentar Novamente
            </button>
            <button
              id="player-close-error-btn"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-sm transition-colors"
            >
              Voltar
            </button>
          </div>

          {installFfmpegMsg && (
            <p className={`text-xs mt-2 font-medium ${installFfmpegMsg.includes('sucesso') || installFfmpegMsg.includes('instalado') ? 'text-emerald-400' : 'text-amber-400'}`}>
              {installFfmpegMsg}
            </p>
          )}
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
            {/* Previous Episode Button (shown when not the first episode) */}
            {prevEpisode && onPlayPrevEpisode && (
              <button
                id="player-prev-ep-btn"
                onClick={onPlayPrevEpisode}
                className="p-1 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                title={`Episódio Anterior: ${prevEpisode.title} (Shift + P)`}
              >
                <SkipBack className="w-5 h-5" />
              </button>
            )}

            {/* Play / Pause */}
            <button
              id="player-play-pause-btn"
              onClick={() => {
                if (videoRef.current?.paused) {
                  videoRef.current.play().catch(() => {});
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
