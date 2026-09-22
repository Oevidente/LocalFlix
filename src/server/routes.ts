import { Router, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, execFile, exec } from 'child_process';
import {
  readLibrary,
  writeLibrary,
  findMediaItem,
  findEpisode,
  updateEpisodeProgress,
  toggleEpisodeWatched,
  relocateMediaFolder,
  updateMediaBanner,
  getDataDir,
} from './storage';
import { scanMediaFolder } from './scanner';
import {
  getBinaries,
  generateThumbnail,
  isBrowserNativeDirectPlayable,
  streamSubtitlesToVtt,
  shiftWebVttTimestamps,
  downloadAndInstallFFmpeg,
} from './ffmpeg';
import { getOrCreateHlsSession, findActiveSession } from './hls';
import { BrowseItem, SystemStatus } from '../types';

export const apiRouter = Router();

const IMPORTED_SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.ass', '.ssa']);
const MAX_IMPORTED_SUBTITLE_BYTES = 10 * 1024 * 1024;

function sanitizeSubtitleFileName(fileName: string, extension: string): string {
  const baseName = path.basename(fileName, path.extname(fileName))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return `${baseName || 'legenda'}${extension}`;
}

function isPathInsideDirectory(filePath: string, directory: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

// 1. Get entire library
apiRouter.get('/library', (req: Request, res: Response) => {
  const lib = readLibrary();
  res.json(lib);
});

// 2. Add and scan a folder
apiRouter.post('/library/add', async (req: Request, res: Response) => {
  try {
    const { folderPath, title } = req.body;
    if (!folderPath) {
      res.status(400).json({ error: 'Caminho da pasta é obrigatório' });
      return;
    }

    const mediaItem = await scanMediaFolder(folderPath, title);
    const lib = readLibrary();

    // Replace if already exists with same folder or ID
    const existingIndex = lib.items.findIndex(
      (item) => item.id === mediaItem.id || item.folderPath === mediaItem.folderPath
    );

    if (existingIndex >= 0) {
      // Preserve watch history and progress from previous scan
      const existing = lib.items[existingIndex];
      for (const newSeason of mediaItem.seasons) {
        const oldSeason = existing.seasons.find((s) => s.seasonNumber === newSeason.seasonNumber);
        if (oldSeason) {
          for (const newEp of newSeason.episodes) {
            const oldEp = oldSeason.episodes.find(
              (e) => e.fileName === newEp.fileName || e.episodeNumber === newEp.episodeNumber
            );
            if (oldEp) {
              newEp.watched = oldEp.watched;
              newEp.progressSeconds = oldEp.progressSeconds;
              newEp.lastWatchedAt = oldEp.lastWatchedAt;
              newEp.selectedAudioIndex = oldEp.selectedAudioIndex;
              newEp.selectedSubtitleIndex = oldEp.selectedSubtitleIndex;
              newEp.subtitleTracks = [
                ...newEp.subtitleTracks,
                ...oldEp.subtitleTracks.filter((track) => track.isImported),
              ];
            }
          }
        }
      }
      mediaItem.lastWatchedEpisodeId = existing.lastWatchedEpisodeId;
      mediaItem.lastWatchedAt = existing.lastWatchedAt;
      if (existing.backdropPath) {
        mediaItem.backdropPath = existing.backdropPath;
      }
      if (existing.posterPath) {
        mediaItem.posterPath = existing.posterPath;
      }
      lib.items[existingIndex] = mediaItem;
    } else {
      lib.items.push(mediaItem);
    }

    writeLibrary(lib);
    res.json({ success: true, item: mediaItem });
  } catch (error: any) {
    console.error('Error adding folder:', error);
    res.status(400).json({ error: error.message || 'Erro ao escanear pasta' });
  }
});

// 3. Rescan existing media item
apiRouter.post('/library/rescan/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const media = findMediaItem(id);
    if (!media) {
      res.status(404).json({ error: 'Mídia não encontrada' });
      return;
    }

    const updatedItem = await scanMediaFolder(media.folderPath, media.title);
    const lib = readLibrary();
    const idx = lib.items.findIndex((i) => i.id === id);

    // Preserve progress
    for (const newSeason of updatedItem.seasons) {
      const oldSeason = media.seasons.find((s) => s.seasonNumber === newSeason.seasonNumber);
      if (oldSeason) {
        for (const newEp of newSeason.episodes) {
          const oldEp = oldSeason.episodes.find((e) => e.fileName === newEp.fileName);
          if (oldEp) {
            newEp.watched = oldEp.watched;
            newEp.progressSeconds = oldEp.progressSeconds;
            newEp.lastWatchedAt = oldEp.lastWatchedAt;
            newEp.subtitleTracks = [
              ...newEp.subtitleTracks,
              ...oldEp.subtitleTracks.filter((track) => track.isImported),
            ];
          }
        }
      }
    }
    updatedItem.lastWatchedEpisodeId = media.lastWatchedEpisodeId;
    updatedItem.lastWatchedAt = media.lastWatchedAt;
    if (media.backdropPath) {
      updatedItem.backdropPath = media.backdropPath;
    }
    if (media.posterPath) {
      updatedItem.posterPath = media.posterPath;
    }

    lib.items[idx] = updatedItem;
    writeLibrary(lib);

    res.json({ success: true, item: updatedItem });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Relocate media folder (e.g. drive letter changed or folder moved)
apiRouter.post('/library/relocate/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { newFolderPath } = req.body;
  if (!newFolderPath) {
    res.status(400).json({ error: 'Novo caminho da pasta é obrigatório' });
    return;
  }
  const result = relocateMediaFolder(id, newFolderPath);
  if (!result.success) {
    res.status(400).json({ error: result.message });
    return;
  }
  res.json(result);
});

// 5. Delete media from library (does not delete video files on disk)
apiRouter.delete('/library/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const lib = readLibrary();
  lib.items = lib.items.filter((item) => item.id !== id);
  writeLibrary(lib);
  res.json({ success: true });
});

