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
  transcoded: boolean;
  sessionDir: string;
  manifestPath: string;
  process?: ChildProcess;
  createdAt: number;
  lastAccess: number;
  isComplete: boolean;
}

const activeSessions = new Map<string, HlsSession>();
const inFlightSessions = new Map<string, Promise<{ sessionId: string; manifestPath: string; sessionDir: string }>>();

// Root directory for HLS temporary streams
const HLS_BASE_DIR = path.join(os.tmpdir(), 'cinelocal_hls');
if (!fs.existsSync(HLS_BASE_DIR)) {
  try {
    fs.mkdirSync(HLS_BASE_DIR, { recursive: true });
  } catch {}
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

export function findActiveSession(
  mediaId: string,
  episodeId: string,
  audioTrackIndex?: number,
  transcoded = false
): HlsSession | undefined {
  if (audioTrackIndex !== undefined) {
    const key = `${mediaId}_${episodeId}_a${audioTrackIndex}${transcoded ? '_t' : ''}`;
    const s = activeSessions.get(key);
    if (s) {
      s.lastAccess = Date.now();
      return s;
    }

    // A requested audio track must never fall back to another track's
    // session. Doing so silently locks playback to whichever audio session
    // happened to be created first.
    return undefined;
  }

  // Fallback to any active session for this media/episode
  for (const session of activeSessions.values()) {
    if (
      session.mediaId === mediaId &&
      session.episodeId === episodeId &&
      session.transcoded === transcoded
    ) {
      session.lastAccess = Date.now();
      return session;
    }
  }
  return undefined;
}

function spawnFfmpegHls(
  ffmpegBin: string,
  filePath: string,
  manifestPath: string,
  sessionDir: string,
  audioStreamIndex: number | undefined,
  canCopy: boolean
): ChildProcess {
  const args: string[] = [
    // This is a local file, not a live input. `nobuffer` disables the demuxer
    // reordering/buffering that MKV/H.264 needs and can produce uneven PTS.
    '-fflags', '+genpts+discardcorrupt+igndts',
    '-err_detect', 'ignore_err',
    '-analyzeduration', '20M',
    '-probesize', '20M',
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
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-keyint_min', '30',
      '-sc_threshold', '0',
      '-threads', '0'
    );
  }

  args.push(
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-af', 'aresample=async=1000:min_hard_comp=0.100000:first_pts=0',
    '-avoid_negative_ts', 'make_zero',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    // Never expose a playlist/segment while FFmpeg is still writing it.
    '-hls_flags', 'independent_segments+temp_file',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', path.join(sessionDir, 'segment_%04d.ts'),
    manifestPath
  );

  const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });

  // Attach immediate error handler on ChildProcess to prevent unhandled 'error' event crash
  proc.on('error', (err) => {
    console.error(`[HLS Server Error] FFmpeg spawn error (${ffmpegBin}):`, err);
  });
  return proc;
}

