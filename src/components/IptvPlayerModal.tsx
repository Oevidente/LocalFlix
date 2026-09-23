import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Radio,
  Tv,
  Star,
  ChevronLeft,
  ChevronRight,
  List,
  RefreshCw,
  AlertCircle,
  Shield,
  Layers,
  Search,
  Cast,
} from 'lucide-react';
import { IptvChannel } from '../types';

interface IptvPlayerModalProps {
  channel: IptvChannel;
  allChannels: IptvChannel[];
  favorites: string[];
  onToggleFavorite: (channelId: string) => void;
  onSelectChannel: (channel: IptvChannel) => void;
  onClose: () => void;
}

export const IptvPlayerModal: React.FC<IptvPlayerModalProps> = ({
  channel,
  allChannels,
  favorites,
  onToggleFavorite,
  onSelectChannel,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useProxy, setUseProxy] = useState<boolean>(false);
  const [showChannelList, setShowChannelList] = useState<boolean>(false);
  const [channelSearch, setChannelSearch] = useState<string>('');
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isFavorite = favorites.includes(channel.id);

  // Determine current channel index in the list for next/prev zapping
  const currentIndex = allChannels.findIndex((c) => c.id === channel.id);

  const handlePrevChannel = () => {
    if (currentIndex > 0) {
      onSelectChannel(allChannels[currentIndex - 1]);
    } else if (allChannels.length > 0) {
      onSelectChannel(allChannels[allChannels.length - 1]);
    }
  };

  const handleNextChannel = () => {
    if (currentIndex >= 0 && currentIndex < allChannels.length - 1) {
      onSelectChannel(allChannels[currentIndex + 1]);
    } else if (allChannels.length > 0) {
      onSelectChannel(allChannels[0]);
    }
  };

  // Build stream URL (direct or proxy)
  const getStreamUrl = useCallback(
    (rawUrl: string, proxy: boolean) => {
      if (proxy) {
        let proxyUrl = `/api/iptv/proxy?url=${encodeURIComponent(rawUrl)}`;
        if (channel.httpUserAgent) {
          proxyUrl += `&userAgent=${encodeURIComponent(channel.httpUserAgent)}`;
        }
        if (channel.httpReferrer) {
          proxyUrl += `&referrer=${encodeURIComponent(channel.httpReferrer)}`;
        }
        return proxyUrl;
      }
      return rawUrl;
    },
    [channel]
  );

  // Setup stream playback
  const loadStream = useCallback(
    (streamUrl: string) => {
      setIsLoading(true);
      setErrorMsg(null);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const video = videoRef.current;
      if (!video) return;

      const effectiveUrl = getStreamUrl(streamUrl, useProxy);

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 60,
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 3,
          levelLoadingTimeOut: 15000,
          fragLoadingTimeOut: 20000,
        });

        hls.loadSource(effectiveUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          video.play().catch(() => {
            setIsPlaying(false);
          });
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.warn('[HLS.js Live] Erro:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (!useProxy) {
                  console.log('Falha na conexão direta, tentando via Proxy CORS...');
                  setUseProxy(true);
                } else {
                  setErrorMsg('Sinal do canal indisponível no momento ou bloqueado geograficamente.');
                  setIsLoading(false);
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setErrorMsg('Erro na reprodução deste canal.');
                setIsLoading(false);
                break;
            }
          }
        });

        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari / iOS HLS
        video.src = effectiveUrl;
        video.play().catch(() => setIsPlaying(false));
      } else {
        video.src = effectiveUrl;
        video.play().catch(() => setIsPlaying(false));
      }
    },
    [getStreamUrl, useProxy]
  );

  useEffect(() => {
    loadStream(channel.url);

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel, useProxy, loadStream]);

  // Handle controls auto-hide
  const handleMouseMove = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showChannelList) {
        setControlsVisible(false);
      }
    }, 4000);
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showChannelList) {
          setShowChannelList(false);
        } else {
          onClose();
        }
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevChannel();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNextChannel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showChannelList, isPlaying, isMuted, currentIndex, allChannels]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch((err) => console.error(err));
      setIsFullscreen(false);
    }
  };

  const filteredChannelList = allChannels.filter(
    (c) =>
      c.name.toLowerCase().includes(channelSearch.toLowerCase()) ||
      c.group.toLowerCase().includes(channelSearch.toLowerCase())
  );

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center select-none overflow-hidden"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => {
          setIsLoading(false);
          setErrorMsg(null);
        }}
        playsInline
      />

      {/* Loading Spinner */}
      {isLoading && !errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs pointer-events-none z-20">
          <div className="w-16 h-16 border-4 border-[#E50914] border-t-transparent rounded-full animate-spin mb-4 shadow-lg shadow-red-950/50"></div>
          <div className="flex items-center space-x-2 text-white font-medium text-lg">
            <Radio className="w-5 h-5 text-red-500 animate-pulse" />
            <span>Sintonizando {channel.name}...</span>
          </div>
          <span className="text-neutral-400 text-xs mt-1">Conectando ao sinal ao vivo</span>
        </div>
      )}

      {/* Error Overlay */}
      {errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md z-25 p-6 text-center max-w-lg mx-auto">
          <AlertCircle className="w-16 h-16 text-amber-500 mb-4 animate-bounce" />
          <h3 className="text-xl font-bold text-white mb-2">Canal Temporariamente Indisponível</h3>
          <p className="text-neutral-300 text-sm mb-6 leading-relaxed">{errorMsg}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setUseProxy(!useProxy);
                loadStream(channel.url);
              }}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-400 rounded-lg text-sm font-semibold flex items-center space-x-2 border border-zinc-700 transition-all cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              <span>{useProxy ? 'Tentar Conexão Direta' : 'Ativar Modo Proxy Seguro'}</span>
            </button>
            <button
              onClick={() => loadStream(channel.url)}
              className="px-4 py-2 bg-[#E50914] hover:bg-[#b80710] text-white rounded-lg text-sm font-semibold flex items-center space-x-2 shadow-lg transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tentar Novamente</span>
            </button>
            <button
              onClick={handleNextChannel}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-sm font-semibold transition-all cursor-pointer"
            >
              Próximo Canal &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Header Overlay */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between transition-opacity duration-300 z-30 ${
          controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center space-x-3 sm:space-x-4">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-black/60 hover:bg-white/20 text-neutral-300 hover:text-white transition-all cursor-pointer"
            title="Fechar (Esc)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Logo & Channel Info */}
          <div className="flex items-center space-x-3">
            {channel.logo ? (
              <img
                src={channel.logo}
                alt={channel.name}
                className="w-10 h-10 sm:w-12 sm:h-12 object-contain bg-neutral-900/80 rounded-lg p-1 border border-neutral-800 shrink-0"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-red-950/60 border border-red-900/40 flex items-center justify-center shrink-0">
                <Tv className="w-6 h-6 text-red-400" />
              </div>
            )}

            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-white text-base sm:text-lg font-bold truncate max-w-[200px] sm:max-w-md">
                  {channel.name}
                </h1>
                <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-red-600/90 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                  <span>AO VIVO</span>
                </span>
                {channel.resolution && (
                  <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 text-[10px] font-mono font-bold">
                    {channel.resolution}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 text-xs text-neutral-400 mt-0.5">
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 text-[11px]">
                  {channel.group}
                </span>
                {channel.country && <span>🏳️ {channel.country}</span>}
                {useProxy && (
                  <span className="text-emerald-400 font-mono text-[10px] flex items-center">
                    <Shield className="w-3 h-3 mr-0.5 inline" /> Proxy Ativo
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Top Right Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => onToggleFavorite(channel.id)}
            className={`p-2.5 rounded-full transition-all cursor-pointer ${
              isFavorite
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-black/60 hover:bg-white/20 text-neutral-300 hover:text-white'
            }`}
            title={isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
          >
            <Star className={`w-5 h-5 ${isFavorite ? 'fill-amber-400' : ''}`} />
          </button>

          <button
            onClick={() => setShowChannelList(!showChannelList)}
            className={`p-2.5 rounded-full transition-all cursor-pointer flex items-center space-x-1.5 ${
              showChannelList
                ? 'bg-[#E50914] text-white'
                : 'bg-black/60 hover:bg-white/20 text-neutral-300 hover:text-white'
            }`}
            title="Guia de Canais (Zapping)"
          >
            <List className="w-5 h-5" />
            <span className="text-xs font-semibold hidden md:inline">Guia de Canais</span>
          </button>

          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-black/60 hover:bg-red-600/80 text-neutral-300 hover:text-white transition-all cursor-pointer"
            title="Fechar Player"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-center justify-between transition-opacity duration-300 z-30 ${
          controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Left: Play/Pause, Prev/Next Channel, Volume */}
        <div className="flex items-center space-x-3 sm:space-x-5">
          <button
            onClick={togglePlay}
            className="p-2.5 sm:p-3 rounded-full bg-white text-black hover:bg-neutral-200 transition-all shadow-lg active:scale-95 cursor-pointer"
            title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          {/* Zapping Prev / Next Buttons */}
          <div className="flex items-center space-x-1 bg-black/50 border border-neutral-800 rounded-lg p-1">
            <button
              onClick={handlePrevChannel}
              className="p-2 rounded hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Canal Anterior (Seta Cima)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono text-neutral-400 px-1 hidden sm:inline">
              {currentIndex + 1} / {allChannels.length}
            </span>
            <button
              onClick={handleNextChannel}
              className="p-2 rounded hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Próximo Canal (Seta Baixo)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Volume Slider */}
          <div className="flex items-center space-x-2 group">
            <button
              onClick={toggleMute}
              className="p-2 text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Mudo (M)"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 sm:w-24 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#E50914]"
            />
          </div>
        </div>

        {/* Right Controls: Proxy Switcher, Fullscreen */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setUseProxy(!useProxy);
              loadStream(channel.url);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-all border cursor-pointer ${
              useProxy
                ? 'bg-emerald-950/60 border-emerald-700 text-emerald-400'
                : 'bg-black/60 border-neutral-700 text-neutral-300 hover:text-white hover:bg-white/10'
            }`}
            title="Alternar entre modo de conexão Direto ou Proxy Anti-CORS"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{useProxy ? 'Proxy Anti-CORS Ativado' : 'Conexão Direta'}</span>
            <span className="sm:hidden">{useProxy ? 'Proxy' : 'Direto'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-full bg-black/60 hover:bg-white/20 text-neutral-300 hover:text-white transition-all cursor-pointer"
            title="Tela Cheia (F)"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Side Channel Zapping Drawer (EPG / List style) */}
      {showChannelList && (
        <div className="absolute top-0 right-0 bottom-0 w-80 sm:w-96 bg-[#141414]/95 backdrop-blur-xl border-l border-neutral-800 z-40 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <List className="w-5 h-5 text-[#E50914]" />
              <h2 className="text-white font-bold text-sm sm:text-base">Guia de Canais</h2>
            </div>
            <button
              onClick={() => setShowChannelList(false)}
              className="p-1 text-neutral-400 hover:text-white rounded-md hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick search input in drawer */}
          <div className="p-3 border-b border-neutral-800">
            <div className="flex items-center bg-black/60 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white">
              <Search className="w-3.5 h-3.5 text-neutral-400 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Buscar canal..."
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                className="bg-transparent border-none focus:outline-none w-full text-white placeholder-neutral-500"
              />
              {channelSearch && (
                <button onClick={() => setChannelSearch('')} className="text-neutral-400 hover:text-white text-xs">
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Channels list scroll */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-900/80 p-2 space-y-1">
            {filteredChannelList.length === 0 ? (
              <div className="text-center py-10 text-neutral-500 text-xs">Nenhum canal encontrado</div>
            ) : (
              filteredChannelList.map((ch) => {
                const isSelected = ch.id === channel.id;
                const isFav = favorites.includes(ch.id);
                return (
                  <div
                    key={ch.id}
                    onClick={() => {
                      onSelectChannel(ch);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#E50914]/20 border border-[#E50914]/40 text-white'
                        : 'hover:bg-white/5 text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      {ch.logo ? (
                        <img
                          src={ch.logo}
                          alt={ch.name}
                          className="w-8 h-8 object-contain bg-black/60 rounded p-0.5 shrink-0"
                          onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center shrink-0">
                          <Tv className="w-4 h-4 text-neutral-400" />
                        </div>
                      )}
                      <div className="truncate">
                        <div className="text-xs font-semibold truncate">{ch.name}</div>
                        <div className="text-[10px] text-neutral-500 truncate">{ch.group}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 ml-2">
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping mr-1"></span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(ch.id);
                        }}
                        className="p-1 text-neutral-500 hover:text-amber-400"
                      >
                        <Star className={`w-3.5 h-3.5 ${isFav ? 'text-amber-400 fill-amber-400' : ''}`} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
