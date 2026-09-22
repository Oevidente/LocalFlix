import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { HeroBanner } from './components/HeroBanner';
import { MediaRow } from './components/MediaRow';
import { MediaDetailModal } from './components/MediaDetailModal';
import { VideoPlayer } from './components/VideoPlayer';
import { AddMediaModal } from './components/AddMediaModal';
import { RelocateModal } from './components/RelocateModal';
import { SystemModal } from './components/SystemModal';
import { LibraryData, MediaItem, Episode } from './types';
import { FolderPlus, Film, Tv, Play, HardDrive, RefreshCw } from 'lucide-react';

export default function App() {
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'all' | 'series' | 'movie' | 'continue'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Player State
  const [activeMediaDetail, setActiveMediaDetail] = useState<MediaItem | null>(null);
  const [playingState, setPlayingState] = useState<{ media: MediaItem; episode: Episode } | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showSystemModal, setShowSystemModal] = useState<boolean>(false);
  const [relocateTarget, setRelocateTarget] = useState<MediaItem | null>(null);

  // Fetch library from local server
  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/library');
      if (!res.ok) throw new Error('Falha ao obter biblioteca');
      const data: LibraryData = await res.json();
      setLibrary(data);

      // Keep active detail modal synced with new state if open
      if (activeMediaDetail) {
        const refreshed = data.items.find((i) => i.id === activeMediaDetail.id);
        if (refreshed) {
          setActiveMediaDetail(refreshed);
        }
      }
    } catch (err) {
      console.error('Erro carregando library.json:', err);
    } finally {
      setLoading(false);
    }
  }, [activeMediaDetail]);

  useEffect(() => {
    fetchLibrary();
  }, []);

  // Add folder handler
  const handleAddFolder = async (folderPath: string, title?: string) => {
    const res = await fetch('/api/library/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath, title }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao adicionar pasta');
    }
    await fetchLibrary();
    if (data.item) {
      setActiveMediaDetail(data.item);
    }
  };

  // Rescan media folder
  const handleRescan = async (mediaId: string) => {
    const res = await fetch(`/api/library/rescan/${mediaId}`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao re-escanear pasta');
    }
    await fetchLibrary();
  };

  // Relocate folder
  const handleRelocate = async (mediaId: string, newPath: string) => {
    const res = await fetch(`/api/library/relocate/${mediaId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newFolderPath: newPath }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao relocalizar pasta');
    }
    await fetchLibrary();
  };

  // Toggle episode watched
  const handleToggleWatched = async (mediaId: string, episodeId: string, watched?: boolean) => {
    try {
      await fetch('/api/library/mark-watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId, episodeId, watched }),
      });
      await fetchLibrary();
    } catch (e) {
      console.error('Erro ao marcar episódio:', e);
    }
  };

  // Delete media item
  const handleDeleteMedia = async (mediaId: string) => {
    try {
      await fetch(`/api/library/${mediaId}`, {
        method: 'DELETE',
      });
      setActiveMediaDetail(null);
      await fetchLibrary();
    } catch (e) {
      console.error('Erro ao excluir mídia:', e);
    }
  };

  // Start playback
  const handlePlayEpisode = (media: MediaItem, episode?: Episode) => {
    let targetEp = episode;
    if (!targetEp) {
      if (media.lastWatchedEpisodeId) {
        for (const s of media.seasons) {
          const found = s.episodes.find((e) => e.id === media.lastWatchedEpisodeId);
          if (found) {
            targetEp = found;
            break;
          }
        }
      }
    }
    if (!targetEp && media.seasons[0]?.episodes[0]) {
      targetEp = media.seasons[0].episodes[0];
    }
    if (targetEp) {
      setActiveMediaDetail(null);
      setPlayingState({ media, episode: targetEp });
    }
  };

  // Find next episode
  const nextEpisode = useMemo(() => {
    if (!playingState) return undefined;
    const { media, episode } = playingState;

    const allEpisodes = media.seasons.flatMap((s) => s.episodes);
    const currentIndex = allEpisodes.findIndex((e) => e.id === episode.id);
    if (currentIndex >= 0 && currentIndex < allEpisodes.length - 1) {
      return allEpisodes[currentIndex + 1];
    }
    return undefined;
  }, [playingState]);

  const handlePlayNextEpisode = () => {
    if (playingState && nextEpisode) {
      setPlayingState({ media: playingState.media, episode: nextEpisode });
    }
  };

  // Filtered Media Items
  const filteredItems = useMemo(() => {
    if (!library) return [];
    let list = library.items;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.seasons.some((s) => s.episodes.some((e) => e.title.toLowerCase().includes(q)))
      );
    }

    if (activeTab === 'series') {
      list = list.filter((i) => i.kind === 'series');
    } else if (activeTab === 'movie') {
      list = list.filter((i) => i.kind === 'movie');
    }

    return list;
  }, [library, searchQuery, activeTab]);

  // "Continue Watching" items: any item that has partially watched episodes or recent activity
  const continueWatchingItems = useMemo(() => {
    if (!library) return [];
    const results: { media: MediaItem; continueEpisode: Episode }[] = [];

    for (const media of library.items) {
      // Find candidate episode: lastWatchedEpisode or any episode in progress
      let candEp: Episode | undefined;
      if (media.lastWatchedEpisodeId) {
        for (const s of media.seasons) {
          const ep = s.episodes.find((e) => e.id === media.lastWatchedEpisodeId);
          if (ep && !ep.watched) {
            candEp = ep;
            break;
          }
        }
      }

      if (!candEp) {
        // Find first unwatched episode that has some progress
        for (const s of media.seasons) {
          const ep = s.episodes.find((e) => e.progressSeconds > 10 && !e.watched);
          if (ep) {
            candEp = ep;
            break;
          }
        }
      }

      if (candEp) {
        results.push({ media, continueEpisode: candEp });
      }
    }

    return results;
  }, [library]);

  // Featured Hero Item (first continue watching or first item in library)
  const heroMedia = useMemo(() => {
    if (continueWatchingItems.length > 0) {
      return continueWatchingItems[0].media;
    }
    return filteredItems[0] || null;
  }, [continueWatchingItems, filteredItems]);

  const seriesItems = useMemo(
    () => filteredItems.filter((i) => i.kind === 'series').map((media) => ({ media })),
    [filteredItems]
  );

  const movieItems = useMemo(
    () => filteredItems.filter((i) => i.kind === 'movie').map((media) => ({ media })),
    [filteredItems]
  );

  const allCards = useMemo(() => filteredItems.map((media) => ({ media })), [filteredItems]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center space-y-4 text-white">
        <div className="w-12 h-12 rounded-full border-4 border-[#E50914] border-t-transparent animate-spin" />
        <p className="text-sm font-semibold tracking-wider text-neutral-400">CARREGANDO CINELOCAL...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414] text-neutral-200 selection:bg-[#E50914] selection:text-white pb-20">
      {/* Fixed Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenAddModal={() => setShowAddModal(true)}
        onOpenSystemModal={() => setShowSystemModal(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main Content Area */}
      {library && library.items.length === 0 ? (
        /* Empty State Screen */
        <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto text-center flex flex-col items-center">
          <div className="w-20 h-20 rounded-2xl bg-[#E50914]/20 border border-[#E50914]/40 flex items-center justify-center text-[#E50914] mb-6 shadow-2xl shadow-red-950/50">
            <Film className="w-10 h-10" />
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
            Sua Biblioteca de Mídia Offline
          </h1>

          <p className="text-neutral-400 text-sm sm:text-base max-w-xl mb-8 leading-relaxed">
            Organize e assista aos seus filmes e séries armazenados no seu computador ou pendrive.
            Zero nuvem, sem login e com reprodução nativa de MP4 e transcodificação MKV via FFmpeg.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md">
            <button
              id="empty-add-folder-btn"
              onClick={() => setShowAddModal(true)}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 rounded-lg bg-[#E50914] hover:bg-red-700 text-white font-bold transition-all shadow-xl active:scale-95 text-sm"
            >
              <FolderPlus className="w-5 h-5" />
              <span>Adicionar Pasta do PC</span>
            </button>
          </div>

          <div className="mt-16 p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 max-w-lg text-left text-xs text-neutral-400 space-y-2">
            <div className="flex items-center space-x-2 text-white font-semibold">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <span>Totalmente Portátil:</span>
            </div>
            <p>
              Todos os dados e progresso ficam guardados no arquivo <strong className="text-white">data/library.json</strong>.
              Você pode copiar essa pasta inteira para um pendrive e abrir dando duplo clique em <strong className="text-white">start.bat</strong>.
            </p>
          </div>
        </div>
      ) : (
        /* Populated Library View */
        <>
          {/* Hero Spotlight */}
          {heroMedia && activeTab !== 'continue' && !searchQuery && (
            <HeroBanner
              media={heroMedia}
              onPlayEpisode={handlePlayEpisode}
              onOpenDetails={setActiveMediaDetail}
            />
          )}

          {/* Rows Container */}
          <main className={`relative z-20 ${heroMedia && !searchQuery ? '-mt-12 sm:-mt-16 lg:-mt-20' : 'pt-24'}`}>
            {/* 1. Continuar Assistindo Row (Backdrop card variant with progress bar) */}
            {continueWatchingItems.length > 0 && activeTab !== 'series' && activeTab !== 'movie' && (
              <MediaRow
                id="row-continue-watching"
                title="Continuar Assistindo"
                items={continueWatchingItems}
                onPlay={handlePlayEpisode}
                onOpenDetails={setActiveMediaDetail}
                variant="backdrop"
              />
            )}

            {/* 2. Séries Row */}
            {seriesItems.length > 0 && activeTab !== 'movie' && activeTab !== 'continue' && (
              <MediaRow
                id="row-series"
                title="Séries de TV"
                items={seriesItems}
                onPlay={handlePlayEpisode}
                onOpenDetails={setActiveMediaDetail}
                variant="poster"
              />
            )}

            {/* 3. Filmes Row */}
            {movieItems.length > 0 && activeTab !== 'series' && activeTab !== 'continue' && (
              <MediaRow
                id="row-movies"
                title="Filmes"
                items={movieItems}
                onPlay={handlePlayEpisode}
                onOpenDetails={setActiveMediaDetail}
                variant="poster"
              />
            )}

            {/* 4. Todos os Títulos */}
            {(activeTab === 'all' || activeTab === 'continue') && allCards.length > 0 && (
              <MediaRow
                id="row-all-media"
                title={searchQuery ? `Resultados da busca ("${searchQuery}")` : 'Todos os Títulos'}
                items={allCards}
                onPlay={handlePlayEpisode}
                onOpenDetails={setActiveMediaDetail}
                variant="poster"
              />
            )}

            {filteredItems.length === 0 && (
              <div className="py-24 text-center">
                <p className="text-neutral-400 text-base">Nenhum título encontrado com os filtros atuais.</p>
                <button
                  onClick={() => {
                    setActiveTab('all');
                    setSearchQuery('');
                  }}
                  className="mt-4 px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold"
                >
                  Limpar Filtros
                </button>
              </div>
            )}
          </main>
        </>
      )}

      {/* Series / Movie Details Modal */}
      {activeMediaDetail && (
        <MediaDetailModal
          media={activeMediaDetail}
          onClose={() => setActiveMediaDetail(null)}
          onPlayEpisode={handlePlayEpisode}
          onToggleWatched={handleToggleWatched}
          onRescan={handleRescan}
          onOpenRelocate={(m) => setRelocateTarget(m)}
          onDeleteMedia={handleDeleteMedia}
        />
      )}

      {/* Video Player Modal */}
      {playingState && (
        <VideoPlayer
          key={`${playingState.media.id}-${playingState.episode.id}`}
          media={playingState.media}
          episode={playingState.episode}
          onClose={() => {
            setPlayingState(null);
            fetchLibrary();
          }}
          onPlayNextEpisode={handlePlayNextEpisode}
          nextEpisode={nextEpisode}
        />
      )}

      {/* Add Folder Modal */}
      {showAddModal && (
        <AddMediaModal
          onClose={() => setShowAddModal(false)}
          onAddFolder={handleAddFolder}
        />
      )}

      {/* Relocate Folder Modal */}
      {relocateTarget && (
        <RelocateModal
          media={relocateTarget}
          onClose={() => setRelocateTarget(null)}
          onRelocate={handleRelocate}
        />
      )}

      {/* System & Portability Status Modal */}
      {showSystemModal && (
        <SystemModal
          onClose={() => setShowSystemModal(false)}
        />
      )}
    </div>
  );
}
