import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { AudioTrackInfo, SubtitleTrackInfo } from '../types';
import { getThumbnailDir } from './storage';

export interface FFprobeData {
  durationSeconds: number;
  videoCodec?: string;
  resolution?: string;
  audioTracks: AudioTrackInfo[];
  subtitleTracks: SubtitleTrackInfo[];
}

// Find portable or system ffmpeg/ffprobe binary paths
export function getBinaries(): { ffmpeg: string | null; ffprobe: string | null } {
  const isWindows = process.platform === 'win32';
  const rootDir = process.cwd();

  const ffmpegCandidates = [
    path.join(rootDir, 'bin', isWindows ? 'ffmpeg.exe' : 'ffmpeg'),
    path.join(rootDir, isWindows ? 'ffmpeg.exe' : 'ffmpeg'),
    isWindows ? 'ffmpeg.exe' : 'ffmpeg',
  ];

  const ffprobeCandidates = [
    path.join(rootDir, 'bin', isWindows ? 'ffprobe.exe' : 'ffprobe'),
    path.join(rootDir, isWindows ? 'ffprobe.exe' : 'ffprobe'),
    isWindows ? 'ffprobe.exe' : 'ffprobe',
  ];

  let resolvedFfmpeg: string | null = null;
  for (const cand of ffmpegCandidates) {
    if (path.isAbsolute(cand) && fs.existsSync(cand)) {
      resolvedFfmpeg = cand;
      break;
    }
  }
  if (!resolvedFfmpeg) {
    resolvedFfmpeg = 'ffmpeg';
  }

  let resolvedFfprobe: string | null = null;
  for (const cand of ffprobeCandidates) {
    if (path.isAbsolute(cand) && fs.existsSync(cand)) {
      resolvedFfprobe = cand;
      break;
    }
  }
  if (!resolvedFfprobe) {
    resolvedFfprobe = 'ffprobe';
  }

  return { ffmpeg: resolvedFfmpeg, ffprobe: resolvedFfprobe };
}

// Probe a media file with ffprobe
export async function probeMedia(filePath: string): Promise<FFprobeData> {
  const { ffprobe } = getBinaries();

  const fallbackData: FFprobeData = {
    durationSeconds: 0,
    videoCodec: undefined,
    resolution: undefined,
    audioTracks: [],
    subtitleTracks: [],
  };

  if (!ffprobe || !fs.existsSync(filePath)) {
    return fallbackData;
  }

  return new Promise((resolve) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    execFile(ffprobe, args, { timeout: 15000 }, (err, stdout) => {
      if (err || !stdout) {
        return resolve(fallbackData);
      }

      try {
        const data = JSON.parse(stdout);
        const format = data.format || {};
        const streams = Array.isArray(data.streams) ? data.streams : [];

        let durationSeconds = 0;
        if (format.duration) {
          durationSeconds = Math.floor(parseFloat(format.duration));
        }

        let videoCodec: string | undefined;
        let resolution: string | undefined;
        const audioTracks: AudioTrackInfo[] = [];
        const subtitleTracks: SubtitleTrackInfo[] = [];

        let audioCounter = 0;
        let subCounter = 0;

        for (const stream of streams) {
          if (stream.codec_type === 'video' && !videoCodec) {
            videoCodec = stream.codec_name;
            if (stream.width && stream.height) {
              resolution = `${stream.width}x${stream.height}`;
            }
            if (!durationSeconds && stream.duration) {
              durationSeconds = Math.floor(parseFloat(stream.duration));
            }
          } else if (stream.codec_type === 'audio') {
            const tags = stream.tags || {};
            const lang = tags.language || tags.LANGUAGE || 'und';
            const title = tags.title || tags.handler_name || `Faixa ${audioCounter + 1}`;
            audioTracks.push({
              index: audioCounter++,
              streamIndex: stream.index,
              codec: stream.codec_name || 'unknown',
              language: lang,
              title: `${title} (${lang.toUpperCase()})`,
              channels: stream.channels || 2,
            });
          } else if (stream.codec_type === 'subtitle') {
            const tags = stream.tags || {};
            const lang = tags.language || tags.LANGUAGE || 'und';
            const title = tags.title || tags.handler_name || `Legenda ${subCounter + 1}`;
            subtitleTracks.push({
              index: subCounter++,
              streamIndex: stream.index,
              codec: stream.codec_name || 'unknown',
              language: lang,
              title: `${title} (${lang.toUpperCase()})`,
              isExternal: false,
            });
          }
        }

        resolve({
          durationSeconds,
          videoCodec,
          resolution,
          audioTracks,
          subtitleTracks,
        });
      } catch (parseErr) {
        console.error('Error parsing ffprobe output:', parseErr);
        resolve(fallbackData);
      }
    });
  });
}

// Generate thumbnail at given second
export async function generateThumbnail(filePath: string, timeSec: number = 10): Promise<string | null> {
  const { ffmpeg } = getBinaries();
  if (!ffmpeg || !fs.existsSync(filePath)) return null;

  const hash = Buffer.from(filePath).toString('base64url').slice(0, 32);
  const outPath = path.join(getThumbnailDir(), `thumb_${hash}.jpg`);

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
    return outPath;
  }

  return new Promise((resolve) => {
    const args = [
      '-ss', Math.max(1, timeSec).toString(),
      '-i', filePath,
      '-vframes', '1',
      '-q:v', '3',
      '-vf', 'scale=640:-1',
      '-y',
      outPath,
    ];

    execFile(ffmpeg, args, { timeout: 10000 }, (err) => {
      if (err || !fs.existsSync(outPath)) {
        resolve(null);
      } else {
        resolve(outPath);
      }
    });
  });
}

// Check if file is direct-playable in standard browser without transcoding
export function isBrowserNativeDirectPlayable(filePath: string, videoCodec?: string, audioCodec?: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4' || ext === '.m4v' || ext === '.webm') {
    const vc = (videoCodec || '').toLowerCase();
    const ac = (audioCodec || '').toLowerCase();
    // Video: h264, vp8, vp9, av1
    // Audio: aac, mp3, opus, vorbis
    const isVGood = !vc || vc === 'h264' || vc === 'vp8' || vc === 'vp9' || vc === 'av1';
    const isAGood = !ac || ac === 'aac' || ac === 'mp3' || ac === 'opus' || ac === 'vorbis';
    return isVGood && isAGood;
  }
  return false;
}

// Stream subtitle as WebVTT (either from internal stream via ffmpeg or external file)
export function streamSubtitlesToVtt(filePath: string, streamIndex: number, res: any): void {
  const { ffmpeg } = getBinaries();
  if (!ffmpeg || !fs.existsSync(filePath)) {
    res.status(404).send('Arquivo de vídeo ou ffmpeg não encontrado');
    return;
  }

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');

  const args = [
    '-i', filePath,
    '-map', `0:${streamIndex}`,
    '-f', 'webvtt',
    'pipe:1',
  ];

  const proc = spawn(ffmpeg, args);
  proc.stdout.pipe(res);

  proc.stderr.on('data', () => {}); // silence or debug
  proc.on('error', (err) => {
    console.error('Subtitle extraction error:', err);
    if (!res.headersSent) {
      res.status(500).send('Erro ao extrair legenda');
    }
  });

  res.on('close', () => {
    try {
      proc.kill('SIGKILL');
    } catch {}
  });
}
