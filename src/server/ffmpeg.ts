import { spawn, execFile, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { AudioTrackInfo, SubtitleTrackInfo } from '../types';
import { getThumbnailDir } from './storage';

export interface FFprobeData {
  durationSeconds: number;
  videoCodec?: string;
  pixFmt?: string;
  resolution?: string;
  audioTracks: AudioTrackInfo[];
  subtitleTracks: SubtitleTrackInfo[];
}

let cachedFfmpegPath: string | null | undefined = undefined;
let cachedFfprobePath: string | null | undefined = undefined;

// Test if an executable or command name actually exists and can be executed
function testExecutable(binPath: string, arg: string = '-version'): boolean {
  try {
    const result = spawnSync(binPath, [arg], {
      timeout: 3000,
      windowsHide: true,
      stdio: 'ignore',
    });
    return result.status === 0 || (result.error === undefined && result.status !== null);
  } catch {
    return false;
  }
}

// Find portable or system ffmpeg/ffprobe binary paths safely
export function getBinaries(): { ffmpeg: string | null; ffprobe: string | null } {
  if (cachedFfmpegPath !== undefined && cachedFfprobePath !== undefined) {
    return { ffmpeg: cachedFfmpegPath, ffprobe: cachedFfprobePath };
  }

  const isWindows = process.platform === 'win32';
  const rootDir = process.cwd();

  // 1. Candidate paths for FFmpeg
  const ffmpegCandidates: string[] = [];
  if (process.env.FFMPEG_PATH) ffmpegCandidates.push(process.env.FFMPEG_PATH);

  ffmpegCandidates.push(
    path.join(rootDir, 'bin', isWindows ? 'ffmpeg.exe' : 'ffmpeg'),
    path.join(rootDir, 'ffmpeg', 'bin', isWindows ? 'ffmpeg.exe' : 'ffmpeg'),
    path.join(rootDir, 'ffmpeg', isWindows ? 'ffmpeg.exe' : 'ffmpeg'),
    path.join(rootDir, isWindows ? 'ffmpeg.exe' : 'ffmpeg')
  );

  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    // WinGet Links
    if (localAppData) {
      ffmpegCandidates.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'));
      // WinGet Packages folder scan
      try {
        const wingetPkgs = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
        if (fs.existsSync(wingetPkgs)) {
          const dirs = fs.readdirSync(wingetPkgs);
          for (const d of dirs) {
            if (d.toLowerCase().includes('ffmpeg')) {
              const fullPkgDir = path.join(wingetPkgs, d);
              const subItems = fs.readdirSync(fullPkgDir);
              for (const sub of subItems) {
                ffmpegCandidates.push(path.join(fullPkgDir, sub, 'bin', 'ffmpeg.exe'));
                ffmpegCandidates.push(path.join(fullPkgDir, sub, 'ffmpeg.exe'));
              }
            }
          }
        }
      } catch {}
    }

    // Scoop
    if (userProfile) {
      ffmpegCandidates.push(path.join(userProfile, 'scoop', 'shims', 'ffmpeg.exe'));
      ffmpegCandidates.push(path.join(userProfile, 'scoop', 'apps', 'ffmpeg', 'current', 'bin', 'ffmpeg.exe'));
    }

    // Chocolatey
    ffmpegCandidates.push(
      path.join(programData, 'chocolatey', 'bin', 'ffmpeg.exe'),
      path.join(programData, 'chocolatey', 'lib', 'ffmpeg', 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe')
    );

    // Standard root folders
    ffmpegCandidates.push(
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ffmpeg\\ffmpeg.exe',
      path.join(programFiles, 'ffmpeg', 'bin', 'ffmpeg.exe'),
      path.join(programFilesX86, 'ffmpeg', 'bin', 'ffmpeg.exe')
    );
  }

  // 2. Candidate paths for FFprobe
  const ffprobeCandidates: string[] = [];
  if (process.env.FFPROBE_PATH) ffprobeCandidates.push(process.env.FFPROBE_PATH);

  ffprobeCandidates.push(
    path.join(rootDir, 'bin', isWindows ? 'ffprobe.exe' : 'ffprobe'),
    path.join(rootDir, 'ffmpeg', 'bin', isWindows ? 'ffprobe.exe' : 'ffprobe'),
    path.join(rootDir, 'ffmpeg', isWindows ? 'ffprobe.exe' : 'ffprobe'),
    path.join(rootDir, isWindows ? 'ffprobe.exe' : 'ffprobe')
  );

  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    if (localAppData) {
      ffprobeCandidates.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffprobe.exe'));
    }
    if (userProfile) {
      ffprobeCandidates.push(path.join(userProfile, 'scoop', 'shims', 'ffprobe.exe'));
      ffprobeCandidates.push(path.join(userProfile, 'scoop', 'apps', 'ffmpeg', 'current', 'bin', 'ffprobe.exe'));
    }
    ffprobeCandidates.push(
      path.join(programData, 'chocolatey', 'bin', 'ffprobe.exe'),
      path.join(programData, 'chocolatey', 'lib', 'ffmpeg', 'tools', 'ffmpeg', 'bin', 'ffprobe.exe')
    );
    ffprobeCandidates.push(
      'C:\\ffmpeg\\bin\\ffprobe.exe',
      'C:\\ffmpeg\\ffprobe.exe',
      path.join(programFiles, 'ffmpeg', 'bin', 'ffprobe.exe'),
      path.join(programFilesX86, 'ffmpeg', 'bin', 'ffprobe.exe')
    );
  }

  // Check explicit file candidates on disk first
  let resolvedFfmpeg: string | null = null;
  for (const cand of ffmpegCandidates) {
    try {
      if (cand && fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        resolvedFfmpeg = path.resolve(cand);
        break;
      }
    } catch {}
  }

  // If not found in explicit paths, test system PATH
  if (!resolvedFfmpeg) {
    if (testExecutable('ffmpeg')) {
      resolvedFfmpeg = 'ffmpeg';
    }
  }

  let resolvedFfprobe: string | null = null;
  for (const cand of ffprobeCandidates) {
    try {
      if (cand && fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        resolvedFfprobe = path.resolve(cand);
        break;
      }
    } catch {}
  }

  if (!resolvedFfprobe) {
    if (testExecutable('ffprobe')) {
      resolvedFfprobe = 'ffprobe';
    }
  }

  cachedFfmpegPath = resolvedFfmpeg;
  cachedFfprobePath = resolvedFfprobe;

  return { ffmpeg: resolvedFfmpeg, ffprobe: resolvedFfprobe };
}

