import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MediaItem, Season, Episode, MediaKind, SubtitleTrackInfo } from '../types';
import { probeMedia } from './ffmpeg';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v', '.ts', '.flv', '.wmv']);
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.ass', '.ssa']);
const POSTER_NAMES = ['poster.jpg', 'poster.png', 'folder.jpg', 'folder.png', 'cover.jpg', 'cover.png'];
const BACKDROP_NAMES = ['backdrop.jpg', 'backdrop.png', 'fanart.jpg', 'fanart.png', 'banner.jpg', 'banner.png'];

interface ParsedEpisodeInfo {
  seasonNumber: number;
  episodeNumber: number;
  cleanTitle: string;
}

export function parseEpisodeInfo(fileName: string, fallbackIndex: number): ParsedEpisodeInfo {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');

  // 1. Match S01E02 or s1e2 or S01.E02
  const sxxExxMatch = nameWithoutExt.match(/[Ss](\d{1,2})[\.\s_-]*[Ee](\d{1,3})/);
  if (sxxExxMatch) {
    const season = parseInt(sxxExxMatch[1], 10);
    const episode = parseInt(sxxExxMatch[2], 10);
    const title = cleanEpisodeTitle(nameWithoutExt, sxxExxMatch[0]);
    return {
      seasonNumber: season || 1,
      episodeNumber: episode,
      cleanTitle: title || `Episódio ${episode}`,
    };
  }

  // 2. Match 1x02 or 01x02
  const xMatch = nameWithoutExt.match(/(\d{1,2})[xX](\d{1,3})/);
  if (xMatch) {
    const season = parseInt(xMatch[1], 10);
    const episode = parseInt(xMatch[2], 10);
    const title = cleanEpisodeTitle(nameWithoutExt, xMatch[0]);
    return {
      seasonNumber: season || 1,
      episodeNumber: episode,
      cleanTitle: title || `Episódio ${episode}`,
    };
  }

  // 3. Match "Temporada X ... Episodio Y" or "Season X ... Episode Y"
  const seasonEpisodeMatch = nameWithoutExt.match(/(?:temporada|season)\s*(\d{1,2})[\s\S]*?(?:episodio|episódio|ep|episode)\s*(\d{1,3})/i);
  if (seasonEpisodeMatch) {
    const season = parseInt(seasonEpisodeMatch[1], 10);
    const episode = parseInt(seasonEpisodeMatch[2], 10);
    return {
      seasonNumber: season || 1,
      episodeNumber: episode,
      cleanTitle: `Episódio ${episode}`,
    };
  }

  // 4. Match E02 or EP02 or Episodio 02
  const epOnlyMatch = nameWithoutExt.match(/(?:[Ee][Pp]?|episodio|episódio)\s*[-_.]?\s*(\d{1,3})/i);
  if (epOnlyMatch) {
    const episode = parseInt(epOnlyMatch[1], 10);
    return {
      seasonNumber: 1,
      episodeNumber: episode,
      cleanTitle: `Episódio ${episode}`,
    };
  }

  // 5. Match leading number like "01 - Pilot" or "1. Pilot"
  const leadingNumMatch = nameWithoutExt.match(/^(\d{1,3})[\s\.\-_]+(.*)/);
  if (leadingNumMatch) {
    const episode = parseInt(leadingNumMatch[1], 10);
    const title = cleanEpisodeTitle(leadingNumMatch[2], '');
    return {
      seasonNumber: 1,
      episodeNumber: episode,
      cleanTitle: title || `Episódio ${episode}`,
    };
  }

  return {
    seasonNumber: 1,
    episodeNumber: fallbackIndex,
    cleanTitle: cleanEpisodeTitle(nameWithoutExt, '') || `Vídeo ${fallbackIndex}`,
  };
}

function cleanEpisodeTitle(rawName: string, matchedToken: string): string {
  let cleaned = rawName;
  if (matchedToken) {
    // Keep part after token if it exists
    const idx = cleaned.indexOf(matchedToken);
    if (idx >= 0) {
      cleaned = cleaned.substring(idx + matchedToken.length);
    }
  }

  // Clean release artifacts like [1080p], (720p), x264, WEBRip, etc.
  cleaned = cleaned
    .replace(/[\[\(].*?[\]\)]/g, ' ')
    .replace(/(?:1080p|720p|480p|2160p|4k|bluray|webrip|web-dl|hdtv|x264|x265|hevc|aac|dts|yify|yts)/gi, ' ')
    .replace(/[\._]/g, ' ')
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .trim();

  return cleaned;
}

