export interface AudioTrackInfo {
  index: number;
  streamIndex: number;
  codec: string;
  language?: string;
  title?: string;
  channels?: number;
}

export interface SubtitleTrackInfo {
  index: number;
  streamIndex: number;
  codec: string;
  language?: string;
  title?: string;
  isExternal?: boolean;
  filePath?: string;
}

export interface Episode {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  fileName: string;
  filePath: string;
  relativeFilePath?: string;
  extension: string;
  sizeBytes: number;
  durationSeconds: number;
  videoCodec?: string;
  resolution?: string;
  audioTracks: AudioTrackInfo[];
  subtitleTracks: SubtitleTrackInfo[];
  thumbnailPath?: string;
  watched: boolean;
  progressSeconds: number;
  lastWatchedAt?: string;
  selectedAudioIndex?: number;
  selectedSubtitleIndex?: number; // -1 for off
}

export interface Season {
  seasonNumber: number;
  title: string;
  episodes: Episode[];
}

export type MediaKind = 'series' | 'movie';

export interface MediaItem {
  id: string;
  title: string;
  originalTitle?: string;
  kind: MediaKind;
  folderPath: string;
  relativeFolderPath?: string;
  posterPath?: string;
  backdropPath?: string;
  year?: number;
  overview?: string;
  totalEpisodes: number;
  totalSeasons: number;
  seasons: Season[];
  lastWatchedEpisodeId?: string;
  lastWatchedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryData {
  version: number;
  updatedAt: string;
  settings: {
    preferredAudioLanguage: string;
    preferredSubtitleLanguage: string;
    autoPlayNext: boolean;
    relocateDriveLetterMap?: Record<string, string>;
  };
  items: MediaItem[];
}

export interface SystemStatus {
  ffmpegFound: boolean;
  ffmpegPath?: string;
  ffprobeFound: boolean;
  ffprobePath?: string;
  appDir: string;
  dataDir: string;
  libraryPath: string;
  totalItems: number;
  platform: string;
}

export interface BrowseItem {
  name: string;
  path: string;
  isDirectory: boolean;
  hasMediaFiles?: boolean;
}