export async function getOrCreateHlsSession(
  mediaId: string,
  episodeId: string,
  filePath: string,
  audioStreamIndex: number | undefined,
  audioTrackIndex: number = 0,
  canDirectCopyVideo: boolean = false,
  forceTranscode = false
): Promise<{ sessionId: string; manifestPath: string; sessionDir: string }> {
  const transcoded = forceTranscode || !canDirectCopyVideo;
  const sessionId = `${mediaId}_${episodeId}_a${audioTrackIndex}${transcoded ? '_t' : ''}`;
  const existing = activeSessions.get(sessionId);

  if (existing && fs.existsSync(existing.manifestPath)) {
    existing.lastAccess = Date.now();
    return {
      sessionId,
      manifestPath: existing.manifestPath,
      sessionDir: existing.sessionDir,
    };
  }

  if (inFlightSessions.has(sessionId)) {
    return inFlightSessions.get(sessionId)!;
  }

  const sessionPromise = (async () => {
    // Clean up any stale directory for this session
    const sessionDir = path.join(HLS_BASE_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch {}
    }
    try {
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch {}

    const manifestPath = path.join(sessionDir, 'master.m3u8');
    const { ffmpeg } = getBinaries();
    if (!ffmpeg) {
      throw new Error(
        'FFmpeg não encontrado no computador. Para reproduzir arquivos MKV ou transcodificar áudio, instale o FFmpeg ou coloque o executável ffmpeg.exe na pasta "bin" do CineLocal.'
      );
    }

    let proc: ChildProcess;
    let stderrTail = '';
    let hasExited = false;
    let exitCode: number | null = null;
    let spawnError: Error | null = null;

    // A Cast session must always use the H.264/AAC path when transcoding is
    // requested, even if the source video could otherwise be copied.
    const copyVideo = canDirectCopyVideo && !forceTranscode;

    // Try direct copy first if eligible, otherwise transcode
    try {
      proc = spawnFfmpegHls(ffmpeg, filePath, manifestPath, sessionDir, audioStreamIndex, copyVideo);
    } catch (err: any) {
      throw new Error(`Erro ao iniciar processo FFmpeg: ${err.message}`);
    }

    proc.on('error', (err) => {
      spawnError = err;
      console.error(`[HLS] Process error for session ${sessionId}:`, err);
    });

    proc.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-2000);
    });

    proc.on('close', (code) => {
      hasExited = true;
      exitCode = code;
      if (code !== 0 && code !== null && !proc.killed) {
        console.warn(`[HLS Server Warning] FFmpeg finalizou com código ${code}. Stderr:\n${stderrTail.trim()}`);
      }
    });

    // Wait for the initial manifest file to be generated
    const startTime = Date.now();
    let manifestReady = false;

    while (Date.now() - startTime < 8000) {
      if (spawnError) break;

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
    if ((!manifestReady || (hasExited && exitCode !== 0)) && copyVideo && !spawnError) {
      console.warn(`[HLS] Remux copy failed, attempting transcode fallback...`);
      try {
        proc.kill('SIGKILL');
      } catch {}

      stderrTail = '';
      hasExited = false;
      exitCode = null;

      try {
        proc = spawnFfmpegHls(ffmpeg, filePath, manifestPath, sessionDir, audioStreamIndex, false);
        proc.on('error', (err) => {
          spawnError = err;
          console.error(`[HLS Fallback] Process error for session ${sessionId}:`, err);
        });
        proc.stderr?.on('data', (chunk) => {
          stderrTail = (stderrTail + chunk.toString()).slice(-1500);
        });
        proc.on('close', (code) => {
          hasExited = true;
          exitCode = code;
        });

        const fallbackStart = Date.now();
        while (Date.now() - fallbackStart < 8000) {
          if (spawnError) break;
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
      } catch (fallbackErr) {
        console.error('[HLS Fallback] Failed to spawn fallback transcode:', fallbackErr);
      }
    }

    if (!fs.existsSync(manifestPath)) {
      if (spawnError) {
        throw new Error(`Erro ao executar o FFmpeg (${(spawnError as any).message || 'ENOENT'}). Verifique o executável do FFmpeg.`);
      }
      throw new Error(`Falha ao gerar o fluxo HLS: ${stderrTail.slice(-400) || 'FFmpeg encerrou sem gerar arquivo de streaming.'}`);
    }

    const session: HlsSession = {
      sessionId,
      mediaId,
      episodeId,
      audioIndex: audioTrackIndex,
      transcoded,
      sessionDir,
      manifestPath,
      process: proc,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      isComplete: hasExited && exitCode === 0,
    };

    proc.on('close', (code) => {
      if (code === 0) {
        session.isComplete = true;
      }
    });

    activeSessions.set(sessionId, session);

    return {
      sessionId,
      manifestPath,
      sessionDir,
    };
  })();

  inFlightSessions.set(sessionId, sessionPromise);

  try {
    const res = await sessionPromise;
    return res;
  } finally {
    inFlightSessions.delete(sessionId);
  }
}