// Find files recursively
function getAllFiles(dirPath: string, maxDepth = 4, currentDepth = 0): string[] {
  let results: string[] = [];
  if (currentDepth > maxDepth || !fs.existsSync(dirPath)) return results;

  try {
    const list = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of list) {
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        results = results.concat(getAllFiles(fullPath, maxDepth, currentDepth + 1));
      } else {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dirPath}:`, err);
  }

  return results;
}

// Find external subtitles matching an episode file
function findExternalSubtitles(videoPath: string, allFiles: string[]): SubtitleTrackInfo[] {
  const dir = path.dirname(videoPath);
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const subTracks: SubtitleTrackInfo[] = [];

  for (const file of allFiles) {
    if (path.dirname(file) !== dir) continue;
    const ext = path.extname(file).toLowerCase();
    if (!SUBTITLE_EXTENSIONS.has(ext)) continue;

    const subBase = path.basename(file, ext);
    if (subBase.startsWith(baseName) || allFiles.length < 5) {
      // Extract language tag if present (e.g. .pt-BR, .en, .por)
      const langSuffix = subBase.replace(baseName, '').replace(/^[\.\-_]/, '');
      const lang = langSuffix || 'pt';
      const label = langSuffix ? `Legenda Externa (${langSuffix})` : 'Legenda Externa';

      subTracks.push({
        index: 100 + subTracks.length,
        streamIndex: -1,
        codec: ext.replace('.', ''),
        language: lang,
        title: label,
        isExternal: true,
        filePath: file,
      });
    }
  }

  return subTracks;
}

// Regex to identify auxiliary / promotional / sample video files
const AUXILIARY_VIDEO_REGEX = /(^|[\._\-\s])(vinheta|intro|abertura|sample|trailer|teaser|preview|featurette|extra|bonus)([\._\-\s]|$)/i;

export async function scanMediaFolder(folderPath: string, customTitle?: string): Promise<MediaItem> {
  const resolvedPath = path.resolve(folderPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Pasta não encontrada: ${resolvedPath}`);
  }

  const allFiles = getAllFiles(resolvedPath);
  const allVideoFiles = allFiles.filter((f) => VIDEO_EXTENSIONS.has(path.extname(f).toLowerCase()));

  if (allVideoFiles.length === 0) {
    throw new Error(`Nenhum arquivo de vídeo suportado (.mp4, .mkv, .avi, .webm) encontrado em ${resolvedPath}`);
  }

  // Filter out standalone sample/vinheta/intro files if there are primary media files
  let videoFiles = allVideoFiles.filter((f) => !AUXILIARY_VIDEO_REGEX.test(path.basename(f)));
  if (videoFiles.length === 0) {
    // If all were deemed auxiliary, retain them so the folder isn't rejected
    videoFiles = allVideoFiles;
  }

  // Check for poster and backdrop
  let posterPath: string | undefined;
  let backdropPath: string | undefined;

  for (const file of allFiles) {
    const lowerName = path.basename(file).toLowerCase();
    if (!posterPath && POSTER_NAMES.includes(lowerName)) {
      posterPath = file;
    }
    if (!backdropPath && BACKDROP_NAMES.includes(lowerName)) {
      backdropPath = file;
    }
  }

  const folderName = path.basename(resolvedPath);
  const title = customTitle?.trim() || folderName.replace(/[\._]/g, ' ').trim();
  const kind: MediaKind = videoFiles.length <= 1 ? 'movie' : 'series';

  // Process each video file and probe its details
  const parsedEpisodes: { ep: Episode; seasonNum: number }[] = [];
  let epCounter = 1;

  // Sort video files by natural name order
  videoFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  for (const vFile of videoFiles) {
    const fileName = path.basename(vFile);
    const stats = fs.statSync(vFile);
    const parsed = parseEpisodeInfo(fileName, epCounter++);

    // ffprobe inspection
    const probe = await probeMedia(vFile);

    // External subtitles
    const externalSubs = findExternalSubtitles(vFile, allFiles);
    const allSubs = [...probe.subtitleTracks, ...externalSubs];

    const epHash = crypto.createHash('md5').update(vFile).digest('hex').slice(0, 12);
    const epId = `ep_s${parsed.seasonNumber}e${parsed.episodeNumber}_${epHash}`;

    const episode: Episode = {
      id: epId,
      seasonNumber: parsed.seasonNumber,
      episodeNumber: parsed.episodeNumber,
      title: parsed.cleanTitle,
      fileName,
      filePath: vFile,
      extension: path.extname(vFile).toLowerCase(),
      sizeBytes: stats.size,
      durationSeconds: probe.durationSeconds || 0,
      videoCodec: probe.videoCodec,
      pixFmt: probe.pixFmt,
      resolution: probe.resolution,
      audioTracks: probe.audioTracks,
      subtitleTracks: allSubs,
      watched: false,
      progressSeconds: 0,
    };

    parsedEpisodes.push({ ep: episode, seasonNum: parsed.seasonNumber });
  }

  // Group into seasons
  const seasonMap = new Map<number, Episode[]>();
  for (const item of parsedEpisodes) {
    if (!seasonMap.has(item.seasonNum)) {
      seasonMap.set(item.seasonNum, []);
    }
    seasonMap.get(item.seasonNum)!.push(item.ep);
  }

  const sortedSeasonKeys = Array.from(seasonMap.keys()).sort((a, b) => a - b);
  const seasons: Season[] = sortedSeasonKeys.map((sNum) => {
    const eps = seasonMap.get(sNum)!;
    eps.sort((a, b) => a.episodeNumber - b.episodeNumber);
    return {
      seasonNumber: sNum,
      title: `Temporada ${sNum}`,
      episodes: eps,
    };
  });

  const mediaHash = crypto.createHash('md5').update(resolvedPath).digest('hex').slice(0, 16);
  const mediaId = `media_${mediaHash}`;
  const now = new Date().toISOString();

  return {
    id: mediaId,
    title,
    kind,
    folderPath: resolvedPath,
    posterPath,
    backdropPath,
    totalEpisodes: videoFiles.length,
    totalSeasons: seasons.length,
    seasons,
    createdAt: now,
    updatedAt: now,
  };
}
