import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import {
  readLibrary,
  writeLibrary,
  findMediaItem,
  findEpisode,
  updateEpisodeProgress,
  toggleEpisodeWatched,
  relocateMediaFolder,
  getDataDir,
} from './storage';
import { scanMediaFolder } from './scanner';
import { getBinaries, generateThumbnail, isBrowserNativeDirectPlayable, streamSubtitlesToVtt } from './ffmpeg';
import { BrowseItem, SystemStatus } from '../types';

export const apiRouter = Router();

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
            }
          }
        }
      }
      mediaItem.lastWatchedEpisodeId = existing.lastWatchedEpisodeId;
      mediaItem.lastWatchedAt = existing.lastWatchedAt;
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
          }
        }
      }
    }
    updatedItem.lastWatchedEpisodeId = media.lastWatchedEpisodeId;
    updatedItem.lastWatchedAt = media.lastWatchedAt;

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
  const forceTranscode = req.query.transcode === 'true';

  const audioTrackIndex = audioTrackParam !== undefined ? parseInt(audioTrackParam, 10) : undefined;
  const seekSeconds = seekParam ? parseFloat(seekParam) : 0;

  // Determine if direct streaming is possible:
  // Direct streaming requires:
  // - No custom seek offset that forces remux
  // - Browser native format (MP4/WebM)
  // - No specific audio track chosen that differs from default (or only 1 track)
  // - Video codec is h264/vp8/vp9/av1
  const directCompatible =
    !forceTranscode &&
    isBrowserNativeDirectPlayable(filePath, episode.videoCodec, episode.audioTracks[0]?.codec) &&
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

  // Seek position before input for fast keyframe seek
  if (seekSeconds > 0) {
    args.push('-ss', seekSeconds.toString());
  }

  args.push('-i', filePath);

  // Map video stream 0
  args.push('-map', '0:v:0');

  // Map chosen audio stream
  if (audioStreamIndex !== undefined) {
    args.push('-map', `0:${audioStreamIndex}`);
  } else {
    args.push('-map', '0:a:0?');
  }

  // Video codec: if already h264/avc, copy directly (very fast, zero CPU degradation)
  // If not h264 (e.g. mpeg2, avi, msmpeg), transcode quickly with libx264
  const isH264 = episode.videoCodec?.toLowerCase().includes('264') || episode.videoCodec?.toLowerCase().includes('avc');
  if (isH264) {
    args.push('-c:v', 'copy');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '24');
  }

  // Audio: always encode to AAC so every browser plays it cleanly
  args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');

  // Fragmented MP4 flags for direct pipe streaming to HTML5 video tag
  args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-cache',
    'Transfer-Encoding': 'chunked',
  });

  const proc = spawn(ffmpeg, args);
  proc.stdout.pipe(res);

  proc.stderr.on('data', () => {}); // silence log

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

// 9. Subtitles (Internal stream or External file converted to WebVTT)
apiRouter.get('/media/:mediaId/episode/:episodeId/subtitles/:index', (req: Request, res: Response) => {
  const { mediaId, episodeId, index } = req.params;
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
      fs.createReadStream(track.filePath).pipe(res);
      return;
    }

    if (ext === '.srt') {
      try {
        const raw = fs.readFileSync(track.filePath, 'utf-8');
        // Convert SRT to WebVTT: replace timestamp comma with dot
        const vttContent = 'WEBVTT\n\n' + raw.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.send(vttContent);
        return;
      } catch {
        // Fallback to ffmpeg below
      }
    }
  }

  // Embedded subtitle stream or complex format via ffmpeg
  const streamIdx = track.streamIndex >= 0 ? track.streamIndex : 0;
  streamSubtitlesToVtt(pair.episode.filePath, streamIdx, res);
});

// 10. Poster image
apiRouter.get('/media/:mediaId/poster', (req: Request, res: Response) => {
  const { mediaId } = req.params;
  const media = findMediaItem(mediaId);
  if (!media) {
    res.status(404).send('Mídia não encontrada');
    return;
  }

  if (media.posterPath && fs.existsSync(media.posterPath)) {
    res.sendFile(media.posterPath);
    return;
  }

  // Fallback: try backdrop or first episode thumbnail
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
