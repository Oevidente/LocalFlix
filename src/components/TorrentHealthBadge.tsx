import React from 'react';
import {
  Activity,
  Zap,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SignalZero,
  AlertTriangle,
  Loader2,
  Users,
} from 'lucide-react';

export type TorrentHealthLevel = 'high' | 'medium' | 'low' | 'none';

interface TorrentHealthBadgeProps {
  peers?: number;
  health?: TorrentHealthLevel;
  downloadSpeed?: number;
  state?: 'connecting' | 'metadata' | 'ready' | 'downloading' | 'error';
  compact?: boolean;
  showPeerCount?: boolean;
  className?: string;
}

export const TorrentHealthBadge: React.FC<TorrentHealthBadgeProps> = ({
  peers = 0,
  health,
  downloadSpeed = 0,
  state,
  compact = false,
  showPeerCount = true,
  className = '',
}) => {
  // Infer health level if not directly provided
  const computedHealth: TorrentHealthLevel = health || (() => {
    if (state === 'error') return 'none';
    if (peers >= 8 || downloadSpeed > 400 * 1024) return 'high';
    if (peers >= 3 || downloadSpeed > 50 * 1024) return 'medium';
    if (peers >= 1) return 'low';
    return 'none';
  })();

  const isConnecting = state === 'connecting' || state === 'metadata';

  // Config mapping based on health status
  const config = {
    high: {
      label: 'Alta Disponibilidade',
      shortLabel: 'Alta',
      description: 'Muitos seeders disponíveis. Transmissão rápida e fluida.',
      badgeBg: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
      dotColor: 'bg-emerald-400',
      iconColor: 'text-emerald-400',
      barColor: 'bg-emerald-400',
      bars: 3,
    },
    medium: {
      label: 'Média Disponibilidade',
      shortLabel: 'Média',
      description: 'Disponibilidade moderada de peers. Reprodução estável.',
      badgeBg: 'bg-amber-950/80 border-amber-500/40 text-amber-300',
      dotColor: 'bg-amber-400',
      iconColor: 'text-amber-400',
      barColor: 'bg-amber-400',
      bars: 2,
    },
    low: {
      label: 'Baixa Disponibilidade',
      shortLabel: 'Baixa',
      description: 'Poucos seeders ativos. O streaming pode demorar a carregar.',
      badgeBg: 'bg-orange-950/80 border-orange-500/40 text-orange-300',
      dotColor: 'bg-orange-400',
      iconColor: 'text-orange-400',
      barColor: 'bg-orange-400',
      bars: 1,
    },
    none: {
      label: isConnecting ? 'Buscando Peers...' : 'Pouca Disponibilidade',
      shortLabel: isConnecting ? 'Buscando' : '0 Peers',
      description: isConnecting
        ? 'Conectando à rede BitTorrent e localizando seeders...'
        : 'Nenhum seeder conectado no momento. Clique para conectar.',
      badgeBg: 'bg-zinc-900/90 border-zinc-700/60 text-zinc-400',
      dotColor: isConnecting ? 'bg-sky-400 animate-ping' : 'bg-zinc-500',
      iconColor: isConnecting ? 'text-sky-400' : 'text-zinc-500',
      barColor: 'bg-zinc-600',
      bars: 0,
    },
  }[computedHealth];

  const tooltipText = `${config.label}${peers > 0 ? ` (${peers} peers)` : ''} - ${config.description}`;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${config.badgeBg} transition ${className}`}
        title={tooltipText}
      >
        <span className="flex items-end gap-0.5 h-3">
          <span className={`w-0.5 rounded-full transition-all ${config.bars >= 1 ? config.barColor : 'bg-zinc-700'} h-1.5`} />
          <span className={`w-0.5 rounded-full transition-all ${config.bars >= 2 ? config.barColor : 'bg-zinc-700'} h-2.5`} />
          <span className={`w-0.5 rounded-full transition-all ${config.bars >= 3 ? config.barColor : 'bg-zinc-700'} h-3.5`} />
        </span>
        <span>{config.shortLabel}</span>
        {showPeerCount && peers > 0 && (
          <span className="opacity-80 font-mono text-[9px] font-normal">({peers})</span>
        )}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border shadow-xs transition ${config.badgeBg} ${className}`}
      title={tooltipText}
    >
      {/* 3-bar signal health visual */}
      <span className="flex items-end gap-0.5 h-3 shrink-0">
        <span
          className={`w-0.5 rounded-full transition-all ${
            config.bars >= 1 ? `${config.barColor} h-1.5 shadow-sm` : 'bg-zinc-700 h-1'
          }`}
        />
        <span
          className={`w-0.5 rounded-full transition-all ${
            config.bars >= 2 ? `${config.barColor} h-2.5 shadow-sm` : 'bg-zinc-700 h-1'
          }`}
        />
        <span
          className={`w-0.5 rounded-full transition-all ${
            config.bars >= 3 ? `${config.barColor} h-3.5 shadow-sm` : 'bg-zinc-700 h-1'
          }`}
        />
      </span>

      {/* Pulsing indicator dot */}
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor} shrink-0`} />

      {/* Label and peer count */}
      <span className="font-semibold tracking-tight">{config.label}</span>
      {showPeerCount && peers > 0 && (
        <span className="font-mono text-[10px] opacity-85 shrink-0 bg-black/30 px-1 py-0.2 rounded">
          {peers} peers
        </span>
      )}
    </div>
  );
};