// 6. Save progress
apiRouter.post('/library/progress', (req: Request, res: Response) => {
  const { mediaId, episodeId, progressSeconds, durationSeconds, completed, audioIndex, subtitleIndex } = req.body;
  if (!mediaId || !episodeId || progressSeconds === undefined) {
    res.status(400).json({ error: 'Parâmetros insuficientes' });
    return;
  }

  const ok = updateEpisodeProgress(
    mediaId,
    episodeId,
    progressSeconds,
    durationSeconds,
    completed,
    audioIndex,
    subtitleIndex
  );
  res.json({ success: ok });
});

// 7. Toggle watched
apiRouter.post('/library/mark-watched', (req: Request, res: Response) => {
  const { mediaId, episodeId, watched } = req.body;
  if (!mediaId || !episodeId) {
    res.status(400).json({ error: 'mediaId e episodeId são obrigatórios' });
    return;
  }
  const ok = toggleEpisodeWatched(mediaId, episodeId, watched);
  res.json({ success: ok });
});

// 8. Stream video (Direct HTTP 206 Range for native MP4/WebM, or ffmpeg remux/transcode for MKV/audio track)
apiRouter.get('/media/:mediaId/episode/:episodeId/stream', (req: Request, res: Response) => {
  const { mediaId, episodeId } = req.params;
  const pair = findEpisode(mediaId, episodeId);
  if (!pair) {
    res.status(404).send('Episódio não encontrado');
    return;
  }

  const { episode } = pair;
  const filePath = episode.filePath;

  if (!fs.existsSync(filePath)) {
    res.status(404).send(`Arquivo não encontrado no disco: ${filePath}`);
    return;
  }

  const audioTrackParam = req.query.audio as string | undefined;
  const seekParam = req.query.seek as string | undefined;
  const forceTranscode = req.query.transcode === 'true' || req.query.transcode === '1';

  const audioTrackIndex = audioTrackParam !== undefined ? parseInt(audioTrackParam, 10) : undefined;
  const seekSeconds = seekParam ? parseFloat(seekParam) : 0;

  // Determine if direct streaming is possible:
  // Direct streaming requires:
  // - No custom seek offset that forces remux
  // - Browser native format (MP4/WebM)
  // - No specific audio track chosen that differs from default (or only 1 track)
  // - Video codec is h264/vp8/vp9/av1 with 8-bit yuv420p
  const directCompatible =
    !forceTranscode &&
    isBrowserNativeDirectPlayable(filePath, episode.videoCodec, episode.audioTracks[0]?.codec, episode.pixFmt) &&
    (audioTrackIndex === undefined || audioTrackIndex === 0);

  if (directCompatible && !seekParam) {
    // Native HTTP Range 206 streaming
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const mimeType = episode.extension === '.webm' ? 'video/webm' : 'video/mp4';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  // Otherwise: ffmpeg remux / on-the-fly transcode
  const { ffmpeg } = getBinaries();
  if (!ffmpeg) {
    res.status(500).send('FFmpeg não encontrado para transcodificar este formato');
    return;
  }

  const selectedAudio =
    audioTrackIndex !== undefined && episode.audioTracks[audioTrackIndex]
      ? episode.audioTracks[audioTrackIndex]
      : episode.audioTracks[0];

  const audioStreamIndex = selectedAudio ? selectedAudio.streamIndex : undefined;

  const args: string[] = [];

  // Input flags: tolerate corrupt packets, missing PTS and discontinuous timestamps (common in spliced bumpers/vinhetas)
  args.push('-fflags', '+genpts+discardcorrupt+igndts');
  args.push('-err_detect', 'ignore_err');

  // Seek position before input for fast keyframe seek
  if (seekSeconds > 0) {
    args.push('-ss', seekSeconds.toString());
  }

  args.push('-i', filePath);

  // Map real video stream (skipping attached cover images)
  args.push('-map', '0:V:0?');

  // Map chosen audio stream
  if (audioStreamIndex !== undefined) {
    args.push('-map', `0:${audioStreamIndex}`);
  } else {
    args.push('-map', '0:a:0?');
  }

  // Video codec:
  // Stream copy is only safe if:
  // - Not forced transcode
  // - Video codec is H.264 / AVC
  // - Pixel format is standard 8-bit YUV420P (not 10-bit Hi10P, not YUV444P)
  const isH264 = episode.videoCodec?.toLowerCase().includes('264') || episode.videoCodec?.toLowerCase().includes('avc');
  const is10BitOrHighColor = episode.pixFmt && (episode.pixFmt.includes('10') || episode.pixFmt.includes('444') || episode.pixFmt.includes('422'));
  const canDirectCopyVideo = !forceTranscode && isH264 && !is10BitOrHighColor;

  if (canDirectCopyVideo) {
    args.push(
      '-c:v', 'copy',
      '-bsf:v', 'dump_extra'
    );
  } else {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',
      '-level', '3.1',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-g', '30',
      '-keyint_min', '30'
    );
  }

  // Audio: always encode to AAC with async audio resampling so bumper/vinheta timestamp jumps don't desync or crash FFmpeg
  args.push(
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-af', 'aresample=async=1000:min_hard_comp=0.100000:first_pts=0'
  );

  // Fragmented MP4 flags for direct pipe streaming to HTML5 video player
  args.push(
    '-max_muxing_queue_size', '4096',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', 'frag_keyframe+default_base_moof+negative_cts_offsets',
    '-f', 'mp4',
    'pipe:1'
  );

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
  });

  const proc = spawn(ffmpeg, args);
  proc.stdout.pipe(res);

  let stderrTail = '';
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrTail = (stderrTail + text).slice(-1000);
  });

  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[FFmpeg] Stream exited with code ${code}. Stderr snippet: ${stderrTail.trim()}`);
    }
  });

  proc.on('error', (err) => {
    console.error('FFmpeg streaming error:', err);
    if (!res.headersSent) {
      res.status(500).send('Erro no streaming ffmpeg');
    }
  });

  res.on('close', () => {
    try {
      proc.kill('SIGKILL');
    } catch {}
  });
});

// 8.1 HLS Streaming (M3U8 Manifest and TS Segments for MKV & Transcoded streams)
apiRouter.get('/media/:mediaId/episode/:episodeId/hls/:file', async (req: Request, res: Response) => {
  const { mediaId, episodeId, file } = req.params;
  const audioTrackParam = req.query.audio as string | undefined;
  const parsedAudioTrack = audioTrackParam !== undefined ? parseInt(audioTrackParam, 10) : 0;
  const audioTrackIndex = Number.isInteger(parsedAudioTrack) && parsedAudioTrack >= 0 ? parsedAudioTrack : 0;
  const seekParam = req.query.seek as string | undefined;
  const parsedSeek = seekParam !== undefined ? parseFloat(seekParam) : 0;
  const seekSeconds = Number.isFinite(parsedSeek) && parsedSeek > 0 ? parsedSeek : 0;
  const castMode = req.query.cast === 'true' || req.query.cast === '1';
  const forceTranscode = castMode || req.query.transcode === 'true' || req.query.transcode === '1';

  const pair = findEpisode(mediaId, episodeId);
  if (!pair) {
    console.warn(`[HLS Route] Episódio não encontrado para mediaId=${mediaId}, epId=${episodeId}`);
    res.status(404).send('Episódio não encontrado');
    return;
  }

  const { episode } = pair;
  const filePath = episode.filePath;
  if (!fs.existsSync(filePath)) {
    console.warn(`[HLS Route] Arquivo não existe no disco: ${filePath}`);
    res.status(404).send(`Arquivo não encontrado: ${filePath}`);
    return;
  }

  const selectedAudio = episode.audioTracks[audioTrackIndex] || episode.audioTracks[0];
  const audioStreamIndex = selectedAudio ? selectedAudio.streamIndex : undefined;

  const isH264 = !!(episode.videoCodec?.toLowerCase().includes('264') || episode.videoCodec?.toLowerCase().includes('avc'));
  const is10BitOrHighColor = !!(episode.pixFmt && (episode.pixFmt.includes('10') || episode.pixFmt.includes('444') || episode.pixFmt.includes('422')));
  const canDirectCopyVideo = Boolean(!forceTranscode && isH264 && !is10BitOrHighColor);
  // Keep direct-copy and transcode sessions separate. Otherwise a recovery
  // request with `transcode=1` can accidentally reuse the broken copy session.
  const isTranscodedSession = forceTranscode || !canDirectCopyVideo;

  try {
    let sessionDir: string;
    let manifestPath: string;

    const existingSession = findActiveSession(
      mediaId,
      episodeId,
      audioTrackIndex,
      isTranscodedSession,
      seekSeconds
    );

    if (existingSession && fs.existsSync(existingSession.manifestPath)) {
      existingSession.lastAccess = Date.now();
      sessionDir = existingSession.sessionDir;
      manifestPath = existingSession.manifestPath;
    } else {
      const created = await getOrCreateHlsSession(
        mediaId,
        episodeId,
        filePath,
        audioStreamIndex,
        audioTrackIndex,
        canDirectCopyVideo,
        forceTranscode,
        seekSeconds
      );
      sessionDir = created.sessionDir;
      manifestPath = created.manifestPath;
    }

    const targetFile = file === 'master.m3u8' ? manifestPath : path.join(sessionDir, file);

    // If requesting a segment that FFmpeg is still generating, wait up to 25 seconds
    if (!fs.existsSync(targetFile)) {
      const startWait = Date.now();
      while (Date.now() - startWait < 25000 && !fs.existsSync(targetFile)) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!fs.existsSync(targetFile)) {
        const availableFiles = fs.existsSync(sessionDir) ? fs.readdirSync(sessionDir).join(', ') : 'dir_not_found';
        console.error(`[HLS Route ERROR] Segmento ${file} não foi gerado em 25s. Arquivos: [${availableFiles}]`);
      }
    }

    if (!fs.existsSync(targetFile)) {
      res.status(404).send('Segmento HLS não encontrado');
      return;
    }

    if (file.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (file.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    if (file === 'master.m3u8') {
      // Query parameters from the playlist URL are not inherited by relative
      // HLS segment URLs. Add the audio/session selector to every segment so
      // each request resolves to the same FFmpeg session as the playlist.
      const segmentQuery = new URLSearchParams({ audio: String(audioTrackIndex) });
      if (seekSeconds > 0) segmentQuery.set('seek', String(seekSeconds));
      if (castMode) segmentQuery.set('cast', '1');
      if (forceTranscode) segmentQuery.set('transcode', '1');
      const manifest = fs.readFileSync(targetFile, 'utf8').replace(
        /^(segment_\d+\.ts)$/gm,
        `$1?${segmentQuery.toString()}`
      );
      res.setHeader('Content-Length', Buffer.byteLength(manifest, 'utf8'));
      res.send(manifest);
      return;
    }

    res.sendFile(path.resolve(targetFile), { dotfiles: 'allow' }, (err: any) => {
      // Hls.js routinely cancels an old manifest request while switching to
      // the refreshed playlist. That is a normal client-side abort, not a
      // server/FFmpeg failure, so do not flood the console with false errors.
      const clientAborted =
        req.destroyed ||
        res.destroyed ||
        ['ECONNABORTED', 'ECONNRESET', 'EPIPE'].includes(err?.code) ||
        /request aborted|connection reset/i.test(err?.message || '');

      if (err && !clientAborted && !res.headersSent) {
        console.warn(`[HLS Route] Failed to send ${file}:`, err.message);
      }
    });
  } catch (err: any) {
    console.error('[HLS Route Exception]:', err);
    if (!res.headersSent) {
      res.status(500).send(`Erro ao preparar streaming HLS: ${err.message}`);
    }
  }
});

// 9. Subtitles (Internal stream or External file converted to WebVTT)
apiRouter.get('/media/:mediaId/episode/:episodeId/subtitles/:index', (req: Request, res: Response) => {
  const { mediaId, episodeId, index } = req.params;
  const parsedOffset = Number(req.query.offset);
  const offsetSeconds = Number.isFinite(parsedOffset) ? parsedOffset : 0;
  const pair = findEpisode(mediaId, episodeId);
  if (!pair) {
    res.status(404).send('Episódio não encontrado');
    return;
  }

  const trackIdx = parseInt(index, 10);
  const track = pair.episode.subtitleTracks.find((t) => t.index === trackIdx);
  if (!track) {
    res.status(404).send('Faixa de legenda não encontrada');
    return;
  }

  // If external subtitle file
  if (track.isExternal && track.filePath && fs.existsSync(track.filePath)) {
    const ext = path.extname(track.filePath).toLowerCase();
    if (ext === '.vtt') {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      if (offsetSeconds === 0) {
        fs.createReadStream(track.filePath).pipe(res);
      } else {
        const raw = fs.readFileSync(track.filePath, 'utf-8');
        res.send(shiftWebVttTimestamps(raw, offsetSeconds));
      }
      return;
    }

    if (ext === '.srt') {
      try {
        const raw = fs.readFileSync(track.filePath, 'utf-8');
        // Convert SRT to WebVTT: replace timestamp comma with dot
        const vttContent = shiftWebVttTimestamps(
          'WEBVTT\n\n' + raw.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'),
          offsetSeconds
        );
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.send(vttContent);
        return;
      } catch {
        // Fallback to ffmpeg below
      }
    }

    // ASS/SSA files are also converted by FFmpeg, but the input must be the
    // external subtitle file rather than the episode video.
    if (ext === '.ass' || ext === '.ssa') {
      streamSubtitlesToVtt(track.filePath, 0, res, offsetSeconds);
      return;
    }
  }

  // Embedded subtitle stream or complex format via ffmpeg
  const streamIdx = track.streamIndex >= 0 ? track.streamIndex : 0;
  streamSubtitlesToVtt(pair.episode.filePath, streamIdx, res, offsetSeconds);
});

// 9.1 Import an external subtitle into the portable application data
apiRouter.post('/media/:mediaId/episode/:episodeId/subtitles/import', (req: Request, res: Response) => {
  const { mediaId, episodeId } = req.params;
  const pair = findEpisode(mediaId, episodeId);
  if (!pair) {
    res.status(404).json({ error: 'Episódio não encontrado' });
    return;
  }

  const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : '';
  const contentBase64 = typeof req.body?.contentBase64 === 'string' ? req.body.contentBase64 : '';
  const extension = path.extname(fileName).toLowerCase();
  if (!fileName || !IMPORTED_SUBTITLE_EXTENSIONS.has(extension)) {
    res.status(400).json({ error: 'Formato de legenda não suportado. Use .srt, .vtt, .ass ou .ssa.' });
    return;
  }
  if (!contentBase64) {
    res.status(400).json({ error: 'O arquivo de legenda está vazio.' });
    return;
  }

  let content: Buffer;
  try {
    content = Buffer.from(contentBase64, 'base64');
  } catch {
    res.status(400).json({ error: 'Conteúdo de legenda inválido.' });
    return;
  }
  if (content.length === 0 || content.length > MAX_IMPORTED_SUBTITLE_BYTES) {
    res.status(400).json({ error: 'A legenda deve ter entre 1 byte e 10 MB.' });
    return;
  }

  const subtitleDirectory = path.join(getDataDir(), 'subtitles', mediaId, episodeId);
  const safeFileName = sanitizeSubtitleFileName(fileName, extension);
  const targetPath = path.join(subtitleDirectory, safeFileName);
  const normalizedTargetPath = path.resolve(targetPath);
  const normalizedDirectory = path.resolve(subtitleDirectory);
  if (!isPathInsideDirectory(normalizedTargetPath, normalizedDirectory)) {
    res.status(400).json({ error: 'Nome de arquivo de legenda inválido.' });
    return;
  }

  try {
    fs.mkdirSync(subtitleDirectory, { recursive: true });
    fs.writeFileSync(normalizedTargetPath, content);

    const existingArrayIndex = pair.episode.subtitleTracks.findIndex(
      (track) => track.isImported && track.filePath && path.resolve(track.filePath) === normalizedTargetPath
    );
    const existingTrack = existingArrayIndex >= 0 ? pair.episode.subtitleTracks[existingArrayIndex] : undefined;
    const nextTrackIndex = existingTrack?.index ?? Math.max(99, ...pair.episode.subtitleTracks.map((track) => track.index)) + 1;
    const importedTrack = {
      index: nextTrackIndex,
      streamIndex: -1,
      codec: extension.slice(1),
      language: typeof req.body?.language === 'string' && req.body.language.trim() ? req.body.language.trim() : 'pt',
      title: `Legenda importada (${path.basename(safeFileName, extension)})`,
      isExternal: true,
      isImported: true,
      filePath: normalizedTargetPath,
    };

    if (existingArrayIndex >= 0) {
      pair.episode.subtitleTracks[existingArrayIndex] = importedTrack;
    } else {
      pair.episode.subtitleTracks.push(importedTrack);
    }

    writeLibrary(readLibrary(), true);
    res.json({ success: true, track: importedTrack });
  } catch (error: any) {
    console.error('[Subtitles] Falha ao importar legenda:', error);
    res.status(500).json({ error: error?.message || 'Não foi possível importar a legenda.' });
  }
});

// 9.2 Remove only subtitles imported into data/subtitles
apiRouter.delete('/media/:mediaId/episode/:episodeId/subtitles/:index', (req: Request, res: Response) => {
  const { mediaId, episodeId } = req.params;
  const trackIndex = Number.parseInt(req.params.index, 10);
  const pair = findEpisode(mediaId, episodeId);
  if (!pair) {
    res.status(404).json({ error: 'Episódio não encontrado' });
    return;
  }

  const arrayIndex = pair.episode.subtitleTracks.findIndex((track) => track.index === trackIndex);
  const track = arrayIndex >= 0 ? pair.episode.subtitleTracks[arrayIndex] : undefined;
  const importedDirectory = path.join(getDataDir(), 'subtitles', mediaId, episodeId);
  if (!track?.isImported || !track.filePath || !isPathInsideDirectory(track.filePath, importedDirectory)) {
    res.status(400).json({ error: 'Somente legendas importadas podem ser removidas.' });
    return;
  }

  try {
    if (fs.existsSync(track.filePath)) fs.rmSync(track.filePath, { force: true });
    pair.episode.subtitleTracks.splice(arrayIndex, 1);
    if (pair.episode.selectedSubtitleIndex !== undefined) {
      if (pair.episode.selectedSubtitleIndex === arrayIndex) {
        pair.episode.selectedSubtitleIndex = -1;
      } else if (pair.episode.selectedSubtitleIndex > arrayIndex) {
        pair.episode.selectedSubtitleIndex -= 1;
      }
    }
    writeLibrary(readLibrary(), true);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Não foi possível remover a legenda.' });
  }
});

// 9.5 Update media banner image by URL
apiRouter.post('/media/:id/banner', (req: Request, res: Response) => {
  const { id } = req.params;
  const { bannerUrl } = req.body;
  const ok = updateMediaBanner(id, typeof bannerUrl === 'string' ? bannerUrl : '');
  if (!ok) {
    res.status(404).json({ error: 'Mídia não encontrada' });
    return;
  }
  const updatedMedia = findMediaItem(id);
  res.json({ success: true, media: updatedMedia });
});

// 10. Poster image
apiRouter.get('/media/:mediaId/poster', (req: Request, res: Response) => {
  const { mediaId } = req.params;
  const media = findMediaItem(mediaId);
  if (!media) {
    res.status(404).send('Mídia não encontrada');
    return;
  }

  // If posterPath is a remote URL, redirect
  if (media.posterPath && (media.posterPath.startsWith('http://') || media.posterPath.startsWith('https://'))) {
    res.redirect(media.posterPath);
    return;
  }

  if (media.posterPath && fs.existsSync(media.posterPath)) {
    res.sendFile(media.posterPath);
    return;
  }

  // Fallback: try backdrop URL or file
  if (media.backdropPath && (media.backdropPath.startsWith('http://') || media.backdropPath.startsWith('https://'))) {
    res.redirect(media.backdropPath);
    return;
  }

  if (media.backdropPath && fs.existsSync(media.backdropPath)) {
    res.sendFile(media.backdropPath);
    return;
  }

  const firstEp = media.seasons[0]?.episodes[0];
  if (firstEp && fs.existsSync(firstEp.filePath)) {
    generateThumbnail(firstEp.filePath, 10).then((thumbPath) => {
      if (thumbPath && fs.existsSync(thumbPath)) {
        res.sendFile(thumbPath);
      } else {
        res.status(404).send('Poster não disponível');
      }
    });
    return;
  }

  res.status(404).send('Poster não encontrado');
});

// 10.5 Backdrop / Banner image
apiRouter.get(['/media/:mediaId/backdrop', '/media/:mediaId/banner'], (req: Request, res: Response) => {
  const { mediaId } = req.params;
  const media = findMediaItem(mediaId);
  if (!media) {
    res.status(404).send('Mídia não encontrada');
    return;
  }

  // If backdropPath is a remote URL, redirect directly
  if (media.backdropPath && (media.backdropPath.startsWith('http://') || media.backdropPath.startsWith('https://'))) {
    res.redirect(media.backdropPath);
    return;
  }

  if (media.backdropPath && fs.existsSync(media.backdropPath)) {
    res.sendFile(media.backdropPath);
    return;
  }

  // Fallback: try poster if available
  if (media.posterPath && (media.posterPath.startsWith('http://') || media.posterPath.startsWith('https://'))) {
    res.redirect(media.posterPath);
    return;
  }

  if (media.posterPath && fs.existsSync(media.posterPath)) {
    res.sendFile(media.posterPath);
    return;
  }

  const firstEp = media.seasons[0]?.episodes[0];
  if (firstEp && fs.existsSync(firstEp.filePath)) {
    generateThumbnail(firstEp.filePath, 15).then((thumbPath) => {
      if (thumbPath && fs.existsSync(thumbPath)) {
        res.sendFile(thumbPath);
      } else {
        res.status(404).send('Banner não disponível');
      }
    });
    return;
  }

  res.status(404).send('Banner não encontrado');
});

// 11. Episode thumbnail
apiRouter.get('/media/:mediaId/episode/:episodeId/thumb', async (req: Request, res: Response) => {
  const { mediaId, episodeId } = req.params;
  const pair = findEpisode(mediaId, episodeId);
  if (!pair) {
    res.status(404).send('Episódio não encontrado');
    return;
  }

  const filePath = pair.episode.filePath;
  if (!fs.existsSync(filePath)) {
    res.status(404).send('Arquivo não encontrado');
    return;
  }

  const targetSec = pair.episode.progressSeconds > 10 ? pair.episode.progressSeconds : 15;
  const thumbPath = await generateThumbnail(filePath, targetSec);

  if (thumbPath && fs.existsSync(thumbPath)) {
    res.sendFile(thumbPath);
  } else {
    res.status(404).send('Miniatura indisponível');
  }
});

// 12. File explorer / Directory Browser
apiRouter.get('/browse', (req: Request, res: Response) => {
  try {
    const queryDir = (req.query.dir as string) || process.cwd();
    const resolvedDir = path.resolve(queryDir);

    if (!fs.existsSync(resolvedDir)) {
      res.status(404).json({ error: 'Diretório não existe' });
      return;
    }

    const items = fs.readdirSync(resolvedDir, { withFileTypes: true });
    const result: BrowseItem[] = [];

    // Add parent entry if not root
    const parent = path.dirname(resolvedDir);
    if (parent !== resolvedDir) {
      result.push({
        name: '..',
        path: parent,
        isDirectory: true,
      });
    }

    for (const item of items) {
      if (item.name.startsWith('.') || item.name === '$RECYCLE.BIN' || item.name === 'node_modules') {
        continue;
      }
      const fullPath = path.join(resolvedDir, item.name);
      try {
        if (item.isDirectory()) {
          // Check if contains video files
          let hasMedia = false;
          try {
            const sub = fs.readdirSync(fullPath);
            hasMedia = sub.some((f) => /\.(mp4|mkv|avi|webm|mov)$/i.test(f));
          } catch {}

          result.push({
            name: item.name,
            path: fullPath,
            isDirectory: true,
            hasMediaFiles: hasMedia,
          });
        }
      } catch {}
    }

    // Sort folders alphabetically
    result.sort((a, b) => {
      if (a.name === '..') return -1;
      if (b.name === '..') return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      currentDir: resolvedDir,
      parentDir: parent !== resolvedDir ? parent : null,
      items: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. System Status
apiRouter.get('/system/status', (req: Request, res: Response) => {
  const { ffmpeg, ffprobe } = getBinaries();
  const lib = readLibrary();

  const status: SystemStatus = {
    ffmpegFound: !!ffmpeg,
    ffmpegPath: ffmpeg || undefined,
    ffprobeFound: !!ffprobe,
    ffprobePath: ffprobe || undefined,
    appDir: process.cwd(),
    dataDir: getDataDir(),
    libraryPath: path.join(getDataDir(), 'library.json'),
    totalItems: lib.items.length,
    platform: process.platform,
  };

  res.json(status);
});

// 13.0.1 LAN addresses used by Chromecast to reach this local server
apiRouter.get('/system/cast-info', (req: Request, res: Response) => {
  const addresses = Object.values(os.networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => {
      const isIpv4 = entry.family === 'IPv4' || String(entry.family) === '4';
      return isIpv4 && !entry.internal && !entry.address.startsWith('169.254.');
    })
    .map((entry) => entry.address);

  res.json({
    protocol: req.app.locals.castMediaProtocol || null,
    port: Number(req.app.locals.castMediaPort) || null,
    addresses: [...new Set(addresses)],
  });
});

// 13.1 Install Portable FFmpeg into ./bin/
apiRouter.post('/system/install-ffmpeg', async (req: Request, res: Response) => {
  try {
    const result = await downloadAndInstallFFmpeg();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao baixar FFmpeg' });
  }
});

// 13.5 Native System Explorer Folder Picker
apiRouter.post('/system/pick-folder', (req: Request, res: Response) => {
  const platform = process.platform;

  if (platform === 'win32') {
    // Windows: Use PowerShell Shell.Application BrowseForFolder dialog
    const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$app = New-Object -ComObject Shell.Application;
$folder = $app.BrowseForFolder(0, 'Selecione a pasta onde estao seus filmes ou series:', 0, 0);
if ($folder -and $folder.Self.Path) {
    [Console]::Out.Write($folder.Self.Path)
}
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 120000, encoding: 'utf-8' },
      (error, stdout, stderr) => {
        if (error) {
          if ((error as any).killed) {
            res.json({ success: false, cancelled: true, message: 'Tempo limite esgotado' });
          } else {
            res.json({ success: false, unsupported: true, error: error.message });
          }
          return;
        }
        const selected = (stdout || '').trim();
        if (!selected) {
          res.json({ success: false, cancelled: true });
          return;
        }
        res.json({ success: true, folderPath: selected });
      }
    );
    return;
  }

  if (platform === 'darwin') {
    // macOS: Use AppleScript native folder chooser
    const script = `POSIX path of (choose folder with prompt "Selecione a pasta onde estao seus filmes ou series:")`;
    execFile('osascript', ['-e', script], { timeout: 120000, encoding: 'utf-8' }, (error, stdout) => {
      if (error) {
        res.json({ success: false, cancelled: true });
        return;
      }
      const selected = (stdout || '').trim();
      if (!selected) {
        res.json({ success: false, cancelled: true });
        return;
      }
      res.json({ success: true, folderPath: selected });
    });
    return;
  }

  if (platform === 'linux') {
    // Linux: check if X11/Wayland display is available
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      res.json({
        success: false,
        unsupported: true,
        message: 'Ambiente gráfico não disponível para abrir explorador nativo',
      });
      return;
    }

    const cmd = `zenity --file-selection --directory --title="Selecione a pasta de midia" 2>/dev/null || kdialog --getexistingdirectory 2>/dev/null`;
    exec(cmd, { timeout: 120000, encoding: 'utf-8' }, (error, stdout) => {
      if (error) {
        res.json({ success: false, cancelled: true });
        return;
      }
      const selected = (stdout || '').trim();
      if (!selected) {
        res.json({ success: false, cancelled: true });
        return;
      }
      res.json({ success: true, folderPath: selected });
    });
    return;
  }

  res.json({
    success: false,
    unsupported: true,
    message: 'Sistema operacional não suportado para explorador nativo',
  });
});

// 14. Demo generator: creates sample MP4 and MKV media in ./demo_media/ so user can test immediately!
apiRouter.post('/system/generate-demo', async (req: Request, res: Response) => {
  const { ffmpeg } = getBinaries();
  if (!ffmpeg) {
    res.status(500).json({ error: 'FFmpeg não disponível para gerar mídia de demonstração' });
    return;
  }

  try {
    const demoDir = path.resolve(process.cwd(), 'demo_media', 'Cosmos - O Infinito');
    if (!fs.existsSync(demoDir)) {
      fs.mkdirSync(demoDir, { recursive: true });
    }

    const ep1 = path.join(demoDir, 'Cosmos.S01E01.A.Grande.Jornada.mp4');
    const ep2 = path.join(demoDir, 'Cosmos.S01E02.As.Estrelas.mkv');
    const poster = path.join(demoDir, 'folder.jpg');

    // Create poster image if not exists
    if (!fs.existsSync(poster)) {
      await new Promise((resolve, reject) => {
        execFile(
          ffmpeg,
          [
            '-f', 'lavfi',
            '-i', 'color=c=0x1a237e:s=600x900:d=1',
            '-vf', "drawtext=text='COSMOS':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=200,drawtext=text='TEMPORADA 1':fontcolor=0xffd700:fontsize=28:x=(w-text_w)/2:y=280",
            '-vframes', '1',
            '-y',
            poster,
          ],
          (err) => (err ? resolve(false) : resolve(true))
        );
      });
    }

    // Create Episode 1 (MP4) - 15s test video with audio
    if (!fs.existsSync(ep1)) {
      await new Promise((resolve) => {
        execFile(
          ffmpeg,
          [
            '-f', 'lavfi',
            '-i', 'testsrc=duration=20:size=1280x720:rate=30',
            '-f', 'lavfi',
            '-i', 'sine=frequency=440:duration=20',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-metadata:s:a:0', 'language=por',
            '-metadata:s:a:0', 'title=Português (Brasil)',
            '-y',
            ep1,
          ],
          (err) => resolve(!err)
        );
      });
    }

    // Create Episode 2 (MKV) - 20s test video with 2 audio tracks and subtitle!
    if (!fs.existsSync(ep2)) {
      await new Promise((resolve) => {
        execFile(
          ffmpeg,
          [
            '-f', 'lavfi',
            '-i', 'smptebars=duration=25:size=1280x720:rate=30',
            '-f', 'lavfi',
            '-i', 'sine=frequency=520:duration=25',
            '-f', 'lavfi',
            '-i', 'sine=frequency=880:duration=25',
            '-map', '0:v',
            '-map', '1:a',
            '-map', '2:a',
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-metadata:s:a:0', 'language=por',
            '-metadata:s:a:0', 'title=Português (Dublado)',
            '-metadata:s:a:1', 'language=eng',
            '-metadata:s:a:1', 'title=Inglês (Original)',
            '-y',
            ep2,
          ],
          (err) => resolve(!err)
        );
      });
    }

    // Scan into library
    const mediaItem = await scanMediaFolder(demoDir, 'Cosmos: O Infinito');
    const lib = readLibrary();
    const existingIdx = lib.items.findIndex((i) => i.id === mediaItem.id);
    if (existingIdx >= 0) {
      lib.items[existingIdx] = mediaItem;
    } else {
      lib.items.push(mediaItem);
    }
    writeLibrary(lib);

    res.json({ success: true, item: mediaItem });
  } catch (err: any) {
    console.error('Error generating demo:', err);
    res.status(500).json({ error: err.message });
  }
});
