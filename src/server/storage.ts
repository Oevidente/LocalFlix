import fs from 'fs';
import path from 'path';
import { LibraryData, MediaItem, Episode } from '../types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const THUMB_DIR = path.join(DATA_DIR, 'thumbnails');

// Ensure data and thumbnail directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(THUMB_DIR)) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
}

export function getThumbnailDir(): string {
  return THUMB_DIR;
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function getLibraryFilePath(): string {
  return LIBRARY_FILE;
}

const DEFAULT_LIBRARY: LibraryData = {
  version: 1,
  updatedAt: new Date().toISOString(),
  settings: {
    preferredAudioLanguage: 'por',
    preferredSubtitleLanguage: 'por',
    autoPlayNext: true,
  },
  items: [],
};

export function readLibrary(): LibraryData {
  try {
    if (!fs.existsSync(LIBRARY_FILE)) {
      writeLibrary(DEFAULT_LIBRARY);
      return DEFAULT_LIBRARY;
    }
    const raw = fs.readFileSync(LIBRARY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as LibraryData;
    if (!parsed.items || !Array.isArray(parsed.items)) {
      parsed.items = [];
    }
    return parsed;
  } catch (error) {
    console.error('Error reading library.json:', error);
    return DEFAULT_LIBRARY;
  }
}

export function writeLibrary(data: LibraryData): void {
  try {
    data.updatedAt = new Date().toISOString();
    const tempFile = `${LIBRARY_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, LIBRARY_FILE);
  } catch (error) {
    console.error('Error writing library.json:', error);
  }
}

export function findMediaItem(id: string): MediaItem | undefined {
  const lib = readLibrary();
  return lib.items.find((item) => item.id === id);
}

export function findEpisode(
  mediaId: string,
  episodeId: string
): { media: MediaItem; episode: Episode } | undefined {
  const media = findMediaItem(mediaId);
  if (!media) return undefined;
  for (const season of media.seasons) {
    const episode = season.episodes.find((ep) => ep.id === episodeId);
    if (episode) {
      return { media, episode };
    }
  }
  return undefined;
}

export function updateEpisodeProgress(
  mediaId: string,
  episodeId: string,
  progressSeconds: number,
  durationSeconds?: number,
  completed?: boolean,
  audioIndex?: number,
  subtitleIndex?: number
): boolean {
  const lib = readLibrary();
  const media = lib.items.find((i) => i.id === mediaId);
  if (!media) return false;

  let found = false;
  for (const season of media.seasons) {
    const ep = season.episodes.find((e) => e.id === episodeId);
    if (ep) {
      ep.progressSeconds = Math.max(0, Math.floor(progressSeconds));
      if (durationSeconds && durationSeconds > 0) {
        ep.durationSeconds = durationSeconds;
      }
      if (completed !== undefined) {
        ep.watched = completed;
      } else if (ep.durationSeconds > 0 && ep.progressSeconds >= ep.durationSeconds * 0.9) {
        ep.watched = true;
      }
      if (audioIndex !== undefined) {
        ep.selectedAudioIndex = audioIndex;
      }
      if (subtitleIndex !== undefined) {
        ep.selectedSubtitleIndex = subtitleIndex;
      }
      ep.lastWatchedAt = new Date().toISOString();
      media.lastWatchedEpisodeId = ep.id;
      media.lastWatchedAt = ep.lastWatchedAt;
      media.updatedAt = new Date().toISOString();
      found = true;
      break;
    }
  }

  if (found) {
    writeLibrary(lib);
  }
  return found;
}

export function toggleEpisodeWatched(mediaId: string, episodeId: string, watched?: boolean): boolean {
  const lib = readLibrary();
  const media = lib.items.find((i) => i.id === mediaId);
  if (!media) return false;

  for (const season of media.seasons) {
    const ep = season.episodes.find((e) => e.id === episodeId);
    if (ep) {
      ep.watched = watched !== undefined ? watched : !ep.watched;
      if (ep.watched && ep.durationSeconds > 0) {
        ep.progressSeconds = ep.durationSeconds;
      } else if (!ep.watched) {
        ep.progressSeconds = 0;
      }
      writeLibrary(lib);
      return true;
    }
  }
  return false;
}

export function relocateMediaFolder(mediaId: string, newFolderPath: string): { success: boolean; message: string } {
  const lib = readLibrary();
  const media = lib.items.find((i) => i.id === mediaId);
  if (!media) return { success: false, message: 'Mídia não encontrada' };

  if (!fs.existsSync(newFolderPath)) {
    return { success: false, message: `Pasta não existe: ${newFolderPath}` };
  }

  const oldFolder = media.folderPath;
  media.folderPath = newFolderPath;
  media.updatedAt = new Date().toISOString();

  // Update paths for all episodes if they were located inside the oldFolder
  for (const season of media.seasons) {
    for (const ep of season.episodes) {
      if (ep.filePath.startsWith(oldFolder)) {
        const subPath = ep.filePath.slice(oldFolder.length).replace(/^[/\\]+/, '');
        ep.filePath = path.join(newFolderPath, subPath);
      } else {
        // Match by filename inside the new folder
        const candidate = path.join(newFolderPath, ep.fileName);
        if (fs.existsSync(candidate)) {
          ep.filePath = candidate;
        }
      }
    }
  }

  writeLibrary(lib);
  return { success: true, message: 'Pasta relocalizada com sucesso' };
}
