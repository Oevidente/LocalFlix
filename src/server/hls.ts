import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { getBinaries } from './ffmpeg';

interface HlsSession {
  sessionId: string;
  mediaId: string;
  episodeId: string;
  audioIndex: number;
  sessionDir: string;
  manifestPath: string;
  process?: ChildProcess;
  createdAt: number;
  lastAccess: number;
  isComplete: boolean;
}

const activeSessions = new Map<string, HlsSession>();

// Root directory for HLS temporary streams
const HLS_BASE_DIR = path.join(os.tmpdir(), 'cinelocal_hls');
if (!fs.existsSync(HLS_BASE_DIR)) {
  fs.mkdirSync(HLS_BASE_DIR, { recursive: true });
}

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of activeSessions.entries()) {
    // 15 minutes of inactivity
    if (now - session.lastAccess > 15 * 60 * 1000) {
      cleanupSession(id);
    }
  }
}, 5 * 60 * 1000);

export function cleanupSession(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  if (session.process && !session.process.killed) {
    try {
      session.process.kill('SIGKILL');
    } catch {}
  }

  activeSessions.delete(sessionId);

  try {
    if (fs.existsSync(session.sessionDir)) {
      fs.rmSync(session.sessionDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[HLS] Error removing directory for session ${sessionId}:`, err);
  }
}

export function findActiveSession(mediaId: string, episodeId: string, audioTrackIndex?: number): HlsSession | undefined {
  if (audioTrackIndex !== undefined) {
    const key = `${mediaId}_${episodeId}_a${audioTrackIndex}`;
    const s = activeSessions.get(key);
    if (s) {
      s.lastAccess = Date.now();
      return s;
    }
  }

  // Fallback to any active session for this media/episode
  for (const session of activeSessions.values()) {
    if (session.mediaId === mediaId && session.episodeId === episodeId) {
      session.lastAccess = Date.now();
      return session;
    }
  }
  return undefined;
}

async function spawnFfmpegHls(
  ffmpegBin: string,
  filePath: string,
  manifestPath: string,
  sessionDir: string,
  audioStreamIndex: number | undefined,
  canCopy: boolean
): Promise<ChildProcess> {
  const args: string[] = [
    '-fflags', '+genpts+discardcorrupt+igndts',
    '-err_detect', 'ignore_err',
    '-i', filePath,
    '-map', '0:V:0?',
  ];

  if (audioStreamIndex !== undefined) {
    args.push('-map', `0:${audioStreamIndex}?`);
  } else {
    args.push('-map', '0:a:0?');
  }

  if (canCopy) {
    args.push(
      '-c:v', 'copy',
      '-bsf:v', 'h264_mp4toannexb'
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
      '-g', '60',
      '-keyint_min', '30'
    );
  }

  args.push(
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-af', 'aresample=async=1000:min_hard_comp=0.100000:first_pts=0',
    '-f', 'hls',
    '-hls_time', '3',
    '-hls_list_size', '0',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', path.join(sessionDir, 'segment_%04d.ts'),
    manifestPath
  );

  return spawn(ffmpegBin, args);
}

export async function getOrCreateHlsSession(
  mediaId: string,
  episodeId: string,
  filePath: string,
  audioStreamIndex: number | undefined,
  audioTrackIndex: number = 0,
  canDirectCopyVideo: boolean = false
): Promise<{ sessionId: string; manifestPath: string; sessionDir: string }> {
  const sessionId = `${mediaId}_${episodeId}_a${audioTrackIndex}`;
  const existing = activeSessions.get(sessionId);

  if (existing && fs.existsSync(existing.manifestPath)) {
    existing.lastAccess = Date.now();
    return {
      sessionId,
      manifestPath: existing.manifestPath,
      sessionDir: existing.sessionDir,
    };
  }

  // Clean up any stale directory for this session
  const sessionDir = path.join(HLS_BASE_DIR, sessionId);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {}
  }
  fs.mkdirSync(sessionDir, { recursive: true });

  const manifestPath = path.join(sessionDir, 'master.m3u8');
  const { ffmpeg } = getBinaries();
  if (!ffmpeg) {
    throw new Error('FFmpeg não encontrado no sistema ou na pasta bin.');
  }

  let proc: ChildProcess;
  let stderrTail = '';
  let hasExited = false;
  let exitCode: number | null = null;

  // Try direct copy first if eligible, otherwise transcode
  try {
    proc = await spawnFfmpegHls(ffmpeg, filePath, manifestPath, sessionDir, audioStreamIndex, canDirectCopyVideo);
  } catch (err: any) {
    throw new Error(`Erro ao iniciar processo FFmpeg: ${err.message}`);
  }

  proc.stderr?.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-1500);
  });

  proc.on('close', (code) => {
    hasExited = true;
    exitCode = code;
    if (code !== 0 && code !== null && !proc.killed) {
      console.warn(`[HLS] FFmpeg exited with code ${code}. Stderr: ${stderrTail.trim()}`);
    }
  });

  proc.on('error', (err) => {
    console.error(`[HLS] Process error for session ${sessionId}:`, err);
  });

  // Wait for the initial manifest file to be generated
  const startTime = Date.now();
  let manifestReady = false;

  while (Date.now() - startTime < 8000) {
    if (fs.existsSync(manifestPath)) {
      try {
        const content = fs.readFileSync(manifestPath, 'utf8');
        if (content.includes('#EXTM3U')) {
          manifestReady = true;
          break;
        }
      } catch {}
    }

    if (hasExited && exitCode !== 0) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  // If copy failed or crashed immediately, attempt fallback to ultrafast transcode
  if ((!manifestReady || (hasExited && exitCode !== 0)) && canDirectCopyVideo) {
    console.warn(`[HLS] Remux copy failed, attempting transcode fallback...`);
    try {
      proc.kill('SIGKILL');
    } catch {}

    stderrTail = '';
    hasExited = false;
    exitCode = null;

    proc = await spawnFfmpegHls(ffmpeg, filePath, manifestPath, sessionDir, audioStreamIndex, false);
    proc.stderr?.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-1500);
    });
    proc.on('close', (code) => {
      hasExited = true;
      exitCode = code;
    });

    const fallbackStart = Date.now();
    while (Date.now() - fallbackStart < 8000) {
      if (fs.existsSync(manifestPath)) {
        try {
          const content = fs.readFileSync(manifestPath, 'utf8');
          if (content.includes('#EXTM3U')) {
            manifestReady = true;
            break;
          }
        } catch {}
      }
      if (hasExited && exitCode !== 0) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Falha ao gerar o fluxo HLS: ${stderrTail.slice(-400)}`);
  }

  const session: HlsSession = {
    sessionId,
    mediaId,
    episodeId,
    audioIndex: audioTrackIndex,
    sessionDir,
    manifestPath,
    process: proc,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    isComplete: false,
  };

  activeSessions.set(sessionId, session);

  return {
    sessionId,
    manifestPath,
    sessionDir,
  };
}
