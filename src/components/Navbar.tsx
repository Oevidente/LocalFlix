import React, { useState, useEffect } from 'react';
import { Film, Plus, HardDrive, Search, Tv, Loader2, Radio, Sparkles } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  activeTab: 'all' | 'series' | 'movie' | 'continue';
  onTabChange: (tab: 'all' | 'series' | 'movie' | 'continue') => void;
  onOpenAddModal: () => void;
  onOpenSystemModal: () => void;
  onOpenTorrentModal: () => void;
  onOpenTmdbModal?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isPickingFolder?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenAddModal,
  onOpenSystemModal,
  onOpenTorrentModal,
  onOpenTmdbModal,
  searchQuery,
  onSearchChange,
  isPickingFolder = false,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      id="navbar"
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#141414]/95 backdrop-blur-md shadow-2xl py-3 border-b border-white/5'
          : 'bg-gradient-to-b from-black/90 via-black/50 to-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Left: Brand + Navigation */}
        <div className="flex items-center space-x-6 sm:space-x-8">
          <div
            id="brand-logo"
            onClick={() => onTabChange('all')}
            className="cursor-pointer flex items-center space-x-2 group"
          >
            <div className="w-8 h-8 rounded bg-[#E50914] flex items-center justify-center font-black text-white text-xl tracking-tighter shadow-lg shadow-red-950/40">
              C
            </div>
            <span className="text-xl sm:text-2xl font-black tracking-wider text-[#E50914] uppercase drop-shadow-md">
              Cine<span className="text-white">Local</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center space-x-5 text-sm font-medium">
            <button
              id="nav-tab-all"
              onClick={() => onTabChange('all')}
              className={`transition-colors ${
                activeTab === 'all' ? 'text-white font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Início
            </button>
            <button
              id="nav-tab-series"
              onClick={() => onTabChange('series')}
              className={`transition-colors flex items-center space-x-1 ${
                activeTab === 'series' ? 'text-white font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Tv className="w-3.5 h-3.5 mr-1 inline" />
              Séries
            </button>
            <button
              id="nav-tab-movie"
              onClick={() => onTabChange('movie')}
              className={`transition-colors flex items-center space-x-1 ${
                activeTab === 'movie' ? 'text-white font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Film className="w-3.5 h-3.5 mr-1 inline" />
              Filmes
            </button>
            <button
              id="nav-tab-continue"
              onClick={() => onTabChange('continue')}
              className={`transition-colors ${
                activeTab === 'continue' ? 'text-white font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Continuar Assistindo
            </button>
          </nav>
        </div>

        {/* Right: Search + Offline Badge + Add Folder + System */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Search input */}
          <div className="relative flex items-center">
            {showSearch ? (
              <div className="flex items-center bg-black/60 border border-neutral-700 rounded-full px-3 py-1.5 text-sm transition-all w-44 sm:w-64">
                <Search className="w-4 h-4 text-neutral-400 mr-2 shrink-0" />
                <input
                  id="search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Buscar títulos..."
                  className="bg-transparent border-none text-white focus:outline-none w-full text-xs sm:text-sm"
                  autoFocus
                  onBlur={() => {
                    if (!searchQuery) setShowSearch(false);
                  }}
                />
              </div>
            ) : (
              <button
                id="search-toggle-btn"
                onClick={() => setShowSearch(true)}
                className="p-2 text-neutral-300 hover:text-white transition-colors rounded-full hover:bg-white/10"
                title="Buscar títulos"
              >
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>

          {/* 100% Offline Badge */}
          <div
            id="offline-status-badge"
            onClick={onOpenSystemModal}
            className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs font-mono cursor-pointer hover:bg-emerald-900/30 transition-colors"
            title="100% Offline - Rodando no seu computador / pendrive"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Offline</span>
          </div>

          {/* Torrent Magnet Player Button */}
          <button
            id="torrent-player-btn"
            onClick={onOpenTorrentModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 sm:px-3 sm:py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 text-xs sm:text-sm font-semibold transition-all border border-zinc-700/80 shadow-md active:scale-95 cursor-pointer"
            title="Abrir Player Torrent / Link Magnet"
          >
            <Radio className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Player Torrent</span>
            <span className="sm:hidden">Torrent</span>
          </button>

          {/* Add Folder Button */}
          <button
            id="add-folder-btn"
            onClick={onOpenAddModal}
            disabled={isPickingFolder}
            className="flex items-center space-x-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-md bg-[#E50914] hover:bg-[#b80710] text-white text-xs sm:text-sm font-semibold transition-all shadow-md active:scale-95 disabled:opacity-75 cursor-pointer"
            title="Adicionar pasta do PC pelo explorador nativo"
          >
            {isPickingFolder ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="hidden sm:inline">Abrindo Explorador...</span>
                <span className="sm:hidden">Explorador...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Adicionar Pasta do PC</span>
                <span className="sm:hidden">Pasta PC</span>
              </>
            )}
          </button>

          {/* Install PWA Button */}
          <PWAInstallButton />

          {/* TMDb Config button */}
          {onOpenTmdbModal && (
            <button
              id="tmdb-config-navbar-btn"
              onClick={onOpenTmdbModal}
              className="p-2 text-pink-400 hover:text-pink-300 rounded-md hover:bg-pink-500/15 transition-colors"
              title="Configurar TMDb (Capas e Sinopses)"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          )}

          {/* System & Storage status button */}
          <button
            id="system-status-btn"
            onClick={onOpenSystemModal}
            className="p-2 text-neutral-300 hover:text-white rounded-md hover:bg-white/10 transition-colors"
            title="Status do Sistema e Portabilidade"
          >
            <HardDrive className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
