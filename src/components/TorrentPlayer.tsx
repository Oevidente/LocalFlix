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
  Settings,
  AlertTriangle,
  Loader2,
  Radio,
  Users,
  Download,
  Upload,
  Cast as CastIcon,
  SkipForward,
  Check,
  Plus,
} from 'lucide-react';
import { TorrentStatus, TorrentFileItem } from '../types';
import { formatTime, formatBytes } from '../utils';
import {
  getCastContext,
  getCastErrorMessage,
  resolveCastBaseUrls,
  subscribeToCastAvailability,
} from '../cast';

interface TorrentPlayerProps {
  status: TorrentStatus;
  selectedFileIndex: number;
  onClose: () => void;
  onSelectFile?: (fileIndex: number) => void;
}

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function parseSubtitleTime(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
}

function parseSrtOrVtt(text: string): SubtitleCue[] {
  return text
    .replace(/^WEBVTT[^\n]*\n/i, '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n');
      const timingIndex = lines.findIndex((line) => line.includes('-->'));
      if (timingIndex < 0) return null;

      const [start, endWithSettings] = lines[timingIndex].split('-->');
      const end = endWithSettings.trim().split(/\s+/)[0];
      const cueText = lines
        .slice(timingIndex + 1)
        .join('\n')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (!cueText) return null;

      return {
        start: parseSubtitleTime(start),
        end: parseSubtitleTime(end),
        text: cueText,
      };
    })
    .filter((cue): cue is SubtitleCue => !!cue && cue.end > cue.start)
    .sort((a, b) => a.start - b.start);
}

