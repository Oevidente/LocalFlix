import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { HeroBanner } from './components/HeroBanner';
import { MediaRow } from './components/MediaRow';
import { MediaDetailModal } from './components/MediaDetailModal';
import { VideoPlayer } from './components/VideoPlayer';
import { AddMediaModal } from './components/AddMediaModal';
import { RelocateModal } from './components/RelocateModal';
import { SystemModal } from './components/SystemModal';
import { TmdbConfigModal } from './components/TmdbConfigModal';
import { TorrentModal } from './components/TorrentModal';
import { TorrentPlayer } from './components/TorrentPlayer';
import { ChannelsPage } from './components/ChannelsPage';
import { IptvPlayerModal } from './components/IptvPlayerModal';
import { MobileAccessBanner } from './components/MobileAccessBanner';
import { StorageNodesModal } from './components/StorageNodesModal';
import { LibraryData, MediaItem, Episode, OnlineSubtitleOption, TorrentStatus, IptvChannel } from './types';
import { FolderPlus, Film, Tv, Play, HardDrive, RefreshCw, Radio } from 'lucide-react';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

export default function App() {
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'all' | 'series' | 'movie' | 'channels'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Player State
  const [activeMediaDetail, setActiveMediaDetail] = useState<MediaItem | null>(null);
  const [playingState, setPlayingState] = useState<{ media: MediaItem; episode: Episode } | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [initialAddFolder, setInitialAddFolder] = useState<string>('');
  const [showSystemModal, setShowSystemModal] = useState<boolean>(false);
  const [showTmdbConfigModal, setShowTmdbConfigModal] = useState<boolean>(false);
  const [showStorageNodesModal, setShowStorageNodesModal] = useState<boolean>(false);
  const [relocateTarget, setRelocateTarget] = useState<MediaItem | null>(null);
  const [showTorrentModal, setShowTorrentModal] = useState<boolean>(false);
  const [playingTorrent, setPlayingTorrent] = useState<{
    status: TorrentStatus;
    selectedFileIndex: number;
    media?: MediaItem | null;
  } | null>(null);

  // IPTV Live Channels State
  const [iptvPlaying, setIptvPlaying] = useState<{ channel: IptvChannel; allChannels: IptvChannel[] } | null>(null);
  const [iptvFavorites, setIptvFavorites] = useState<string[]>([]);

  // Fetch IPTV favorites
  useEffect(() => {
    fetch('/api/iptv/favorites')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.favorites)) {
          setIptvFavorites(data.favorites);
        }
      })
      .catch((err) => console.error('Erro ao carregar favoritos IPTV:', err));
  }, []);

  const handleToggleIptvFavorite = async (channelId: string) => {
    const isFav = iptvFavorites.includes(channelId);
    const updated = isFav ? iptvFavorites.filter((id) => id !== channelId) : [...iptvFavorites, channelId];
    setIptvFavorites(updated);

    try {
      await fetch('/api/iptv/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, isFavorite: !isFav }),
      });
    } catch (err) {
      console.error('Erro ao sincronizar favorito IPTV:', err);
    }
  };

  const handleOpenAddModal = () => {
    setInitialAddFolder('');
    setShowAddModal(true);
  };

  // Fetch library from local server
  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/library', { cache: 'no-store' });
      if (!res.ok) throw new Error('Falha ao obter biblioteca');
      const data: LibraryData = await res.json();
      setLibrary(data);

      // Keep active detail modal synced with new state if open
      setActiveMediaDetail((prev) => {
        if (!prev) return null;
        const refreshed = data.items.find((i) => i.id === prev.id);
        return refreshed || prev;
      });
    } catch (err) {
      console.error('Erro carregando library.json:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRescanAll = useCallback(async () => {
    try {
      const res = await fetch('/api/library/rescan-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.library) {
          setLibrary(data.library);
          setActiveMediaDetail((prev) => {
            if (!prev) return null;
            const refreshed = data.library.items.find((i: MediaItem) => i.id === prev.id);
            return refreshed || prev;
          });
        }
      }
    } catch (err) {
      console.warn('Erro ao re-escanear todas as pastas:', err);
    }
  }, []);

  useEffect(() => {
    // 1. Initial fast library load
    fetchLibrary();

    // 2. Automatically re-scan all registered folders on site open to determine if series or movie
    handleRescanAll();
  }, [fetchLibrary, handleRescanAll]);

  // Add folder handler
  const handleAddFolder = async (folderPath: string, title?: string, nodeId?: string) => {
    const res = await fetch('/api/library/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath, title, nodeId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao adicionar pasta');
    }
    if (data.item) {
      setActiveMediaDetail(data.item);
      setLibrary((prev) => {
        if (!prev) return prev;
        const exists = prev.items.some((i) => i.id === data.item.id);
        return {
          ...prev,
          items: exists
            ? prev.items.map((i) => (i.id === data.item.id ? data.item : i))
            : [data.item, ...prev.items],
        };
      });
    }
    await fetchLibrary();
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
    if (data.item) {
      setActiveMediaDetail(data.item);
      setLibrary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((i) => (i.id === mediaId ? data.item : i)),
        };
      });
    }
    await fetchLibrary();
  };

  const handleImportSubtitle = async (mediaId: string, episodeId: string, file: File) => {
    const allowedExtensions = new Set(['.srt', '.vtt', '.ass', '.ssa']);
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new Error('Formato de legenda não suportado. Use .srt, .vtt, .ass ou .ssa.');
    }

    const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
    const res = await fetch(`/api/media/${mediaId}/episode/${episodeId}/subtitles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentBase64 }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível importar a legenda.');
    }
    await fetchLibrary();
  };

  const handleRemoveImportedSubtitle = async (mediaId: string, episodeId: string, trackIndex: number) => {
    const res = await fetch(`/api/media/${mediaId}/episode/${episodeId}/subtitles/${trackIndex}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível remover a legenda.');
    }
    await fetchLibrary();
  };

  const handleSearchOnlineSubtitles = async (mediaId: string, episodeId: string): Promise<OnlineSubtitleOption[]> => {
    const language = library?.settings.preferredSubtitleLanguage || 'pt-br';
    const res = await fetch(
      `/api/media/${mediaId}/episode/${episodeId}/subtitles/online?language=${encodeURIComponent(language)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível buscar legendas online.');
    return Array.isArray(data.items) ? data.items : [];
  };

  const handleDownloadOnlineSubtitle = async (
    mediaId: string,
    episodeId: string,
    option: OnlineSubtitleOption
  ) => {
    const res = await fetch(`/api/media/${mediaId}/episode/${episodeId}/subtitles/online/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(option),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível baixar a legenda online.');
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
    if (data.item) {
      setActiveMediaDetail(data.item);
    }
    await fetchLibrary();
  };

  // Toggle episode watched with instant optimistic update
  const handleToggleWatched = async (mediaId: string, episodeId: string, watched?: boolean) => {
    const now = new Date().toISOString();
    // 1. Instant local update
    setLibrary((prevLib) => {
      if (!prevLib) return prevLib;
      return {
        ...prevLib,
        items: prevLib.items.map((item) => {
          if (item.id !== mediaId) return item;
          let newLastWatched = item.lastWatchedEpisodeId;
          let newMediaWatchedAt = item.lastWatchedAt;
          const newSeasons = item.seasons.map((s) => ({
            ...s,
            episodes: s.episodes.map((ep) => {
              if (ep.id === episodeId) {
                const isWatched = typeof watched === 'boolean' ? watched : !ep.watched;
                if (isWatched) {
                  newLastWatched = ep.id;
                  newMediaWatchedAt = now;
                }
                return {
                  ...ep,
                  watched: isWatched,
                  progressSeconds: isWatched ? (ep.durationSeconds || ep.progressSeconds) : 0,
                  lastWatchedAt: isWatched ? now : ep.lastWatchedAt,
                };
              }
              return ep;
            }),
          }));
          return {
            ...item,
            lastWatchedEpisodeId: newLastWatched,
            lastWatchedAt: newMediaWatchedAt,
            updatedAt: now,
            seasons: newSeasons,
          };
        }),
      };
    });

    setActiveMediaDetail((prevDetail) => {
      if (!prevDetail || prevDetail.id !== mediaId) return prevDetail;
      let newLastWatched = prevDetail.lastWatchedEpisodeId;
      let newMediaWatchedAt = prevDetail.lastWatchedAt;
      const newSeasons = prevDetail.seasons.map((s) => ({
        ...s,
        episodes: s.episodes.map((ep) => {
          if (ep.id === episodeId) {
            const isWatched = typeof watched === 'boolean' ? watched : !ep.watched;
            if (isWatched) {
              newLastWatched = ep.id;
              newMediaWatchedAt = now;
            }
            return {
              ...ep,
              watched: isWatched,
              progressSeconds: isWatched ? (ep.durationSeconds || ep.progressSeconds) : 0,
              lastWatchedAt: isWatched ? now : ep.lastWatchedAt,
            };
          }
          return ep;
        }),
      }));
      return {
        ...prevDetail,
        lastWatchedEpisodeId: newLastWatched,
        lastWatchedAt: newMediaWatchedAt,
        updatedAt: now,
        seasons: newSeasons,
      };
    });

    try {
      await fetch('/api/library/mark-watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId, episodeId, watched }),
      });
      fetchLibrary();
    } catch (e) {
      console.error('Erro ao marcar episódio:', e);
      fetchLibrary();
    }
  };

  // Delete media item with instant optimistic removal
  const handleDeleteMedia = async (mediaId: string) => {
    setActiveMediaDetail(null);
    setLibrary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.filter((item) => item.id !== mediaId),
      };
    });

    try {
      await fetch(`/api/library/${mediaId}`, {
        method: 'DELETE',
      });
      fetchLibrary();
    } catch (e) {
      console.error('Erro ao excluir mídia:', e);
      fetchLibrary();
    }
  };

  // Start playback
  const handlePlayEpisode = async (media: MediaItem, episode?: Episode) => {
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

    if (media.isTorrent || targetEp?.isTorrent || media.folderPath?.startsWith('torrent://')) {
      setActiveMediaDetail(null);
      const magnetUri =
        media.magnetUri ||
        targetEp?.magnetUri ||
        (media.infoHash ? `magnet:?xt=urn:btih:${media.infoHash}` : targetEp?.filePath?.replace('torrent://', 'magnet:?xt=urn:btih:') || '');

      const fileIdx = targetEp?.fileIndex ?? 0;
      if (magnetUri) {
        try {
          const res = await fetch('/api/torrent/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magnetUri }),
          });
          if (res.ok) {
            const torrentStatus: TorrentStatus = await res.json();
            setPlayingTorrent({ status: torrentStatus, selectedFileIndex: fileIdx, media });
            return;
          }
        } catch (err) {
          console.error('Erro ao reproduzir torrent da biblioteca:', err);
        }
      }
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

  // Find previous episode (when not the first episode)
  const prevEpisode = useMemo(() => {
    if (!playingState) return undefined;
    const { media, episode } = playingState;

    const allEpisodes = media.seasons.flatMap((s) => s.episodes);
    const currentIndex = allEpisodes.findIndex((e) => e.id === episode.id);
    if (currentIndex > 0) {
      return allEpisodes[currentIndex - 1];
    }
    return undefined;
  }, [playingState]);

  const handlePlayNextEpisode = () => {
    if (playingState && nextEpisode) {
      setPlayingState({ media: playingState.media, episode: nextEpisode });
    }
  };

  const handlePlayPrevEpisode = () => {
    if (playingState && prevEpisode) {
      setPlayingState({ media: playingState.media, episode: prevEpisode });
    }
  };

  const handleUpdateBanner = async (mediaId: string, bannerUrl: string): Promise<boolean> => {
    // 1. Instant optimistic update
    setActiveMediaDetail((prev) => {
      if (prev && prev.id === mediaId) {
        return { ...prev, backdropPath: bannerUrl || undefined };
      }
      return prev;
    });
    setLibrary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((i) => (i.id === mediaId ? { ...i, backdropPath: bannerUrl || undefined } : i)),
      };
    });

    try {
      const res = await fetch(`/api/media/${mediaId}/banner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bannerUrl }),
      });
      if (res.ok) {
        fetchLibrary();
        return true;
      }
      return false;
    } catch {
      fetchLibrary();
      return false;
    }
  };

  const handleUpdatePoster = async (mediaId: string, posterUrl: string): Promise<boolean> => {
    // 1. Instant optimistic update
    setActiveMediaDetail((prev) => {
      if (prev && prev.id === mediaId) {
        return { ...prev, posterPath: posterUrl || undefined };
      }
      return prev;
    });
    setLibrary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((i) => (i.id === mediaId ? { ...i, posterPath: posterUrl || undefined } : i)),
      };
    });

    try {
      const res = await fetch(`/api/media/${mediaId}/poster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posterUrl }),
      });
      if (res.ok) {
        fetchLibrary();
        return true;
      }
      return false;
    } catch {
      fetchLibrary();
      return false;
    }
  };

  const handleUpdateKind = async (mediaId: string, newKind: 'movie' | 'series'): Promise<void> => {
    // 1. Optimistic update
    setActiveMediaDetail((prev) => (prev && prev.id === mediaId ? { ...prev, kind: newKind } : prev));
    setLibrary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((i) => (i.id === mediaId ? { ...i, kind: newKind } : i)),
      };
    });

    try {
      const res = await fetch(`/api/media/${mediaId}/kind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: newKind }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.item) {
          setActiveMediaDetail(data.item);
        }
        await fetchLibrary();
      }
    } catch (err) {
      console.error('Erro ao alternar classificação de mídia:', err);
      fetchLibrary();
    }
  };

  const handleRefreshMetadata = async (mediaId: string, query?: string, tmdbId?: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/library/metadata/${mediaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, tmdbId }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.item) {
        // 1. Instant synchronous update of active media and library list
        setActiveMediaDetail(data.item);
        setLibrary((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((i) => (i.id === mediaId ? data.item : i)),
          };
        });
        fetchLibrary();
        return { success: true };
      }
      return { success: false, error: data.error || 'Erro ao obter dados do TMDb.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro de conexão com o servidor.' };
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

  // "Continue Watching" items: ordered strictly from most recently watched to oldest.
  // When an episode was finished, it automatically advances to the next unwatched episode in sequence at the top of the queue.
  const continueWatchingItems = useMemo(() => {
    if (!library) return [];
    const results: { media: MediaItem; continueEpisode: Episode; lastWatchedTime: number }[] = [];

    for (const media of library.items) {
      const allEpisodes = media.seasons.flatMap((s) => s.episodes);
      if (allEpisodes.length === 0) continue;

      let candEp: Episode | undefined;
      let candTime = 0;

      // 1. Check lastWatchedEpisodeId
      if (media.lastWatchedEpisodeId) {
        const lastEpIndex = allEpisodes.findIndex((e) => e.id === media.lastWatchedEpisodeId);
        if (lastEpIndex >= 0) {
          const lastEp = allEpisodes[lastEpIndex];
          const lastEpTime = lastEp.lastWatchedAt
            ? new Date(lastEp.lastWatchedAt).getTime()
            : media.lastWatchedAt
            ? new Date(media.lastWatchedAt).getTime()
            : 0;

          if (lastEp.watched) {
            // User finished this episode. For a series, advance to the next unwatched episode in sequence
            if (media.kind === 'series') {
              const nextUnwatched = allEpisodes.slice(lastEpIndex + 1).find((e) => !e.watched);
              if (nextUnwatched) {
                candEp = nextUnwatched;
                // Inherit the time the previous episode was finished so it stays at the top of the queue
                candTime = lastEpTime || (media.updatedAt ? new Date(media.updatedAt).getTime() : 0);
              }
            }
            // For a movie that is 100% watched, do not keep in continue watching
          } else {
            // Episode is in progress or selected
            candEp = lastEp;
            candTime =
              lastEpTime ||
              (candEp.lastWatchedAt ? new Date(candEp.lastWatchedAt).getTime() : 0) ||
              (media.lastWatchedAt ? new Date(media.lastWatchedAt).getTime() : 0);
          }
        }
      }

      // 2. If no candidate yet, look for any unwatched episode with progress > 10s
      if (!candEp) {
        const inProgressEp = allEpisodes.find((e) => e.progressSeconds > 10 && !e.watched);
        if (inProgressEp) {
          candEp = inProgressEp;
          candTime = inProgressEp.lastWatchedAt
            ? new Date(inProgressEp.lastWatchedAt).getTime()
            : media.lastWatchedAt
            ? new Date(media.lastWatchedAt).getTime()
            : 0;
        }
      }

      // 3. If still no candidate, check if series has any watched episodes and find next unwatched
      if (!candEp && media.kind === 'series') {
        const lastWatchedIndex = allEpisodes.map((e) => e.watched).lastIndexOf(true);
        if (lastWatchedIndex >= 0) {
          const nextUnwatched = allEpisodes.slice(lastWatchedIndex + 1).find((e) => !e.watched);
          if (nextUnwatched) {
            const lastWatchedEp = allEpisodes[lastWatchedIndex];
            candEp = nextUnwatched;
            candTime = lastWatchedEp.lastWatchedAt
              ? new Date(lastWatchedEp.lastWatchedAt).getTime()
              : media.lastWatchedAt
              ? new Date(media.lastWatchedAt).getTime()
              : 0;
          }
        }
      }

      if (candEp) {
        // Fallback for candTime if 0
        if (!candTime || isNaN(candTime)) {
          const mediaTimes = [
            media.lastWatchedAt ? new Date(media.lastWatchedAt).getTime() : 0,
            media.updatedAt ? new Date(media.updatedAt).getTime() : 0,
            media.createdAt ? new Date(media.createdAt).getTime() : 0,
          ].filter((t) => !isNaN(t) && t > 0);
          candTime = mediaTimes.length > 0 ? Math.max(...mediaTimes) : 0;
        }

        results.push({ media, continueEpisode: candEp, lastWatchedTime: candTime });
      }
    }

    // Sort strictly descending: newest lastWatchedTime first!
    results.sort((a, b) => b.lastWatchedTime - a.lastWatchedTime);

    return results.map(({ media, continueEpisode }) => ({ media, continueEpisode }));
  }, [library]);

  // Featured Hero Carousel Items (up to 5 items: 1st is most recently watched, then other watched, then popular/top-rated)
  const heroMediaList = useMemo(() => {
    if (!library || library.items.length === 0) return [];

    const list: MediaItem[] = [];
    const addedIds = new Set<string>();

    // 1. The first item is ALWAYS the most recently watched media
    if (continueWatchingItems.length > 0) {
      const first = continueWatchingItems[0].media;
      list.push(first);
      addedIds.add(first.id);
    } else {
      // If no active continue watching, check if any media has lastWatchedAt
      const sortedByWatched = [...library.items]
        .filter((m) => Boolean(m.lastWatchedAt))
        .sort((a, b) => new Date(b.lastWatchedAt!).getTime() - new Date(a.lastWatchedAt!).getTime());
      if (sortedByWatched.length > 0) {
        list.push(sortedByWatched[0]);
        addedIds.add(sortedByWatched[0].id);
      }
    }

    // 2. Next items: other items from continueWatchingItems
    for (const item of continueWatchingItems) {
      if (list.length >= 5) break;
      if (!addedIds.has(item.media.id)) {
        list.push(item.media);
        addedIds.add(item.media.id);
      }
    }

    // 3. Other media in user watch history (episodes marked watched or with progress)
    if (list.length < 5) {
      const otherWatched = [...library.items]
        .filter((m) => !addedIds.has(m.id))
        .map((m) => {
          const watchedCount = m.seasons.reduce(
            (acc, s) => acc + s.episodes.filter((e) => e.watched || e.progressSeconds > 10).length,
            0
          );
          const latestEpTime = Math.max(
            0,
            ...m.seasons
              .flatMap((s) => s.episodes)
              .map((e) => (e.lastWatchedAt ? new Date(e.lastWatchedAt).getTime() : 0))
          );
          const mTime = m.lastWatchedAt ? new Date(m.lastWatchedAt).getTime() : 0;
          return { media: m, watchedCount, sortTime: Math.max(mTime, latestEpTime) };
        })
        .filter((entry) => entry.watchedCount > 0 || entry.sortTime > 0)
        .sort((a, b) => (b.sortTime !== a.sortTime ? b.sortTime - a.sortTime : b.watchedCount - a.watchedCount));

      for (const entry of otherWatched) {
        if (list.length >= 5) break;
        list.push(entry.media);
        addedIds.add(entry.media.id);
      }
    }

    // 4. If fewer than 5, complete with the most popular / highest rated / recent in the library
    if (list.length < 5) {
      const candidates = [...library.items]
        .filter((m) => !addedIds.has(m.id))
        .sort((a, b) => {
          const ratingA = a.rating || 0;
          const ratingB = b.rating || 0;
          if (Math.abs(ratingB - ratingA) > 0.1) return ratingB - ratingA;

          const votesA = a.voteCount || 0;
          const votesB = b.voteCount || 0;
          if (votesB !== votesA) return votesB - votesA;

          const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          return dateB - dateA;
        });

      for (const m of candidates) {
        if (list.length >= 5) break;
        list.push(m);
        addedIds.add(m.id);
      }
    }

    return list;
  }, [library, continueWatchingItems]);

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
    <div className="min-h-screen bg-[#141414] text-neutral-200 selection:bg-[#E50914] selection:text-white pb-28 sm:pb-20">
      {/* Fixed Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenAddModal={handleOpenAddModal}
        onOpenSystemModal={() => setShowSystemModal(true)}
        onOpenTorrentModal={() => setShowTorrentModal(true)}
        onOpenTmdbModal={() => setShowTmdbConfigModal(true)}
        onOpenStorageNodesModal={() => setShowStorageNodesModal(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main Content Area */}
      {activeTab === 'channels' ? (
        <ChannelsPage
          onPlayChannel={(channel, allChannels) => setIptvPlaying({ channel, allChannels })}
          favorites={iptvFavorites}
          onToggleFavorite={handleToggleIptvFavorite}
        />
      ) : library && library.items.length === 0 ? (
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
            Zero nuvem, sem login, com suporte a MP4 nativo, MKV via FFmpeg e player de Torrents P2P.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md">
            <button
              id="empty-add-folder-btn"
              onClick={handleOpenAddModal}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 rounded-lg bg-[#E50914] hover:bg-red-700 text-white font-bold transition-all shadow-xl active:scale-95 text-sm disabled:opacity-75"
            >
              <FolderPlus className="w-5 h-5" />
              <span>Adicionar Pasta do PC</span>
            </button>

            <button
              id="empty-torrent-btn"
              onClick={() => setShowTorrentModal(true)}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-400 font-bold transition-all shadow-xl active:scale-95 text-sm cursor-pointer"
            >
              <span>🧲 Abrir Link Magnet / Torrent</span>
            </button>
          </div>

          {/* Quick Channels button on empty library */}
          <div className="mt-8">
            <button
              onClick={() => setActiveTab('channels')}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-full bg-red-600/20 border border-red-500/40 hover:bg-red-600/30 text-red-400 hover:text-white text-xs font-bold transition-all"
            >
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              <span>Ou assista canais de TV Ao Vivo via IPTV &rarr;</span>
            </button>
          </div>

          <div className="mt-12 p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 max-w-lg text-left text-xs text-neutral-400 space-y-2">
            <div className="flex items-center space-x-2 text-white font-semibold">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <span>Totalmente Portátil:</span>
            </div>
            <p>
              Todos os dados e progresso ficam guardados no arquivo <strong className="text-white">data/library.json</strong>.
              Você pode copiar essa pasta inteira para um pendrive e abrir dando duplo clique em <strong className="text-white">start.bat</strong>.
            </p>
          </div>

          {/* Mobile Access Instruction Banner on Empty State */}
          <div className="mt-8 w-full max-w-2xl text-left">
            <MobileAccessBanner />
          </div>
        </div>
      ) : (
        /* Populated Library View */
        <>
          {/* Hero Spotlight Carousel */}
          {heroMediaList.length > 0 && !searchQuery && (
            <HeroBanner
              items={heroMediaList}
              onPlayEpisode={handlePlayEpisode}
              onOpenDetails={setActiveMediaDetail}
            />
          )}

          {/* Rows Container */}
          <main className={`relative z-20 ${heroMediaList.length > 0 && !searchQuery ? 'mt-0' : 'pt-28 sm:pt-32 lg:pt-36'}`}>
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
            {seriesItems.length > 0 && activeTab !== 'movie' && (
              <MediaRow
                id="row-series"
                title="Séries de TV"
                items={seriesItems}
                onPlay={handlePlayEpisode}
                onOpenDetails={setActiveMediaDetail}
                variant="backdrop"
              />
            )}

            {/* 3. Filmes Row */}
            {movieItems.length > 0 && activeTab !== 'series' && (
              <MediaRow
                id="row-movies"
                title="Filmes"
                items={movieItems}
                onPlay={handlePlayEpisode}
                onOpenDetails={setActiveMediaDetail}
                variant="backdrop"
              />
            )}

            {/* 4. Todos os Títulos */}
            {activeTab === 'all' && allCards.length > 0 && (
              <MediaRow
                id="row-all-media"
                title={searchQuery ? `Resultados da busca ("${searchQuery}")` : 'Todos os Títulos'}
                items={allCards}
                onPlay={handlePlayEpisode}
                onOpenDetails={setActiveMediaDetail}
                variant="backdrop"
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
          onUpdateBanner={handleUpdateBanner}
          onUpdatePoster={handleUpdatePoster}
          onUpdateKind={handleUpdateKind}
          onRefreshMetadata={handleRefreshMetadata}
          onImportSubtitle={handleImportSubtitle}
          onRemoveImportedSubtitle={handleRemoveImportedSubtitle}
          onSearchOnlineSubtitles={handleSearchOnlineSubtitles}
          onDownloadOnlineSubtitle={handleDownloadOnlineSubtitle}
          onOpenTmdbModal={() => setShowTmdbConfigModal(true)}
        />
      )}

      {/* Video Player Modal */}
      {playingState && (
        <VideoPlayer
          media={playingState.media}
          episode={playingState.episode}
          onClose={() => {
            setPlayingState(null);
            fetchLibrary();
          }}
          onPlayNextEpisode={handlePlayNextEpisode}
          nextEpisode={nextEpisode}
          onPlayPrevEpisode={handlePlayPrevEpisode}
          prevEpisode={prevEpisode}
        />
      )}

      {/* Add Folder Modal */}
      {showAddModal && (
        <AddMediaModal
          initialFolderPath={initialAddFolder}
          onClose={() => {
            setShowAddModal(false);
            setInitialAddFolder('');
          }}
          onAddFolder={handleAddFolder}
          onOpenNodesModal={() => setShowStorageNodesModal(true)}
        />
      )}

      {/* Storage Nodes (Nuvem Privada Multi-PC) Modal */}
      <StorageNodesModal
        isOpen={showStorageNodesModal}
        onClose={() => setShowStorageNodesModal(false)}
        onNodesUpdated={fetchLibrary}
      />

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
          onRefreshLibrary={async () => {
            await handleRescanAll();
            await fetchLibrary();
          }}
          onOpenTmdbModal={() => {
            setShowSystemModal(false);
            setShowTmdbConfigModal(true);
          }}
        />
      )}

      {/* Dedicated TMDb Configuration Modal */}
      {showTmdbConfigModal && (
        <TmdbConfigModal
          onClose={() => setShowTmdbConfigModal(false)}
          onRefreshLibrary={fetchLibrary}
        />
      )}

      {/* Torrent & Magnet Modal */}
      <TorrentModal
        isOpen={showTorrentModal}
        onClose={() => {
          setShowTorrentModal(false);
          fetchLibrary();
        }}
        onPlayTorrent={(status, fileIndex) => {
          setPlayingTorrent({ status, selectedFileIndex: fileIndex });
          fetchLibrary();
        }}
      />

      {/* Torrent Player Modal */}
      {playingTorrent && (
        <TorrentPlayer
          status={playingTorrent.status}
          selectedFileIndex={playingTorrent.selectedFileIndex}
          media={playingTorrent.media}
          onClose={() => {
            setPlayingTorrent(null);
            fetchLibrary();
          }}
          onSelectFile={(fileIndex) => {
            setPlayingTorrent((prev) => (prev ? { ...prev, selectedFileIndex: fileIndex } : null));
          }}
        />
      )}

      {/* IPTV Live Channel Player Modal */}
      {iptvPlaying && (
        <IptvPlayerModal
          channel={iptvPlaying.channel}
          allChannels={iptvPlaying.allChannels}
          favorites={iptvFavorites}
          onToggleFavorite={handleToggleIptvFavorite}
          onSelectChannel={(newChannel) =>
            setIptvPlaying((prev) => (prev ? { ...prev, channel: newChannel } : null))
          }
          onClose={() => setIptvPlaying(null)}
        />
      )}
    </div>
  );
}