// Automatically download and install portable FFmpeg for Windows/Linux into ./bin/ folder
export async function downloadAndInstallFFmpeg(): Promise<{ success: boolean; message: string; binaries: { ffmpeg: string | null; ffprobe: string | null } }> {
  const rootDir = process.cwd();
  const binDir = path.join(rootDir, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const psScript = `
$ProgressPreference = 'SilentlyContinue';
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;
$binDir = '${binDir.replace(/\\/g, '\\\\')}';
$zipUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
$zipPath = Join-Path $env:TEMP 'cinelocal_ffmpeg.zip';
$extractDir = Join-Path $env:TEMP 'cinelocal_ffmpeg_extract';

if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue };
if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue };

Write-Output 'DOWNLOADING';
try {
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 180;
} catch {
    # Fallback to Gyan essentials
    $zipUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 180;
}

Write-Output 'EXTRACTING';
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force;

$ffmpegExe = Get-ChildItem -Path $extractDir -Filter 'ffmpeg.exe' -Recurse | Select-Object -First 1;
$ffprobeExe = Get-ChildItem -Path $extractDir -Filter 'ffprobe.exe' -Recurse | Select-Object -First 1;

if ($ffmpegExe) {
    Copy-Item $ffmpegExe.FullName -Destination (Join-Path $binDir 'ffmpeg.exe') -Force;
}
if ($ffprobeExe) {
    Copy-Item $ffprobeExe.FullName -Destination (Join-Path $binDir 'ffprobe.exe') -Force;
}

Remove-Item $zipPath -Force -ErrorAction SilentlyContinue;
Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;
Write-Output 'DONE';
`;

    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { timeout: 300000 },
        (err, stdout, stderr) => {
          invalidateBinariesCache();
          const bins = getBinaries();
          if (bins.ffmpeg) {
            resolve({
              success: true,
              message: 'FFmpeg instalado com sucesso na pasta bin do CineLocal!',
              binaries: bins,
            });
          } else {
            resolve({
              success: false,
              message: `Falha ao baixar FFmpeg: ${err?.message || stderr || stdout || 'Erro desconhecido'}`,
              binaries: bins,
            });
          }
        }
      );
    });
  }

  // Linux / macOS fallback
  invalidateBinariesCache();
  const bins = getBinaries();
  return {
    success: !!bins.ffmpeg,
    message: bins.ffmpeg
      ? 'FFmpeg detectado no sistema.'
      : 'No Linux ou macOS, instale o ffmpeg via terminal (ex: sudo apt install ffmpeg ou brew install ffmpeg).',
    binaries: bins,
  };
}

// Invalidate binary cache to force re-detection
export function invalidateBinariesCache() {
  cachedFfmpegPath = undefined;
  cachedFfprobePath = undefined;
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
        let pixFmt: string | undefined;
        let resolution: string | undefined;
        const audioTracks: AudioTrackInfo[] = [];
        const subtitleTracks: SubtitleTrackInfo[] = [];

        let audioCounter = 0;
        let subCounter = 0;

        for (const stream of streams) {
          if (stream.codec_type === 'video' && !videoCodec) {
            videoCodec = stream.codec_name;
            pixFmt = stream.pix_fmt;
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
          pixFmt,
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
export function isBrowserNativeDirectPlayable(filePath: string, videoCodec?: string, audioCodec?: string, pixFmt?: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4' || ext === '.m4v' || ext === '.webm') {
    const vc = (videoCodec || '').toLowerCase();
    const ac = (audioCodec || '').toLowerCase();
    const pf = (pixFmt || '').toLowerCase();
    // Video: h264 (8-bit yuv420p), vp8, vp9, av1
    // Audio: aac, mp3, opus, vorbis
    const isVGood = !vc || vc === 'h264' || vc === 'vp8' || vc === 'vp9' || vc === 'av1';
    const isAGood = !ac || ac === 'aac' || ac === 'mp3' || ac === 'opus' || ac === 'vorbis';
    const isPixGood = !pf || pf === 'yuv420p';
    return isVGood && isAGood && isPixGood;
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