export const TorrentPlayer: React.FC<TorrentPlayerProps> = ({
  status: initialStatus,
  selectedFileIndex: initialFileIdx,
  onClose,
  onSelectFile,
}) => {
  const [status, setStatus] = useState<TorrentStatus>(initialStatus);
  const [currentFileIdx, setCurrentFileIdx] = useState<number>(initialFileIdx);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [forceTranscode, setForceTranscode] = useState(false);

  // Subtitle state
  const [subtitles, setSubtitles] = useState<{ name: string; cues: SubtitleCue[] }[]>([]);
  const [selectedSubIdx, setSelectedSubIdx] = useState<number>(-1); // -1 = off
  const [subOffsetSeconds, setSubOffsetSeconds] = useState<number>(0);
  const [subSize, setSubSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [currentSubText, setCurrentSubText] = useState<string>('');

  // Cast state
  const [castAvailable, setCastAvailable] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [isCastLoading, setIsCastLoading] = useState(false);
  const [castDeviceName, setCastDeviceName] = useState<string | null>(null);
  const castSessionRef = useRef<any>(null);
  const castMediaRef = useRef<any>(null);
  const castStartTimeRef = useRef<number>(0);
  const castCurrentTimeRef = useRef<number>(0);
  const isConnectingCastRef = useRef<boolean>(false);
  const isDisconnectingCastRef = useRef<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const saveProgressTimer = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const videoFiles = status.files?.filter((f) => f.isVideo) || [];
  const currentFile = status.files?.find((f) => f.index === currentFileIdx) || videoFiles[0];

  // Poll torrent status for peers / download speed HUD
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/torrent/status/${status.infoHash}`);
        if (res.ok) {
          const updated: TorrentStatus = await res.json();
          setStatus(updated);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [status.infoHash]);

  // Handle user activity to show/hide controls
  const handleUserActivity = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
        setShowSubModal(false);
        setShowFileModal(false);
      }
    }, 3500);
  }, []);

  // Save watch progress
  const saveProgress = useCallback(
    (timeSec: number, totalDur?: number) => {
      if (timeSec < 0 || isNaN(timeSec)) return;
      try {
        fetch('/api/torrent/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            infoHash: status.infoHash,
            magnetUri: status.magnetUri,
            name: status.name,
            progressSeconds: Math.floor(timeSec),
            durationSeconds: Math.floor(totalDur || duration),
            selectedFileIndex: currentFileIdx,
            totalBytes: status.totalBytes,
          }),
        }).catch(() => {});
      } catch {}
    },
    [status.infoHash, status.magnetUri, status.name, status.totalBytes, duration, currentFileIdx]
  );

  // Periodic progress saving
  useEffect(() => {
    const timer = setInterval(() => {
      if (isPlaying && currentTime > 0) {
        saveProgress(currentTime, duration);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [isPlaying, currentTime, duration, saveProgress]);

  const restoreLocalFromCast = useCallback(() => {
    const resumePos = castCurrentTimeRef.current;
    if (videoRef.current && Number.isFinite(resumePos) && resumePos >= 0) {
      try {
        videoRef.current.currentTime = resumePos;
        setCurrentTime(resumePos);
      } catch {}
      videoRef.current.play().catch(() => {});
    }
    castMediaRef.current = null;
    castSessionRef.current = null;
    setIsCasting(false);
    setCastDeviceName(null);
  }, []);

  const disconnectCast = useCallback(async () => {
    if (isDisconnectingCastRef.current) return;
    isDisconnectingCastRef.current = true;
    setIsCastLoading(true);

    try {
      const context = getCastContext();
      const session = castSessionRef.current || context?.getCurrentSession?.();
      const remoteMedia = castMediaRef.current || session?.getMediaSession?.();
      const estimatedTime = remoteMedia?.getEstimatedTime?.();

      if (typeof estimatedTime === 'number' && Number.isFinite(estimatedTime)) {
        castCurrentTimeRef.current = estimatedTime;
        setCurrentTime(estimatedTime);
      }

      restoreLocalFromCast();

      try {
        if (typeof session?.endSession === 'function') {
          await session.endSession(true);
        } else if (typeof context?.endCurrentSession === 'function') {
          await context.endCurrentSession(true);
        }
      } catch {}
    } finally {
      setIsCastLoading(false);
      isDisconnectingCastRef.current = false;
    }
  }, [restoreLocalFromCast]);

  // Start Cast
  const handleStartCast = async () => {
    if (isCasting) {
      await disconnectCast();
      return;
    }

    const context = getCastContext();
    if (!context) return;
    setIsCastLoading(true);
    isConnectingCastRef.current = true;

    try {
      let session = context.getCurrentSession?.();
      if (!session) {
        await context.requestSession();
        session = context.getCurrentSession?.();
      }

      if (!session) {
        setIsCastLoading(false);
        isConnectingCastRef.current = false;
        return;
      }

      const video = videoRef.current;
      const pos = video ? video.currentTime : currentTime;

      // Lock local video immediately
      if (video && !video.paused) {
        try {
          video.pause();
        } catch {}
      }

      castSessionRef.current = session;
      castStartTimeRef.current = pos;
      castCurrentTimeRef.current = pos;
      const device = session.getCastDevice?.();
      setCastDeviceName(device?.friendlyName || 'Chromecast');
      setIsCasting(true);

      const castUrls = await resolveCastBaseUrls();
      const castBase = castUrls[0] || window.location.origin;
      const castMediaUrl = `${castBase}/api/torrent/stream/${status.infoHash}/${currentFileIdx}?cast=1`;

      const mediaInfo = new (window as any).chrome.cast.media.MediaInfo(castMediaUrl, 'video/mp4');
      mediaInfo.metadata = new (window as any).chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = currentFile?.name || status.name;
      mediaInfo.metadata.subtitle = 'CineLocal Torrent Stream';

      const request = new (window as any).chrome.cast.media.LoadRequest(mediaInfo);
      request.currentTime = pos;
      request.autoplay = true;

      await session.loadMedia(request);

      const remoteMedia = session.getMediaSession?.();
      if (remoteMedia) {
        castMediaRef.current = remoteMedia;
        const updateListener = () => {
          const estimated = remoteMedia.getEstimatedTime?.();
          if (typeof estimated === 'number' && Number.isFinite(estimated)) {
            castCurrentTimeRef.current = estimated;
            setCurrentTime(estimated);
          }
          if (remoteMedia.playerState === 'PLAYING' || remoteMedia.playerState === 'BUFFERING') {
            setIsPlaying(true);
          } else if (remoteMedia.playerState === 'PAUSED') {
            setIsPlaying(false);
          }
        };
        remoteMedia.addUpdateListener?.(updateListener);
      }
    } catch (err: any) {
      console.error('Erro ao transmitir para o Cast:', err);
      restoreLocalFromCast();
    } finally {
      setIsCastLoading(false);
      isConnectingCastRef.current = false;
    }
  };

  // Google Cast Listener
  useEffect(() => {
    let cleanupEvents = () => {};
    const unsubscribe = subscribeToCastAvailability((context) => {
      cleanupEvents();
      cleanupEvents = () => {};

      if (!context) {
        setCastAvailable(false);
        return;
      }
      setCastAvailable(true);
      const eventTypes = (window as any).cast?.framework?.CastContextEventType || {};

      const syncCast = () => {
        if (isDisconnectingCastRef.current) return;

        const session = context.getCurrentSession?.();
        if (session) {
          castSessionRef.current = session;
          const device = session.getCastDevice?.();
          setCastDeviceName(device?.friendlyName || 'Chromecast');
          const existingMedia = session.getMediaSession?.();
          if (existingMedia) {
            setIsCasting(true);
            castMediaRef.current = existingMedia;
            if (videoRef.current && !videoRef.current.paused) {
              videoRef.current.pause();
            }
          } else if (!isConnectingCastRef.current && !isCasting) {
            void handleStartCast();
          }
        } else if (isCasting) {
          restoreLocalFromCast();
        }
      };

      context.addEventListener?.(eventTypes.SESSION_STATE_CHANGED, syncCast);
      context.addEventListener?.(eventTypes.CAST_STATE_CHANGED, syncCast);
      cleanupEvents = () => {
        context.removeEventListener?.(eventTypes.SESSION_STATE_CHANGED, syncCast);
        context.removeEventListener?.(eventTypes.CAST_STATE_CHANGED, syncCast);
      };
      syncCast();
    });

    return () => {
      unsubscribe();
      cleanupEvents();
    };
  }, [currentFileIdx, isCasting, restoreLocalFromCast]);

  // Set stream source
  const streamUrl = `/api/torrent/stream/${status.infoHash}/${currentFileIdx}${forceTranscode ? '?transcode=1' : ''}`;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'arrowright':
          e.preventDefault();
          seekBy(10);
          break;
        case 'arrowup':
          e.preventDefault();
          changeVolume(0.1);
          break;
        case 'arrowdown':
          e.preventDefault();
          changeVolume(-0.1);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'escape':
          if (isFullscreen) {
            document.exitFullscreen?.().catch(() => {});
          } else {
            handleClose();
          }
          break;
      }
      handleUserActivity();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, duration, volume, isMuted, isFullscreen]);

  // Fullscreen sync
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.max(0, Math.min(video.currentTime + seconds, duration || video.duration || 0));
    video.currentTime = target;
    setCurrentTime(target);
  };

  const changeVolume = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newVol = Math.max(0, Math.min(1, volume + delta));
    video.volume = newVol;
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
      video.muted = false;
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  const handleClose = () => {
    if (videoRef.current) {
      saveProgress(videoRef.current.currentTime, videoRef.current.duration);
      videoRef.current.pause();
    }
    onClose();
  };

  // Subtitle sync calculation
  useEffect(() => {
    if (selectedSubIdx < 0 || !subtitles[selectedSubIdx]) {
      setCurrentSubText('');
      return;
    }

    const currentSub = subtitles[selectedSubIdx];
    const adjustedTime = currentTime - subOffsetSeconds;
    const activeCue = currentSub.cues.find(
      (cue) => adjustedTime >= cue.start && adjustedTime <= cue.end
    );

    setCurrentSubText(activeCue ? activeCue.text : '');
  }, [currentTime, selectedSubIdx, subtitles, subOffsetSeconds]);

  // Subtitle file import
  const handleSubtitleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const cues = parseSrtOrVtt(text);
        if (cues.length > 0) {
          const newSub = { name: file.name, cues };
          setSubtitles((prev) => [...prev, newSub]);
          setSelectedSubIdx(subtitles.length);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Drag and drop subtitle support
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (['.srt', '.vtt', '.ass', '.ssa'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          const cues = parseSrtOrVtt(text);
          if (cues.length > 0) {
            setSubtitles((prev) => [...prev, { name: file.name, cues }]);
            setSelectedSubIdx(subtitles.length);
          }
        }
      };
      reader.readAsText(file);
    }
  };

  const handleNextVideo = () => {
    const currentIdxInVideos = videoFiles.findIndex((f) => f.index === currentFileIdx);
    if (currentIdxInVideos >= 0 && currentIdxInVideos < videoFiles.length - 1) {
      const nextFile = videoFiles[currentIdxInVideos + 1];
      setCurrentFileIdx(nextFile.index);
      if (onSelectFile) onSelectFile(nextFile.index);
    }
  };

  const hasNextVideo = () => {
    const currentIdxInVideos = videoFiles.findIndex((f) => f.index === currentFileIdx);
    return currentIdxInVideos >= 0 && currentIdxInVideos < videoFiles.length - 1;
  };

  const subFontSize = {
    small: 'clamp(1.2rem, 1.4vw, 2.2rem)',
    medium: 'clamp(1.6rem, 2vw, 3.2rem)',
    large: 'clamp(2rem, 2.6vw, 4.2rem)',
  }[subSize];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleUserActivity}
      onClick={handleUserActivity}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden"
    >
      {/* Native Video Element */}
      <video
        ref={videoRef}
        src={streamUrl}
        playsInline
        autoPlay
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
          }
        }}
        onDurationChange={() => {
          if (videoRef.current && videoRef.current.duration > 0) {
            setDuration(videoRef.current.duration);
          }
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onError={() => {
          console.warn('[TorrentPlayer] Erro no stream nativo. Ativando transcode...');
          setForceTranscode(true);
        }}
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Subtitle Overlay */}
      {currentSubText && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 pointer-events-none text-center px-4 max-w-[85%] z-20 transition-all duration-300 ${
            controlsVisible ? 'bottom-28' : 'bottom-12'
          }`}
        >
          <span
            style={{
              fontSize: subFontSize,
              lineHeight: 1.3,
              textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 4px #000, 0 0 10px #000',
            }}
            className="font-semibold text-amber-200 tracking-wide bg-black/40 px-3 py-1 rounded-lg backdrop-blur-[2px]"
          >
            {currentSubText}
          </span>
        </div>
      )}

      {/* Buffering HUD overlay */}
      {isBuffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none z-10 space-y-3">
          <div className="w-16 h-16 rounded-full border-4 border-red-600/30 border-t-red-600 animate-spin flex items-center justify-center">
            <Radio className="w-6 h-6 text-red-500 animate-pulse" />
          </div>
          <div className="text-center bg-black/70 px-4 py-2 rounded-xl backdrop-blur-md border border-zinc-800">
            <p className="text-sm font-semibold text-white">Carregando buffer do Torrent...</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {status.peers} peers • {formatBytes(status.downloadSpeed)}/s
            </p>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between p-6 bg-gradient-to-t from-black/90 via-transparent to-black/80 transition-opacity duration-300 pointer-events-none ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={handleClose}
              className="p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white border border-zinc-700/50 shadow-lg transition"
              title="Voltar (Esc)"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white">
                  Torrent
                </span>
                <h1 className="text-base font-bold text-white line-clamp-1">{status.name}</h1>
              </div>
              {currentFile && (
                <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                  {currentFile.name} ({formatBytes(currentFile.length)})
                </p>
              )}
            </div>
          </div>

          {/* Torrent Real-time HUD badge */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-3 bg-zinc-900/90 border border-zinc-700/60 px-3.5 py-1.5 rounded-xl text-xs text-zinc-300 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-1.5" title="Peers conectados">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                <span className="font-medium">{status.peers}</span>
              </div>
              <div className="w-px h-3 bg-zinc-700" />
              <div className="flex items-center gap-1.5" title="Velocidade de download">
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-medium">{formatBytes(status.downloadSpeed)}/s</span>
              </div>
              <div className="w-px h-3 bg-zinc-700" />
              <div className="flex items-center gap-1.5" title="Baixado">
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium">{status.progress}%</span>
              </div>
            </div>

            {/* Cast Button */}
            {castAvailable && (
              <button
                onClick={handleStartCast}
                disabled={isCastLoading}
                className={`p-2.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                  isCasting
                    ? 'bg-amber-600 border-amber-500 text-white'
                    : 'bg-zinc-900/80 border-zinc-700 hover:bg-zinc-800 text-zinc-300'
                }`}
                title={isCasting ? `Transmitindo para ${castDeviceName || 'Chromecast'} (Clique para desconectar)` : 'Transmitir para Chromecast / Google Cast'}
              >
                {isCastLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <CastIcon className="w-4 h-4" />
                )}
                <span>
                  {isCastLoading
                    ? isCasting
                      ? 'Desconectando...'
                      : 'Conectando...'
                    : isCasting
                      ? castDeviceName || 'Casting'
                      : 'Cast'}
                </span>
              </button>
            )}

            {/* Multi-file selector modal trigger */}
            {videoFiles.length > 1 && (
              <button
                onClick={() => setShowFileModal((v) => !v)}
                className="px-3 py-2 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-xs font-medium text-white rounded-xl transition"
              >
                Episódios ({videoFiles.length})
              </button>
            )}
          </div>
        </div>

        {/* Center Big Play/Pause Toggle Indicator */}
        <div className="self-center flex items-center justify-center">
          {/* Subtle click area */}
        </div>

        {/* Bottom Control Bar */}
        <div className="space-y-3 pointer-events-auto">
          {/* Progress / Scrub Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-zinc-400 tabular-nums w-12 text-right">
              {formatTime(currentTime)}
            </span>

            <div className="relative flex-1 group py-2 cursor-pointer">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={(e) => {
                  const target = parseFloat(e.target.value);
                  setCurrentTime(target);
                  if (videoRef.current) {
                    videoRef.current.currentTime = target;
                  }
                }}
                className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-red-600 focus:outline-none group-hover:h-2 transition-all"
              />
            </div>

            <span className="text-xs font-medium text-zinc-400 tabular-nums w-12">
              {formatTime(duration)}
            </span>
          </div>

          {/* Buttons Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="p-3 bg-white text-black hover:bg-zinc-200 rounded-full shadow-lg transition"
                title="Reproduzir/Pausar (Espaço)"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              {/* Seek -10s */}
              <button
                onClick={() => seekBy(-10)}
                className="p-2 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800/60 transition"
                title="Voltar 10s (Seta Esquerda)"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              {/* Seek +10s */}
              <button
                onClick={() => seekBy(10)}
                className="p-2 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800/60 transition"
                title="Avançar 10s (Seta Direita)"
              >
                <RotateCw className="w-5 h-5" />
              </button>

              {/* Next Video button if series */}
              {hasNextVideo() && (
                <button
                  onClick={handleNextVideo}
                  className="p-2 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800/60 transition flex items-center gap-1 text-xs"
                  title="Próximo Episódio"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              )}

              {/* Volume Slider */}
              <div className="flex items-center gap-2 group/vol ml-2">
                <button
                  onClick={toggleMute}
                  className="p-2 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800/60 transition"
                  title="Silenciar (M)"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const nextV = parseFloat(e.target.value);
                    setVolume(nextV);
                    setIsMuted(nextV === 0);
                    if (videoRef.current) {
                      videoRef.current.volume = nextV;
                      videoRef.current.muted = nextV === 0;
                    }
                  }}
                  className="w-16 h-1 bg-zinc-700 rounded-full appearance-none accent-white cursor-pointer group-hover/vol:w-24 transition-all"
                />
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-3">
              {/* Subtitles Button & Popover */}
              <div className="relative">
                <button
                  onClick={() => setShowSubModal((v) => !v)}
                  className={`p-2 rounded-lg border transition ${
                    selectedSubIdx >= 0
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'text-zinc-300 hover:text-white border-zinc-700 hover:bg-zinc-800/60'
                  }`}
                  title="Legendas e Áudio"
                >
                  <Subtitles className="w-5 h-5" />
                </button>

                {showSubModal && (
                  <div className="absolute right-0 bottom-12 w-72 bg-zinc-950/95 border border-zinc-800 rounded-2xl p-4 shadow-2xl backdrop-blur-md space-y-4 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Legendas</h4>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-[10px] font-semibold text-white rounded-lg flex items-center gap-1 transition"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Carregar .srt</span>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".srt,.vtt,.ass,.ssa"
                        onChange={handleSubtitleFileUpload}
                        className="hidden"
                      />
                    </div>

                    {/* Subtitle track list */}
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      <button
                        onClick={() => setSelectedSubIdx(-1)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition ${
                          selectedSubIdx === -1
                            ? 'bg-zinc-800 text-white font-medium'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                        }`}
                      >
                        <span>Desativada</span>
                        {selectedSubIdx === -1 && <Check className="w-3.5 h-3.5 text-red-500" />}
                      </button>

                      {subtitles.map((sub, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedSubIdx(idx)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition ${
                            selectedSubIdx === idx
                              ? 'bg-zinc-800 text-white font-medium'
                              : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                          }`}
                        >
                          <span className="truncate pr-2">{sub.name}</span>
                          {selectedSubIdx === idx && <Check className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>

                    {/* Subtitle Size Adjuster */}
                    {selectedSubIdx >= 0 && (
                      <div className="pt-2 border-t border-zinc-800 space-y-2">
                        <label className="text-[11px] text-zinc-400">Tamanho da Legenda:</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['small', 'medium', 'large'] as const).map((size) => (
                            <button
                              key={size}
                              onClick={() => setSubSize(size)}
                              className={`py-1 text-[10px] rounded-md font-medium capitalize transition ${
                                subSize === size
                                  ? 'bg-red-600 text-white'
                                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                              }`}
                            >
                              {size === 'small' ? 'Pequena' : size === 'medium' ? 'Média' : 'Grande'}
                            </button>
                          ))}
                        </div>

                        {/* Timing sync offset */}
                        <div className="pt-2 space-y-1">
                          <div className="flex justify-between text-[11px] text-zinc-400">
                            <span>Sincronia:</span>
                            <span className="font-mono text-zinc-300">{subOffsetSeconds.toFixed(1)}s</span>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setSubOffsetSeconds((v) => v - 0.5)}
                              className="flex-1 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs rounded"
                            >
                              -0.5s
                            </button>
                            <button
                              onClick={() => setSubOffsetSeconds(0)}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs rounded"
                            >
                              Reset
                            </button>
                            <button
                              onClick={() => setSubOffsetSeconds((v) => v + 0.5)}
                              className="flex-1 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs rounded"
                            >
                              +0.5s
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="p-2 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800/60 transition"
                title="Tela Cheia (F)"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Episode / Multi-file Selector Drawer Modal */}
      {showFileModal && (
        <div className="absolute right-6 top-20 w-80 bg-zinc-950/95 border border-zinc-800 rounded-2xl p-4 shadow-2xl backdrop-blur-md z-30 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Arquivos de Vídeo ({videoFiles.length})
            </h3>
            <button
              onClick={() => setShowFileModal(false)}
              className="text-zinc-400 hover:text-white text-xs"
            >
              Fechar
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {videoFiles.map((file) => {
              const isSelected = file.index === currentFileIdx;
              return (
                <button
                  key={file.index}
                  onClick={() => {
                    setCurrentFileIdx(file.index);
                    if (onSelectFile) onSelectFile(file.index);
                    setShowFileModal(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between transition ${
                    isSelected
                      ? 'bg-red-600 text-white font-medium shadow-md shadow-red-950/50'
                      : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-300'
                  }`}
                >
                  <span className="truncate pr-2">{file.name}</span>
                  <span className="text-[10px] opacity-70 flex-shrink-0">{formatBytes(file.length)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
