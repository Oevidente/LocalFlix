import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Episode, MediaItem, OnlineSubtitleOption, SubtitleTrackInfo } from '../types';
import { getDataDir } from './storage';

const DEFAULT_API_ORIGIN = 'https://api.opensubtitles.com';
const APP_USER_AGENT = 'CineLocal/0.2';
const REQUEST_TIMEOUT_MS = 15_000;

interface OpenSubtitlesSession {
  token: string;
  origin: string;
}

interface OpenSubtitlesFile {
  file_id: number;
  file_name?: string;
  cd_number?: number;
}

interface OpenSubtitlesAttributes {
  language?: string;
  language_name?: string;
  release?: string;
  fps?: number;
  hearing_impaired?: boolean;
  download_count?: number;
  feature_details?: {
    movie_name?: string;
    movie_year?: number;
    season_number?: number;
    episode_number?: number;
  };
  files?: OpenSubtitlesFile[];
}

interface OpenSubtitlesResult {
  id: string;
  attributes?: OpenSubtitlesAttributes;
}

interface OpenSubtitlesSearchResponse {
  data?: OpenSubtitlesResult[];
}

interface OpenSubtitlesLoginResponse {
  token?: string;
  base_url?: string;
}

interface OpenSubtitlesDownloadResponse {
  link?: string;
  file_name?: string;
  message?: string;
}

let cachedSession: OpenSubtitlesSession | null = null;

function getApiKey(): string | undefined {
  return process.env.OPENSUBTITLES_API_KEY?.trim() || undefined;
}

function getUsername(): string | undefined {
  return process.env.OPENSUBTITLES_USERNAME?.trim() || undefined;
}

function getPassword(): string | undefined {
  return process.env.OPENSUBTITLES_PASSWORD || undefined;
}

export function isOpenSubtitlesConfigured(): boolean {
  return Boolean(getApiKey());
}

function normalizeLanguage(language: string): string {
  const value = language.trim().toLowerCase();
  if (value === 'por' || value === 'pt' || value === 'pt-br' || value === 'pt_br') return 'pt-br';
  if (value === 'eng') return 'en';
  return value || 'pt-br';
}

function apiOrigin(value?: string): string {
  if (!value) return DEFAULT_API_ORIGIN;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/$/, '').replace(/\/api\/v1$/i, '');
}

function makeApiUrl(origin: string, endpoint: string): string {
  return `${apiOrigin(origin)}/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

async function requestOpenSubtitles<T>(
  endpoint: string,
  init: RequestInit = {},
  requireLogin = false
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('OpenSubtitles não configurado. Defina OPENSUBTITLES_API_KEY.');
  }

  const session = requireLogin ? await ensureSession() : cachedSession;
  const headers = new Headers(init.headers);
  headers.set('Api-Key', apiKey);
  headers.set('User-Agent', process.env.OPENSUBTITLES_USER_AGENT?.trim() || APP_USER_AGENT);
  headers.set('Accept', 'application/json');
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(makeApiUrl(session?.origin || DEFAULT_API_ORIGIN, endpoint), {
    ...init,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    let message = `OpenSubtitles respondeu HTTP ${response.status}`;
    try {
      const errorBody = await response.json() as { message?: string };
      if (errorBody.message) message = errorBody.message;
    } catch {}
    throw new Error(message);
  }
  return await response.json() as T;
}

async function ensureSession(): Promise<OpenSubtitlesSession> {
  if (cachedSession?.token) return cachedSession;

  const username = getUsername();
  const password = getPassword();
  if (!username || !password) {
    throw new Error('Para baixar legendas, configure OPENSUBTITLES_USERNAME e OPENSUBTITLES_PASSWORD.');
  }

  const response = await requestOpenSubtitles<OpenSubtitlesLoginResponse>('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!response.token) throw new Error('OpenSubtitles não retornou um token de sessão.');

  cachedSession = {
    token: response.token,
    origin: apiOrigin(response.base_url),
  };
  return cachedSession;
}

export function clearOpenSubtitlesSession(): void {
  cachedSession = null;
}

function safeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'legenda';
}

function resultToOption(result: OpenSubtitlesResult): OnlineSubtitleOption | null {
  const attributes = result.attributes || {};
  const file = attributes.files?.[0];
  if (!file || !Number.isFinite(Number(file.file_id))) return null;
  return {
    id: result.id,
    fileId: Number(file.file_id),
    language: attributes.language || 'und',
    languageName: attributes.language_name,
    release: attributes.release,
    fileName: file.file_name,
    fps: typeof attributes.fps === 'number' ? attributes.fps : undefined,
    hearingImpaired: attributes.hearing_impaired,
    downloadCount: attributes.download_count,
  };
}

export async function searchOnlineSubtitles(
  media: MediaItem,
  episode: Episode,
  language = 'pt-br'
): Promise<OnlineSubtitleOption[]> {
  const params = new URLSearchParams();
  params.set('languages', normalizeLanguage(language));
  params.set('type', media.kind === 'series' ? 'episode' : 'movie');
  params.set('query', media.kind === 'series' ? media.title : media.title);
  if (media.year) params.set('year', String(media.year));
  if (media.kind === 'series') {
    params.set('season_number', String(episode.seasonNumber));
    params.set('episode_number', String(episode.episodeNumber));
  }

  const response = await requestOpenSubtitles<OpenSubtitlesSearchResponse>(`/subtitles?${params.toString()}`);
  return (response.data || [])
    .map(resultToOption)
    .filter((option): option is OnlineSubtitleOption => !!option)
    .slice(0, 20);
}

async function downloadBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Download da legenda falhou com HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
    throw new Error('O arquivo de legenda baixado possui tamanho inválido.');
  }
  return bytes;
}

export async function downloadOnlineSubtitle(
  media: MediaItem,
  episode: Episode,
  option: OnlineSubtitleOption
): Promise<SubtitleTrackInfo> {
  const response = await requestOpenSubtitles<OpenSubtitlesDownloadResponse>('/download', {
    method: 'POST',
    body: JSON.stringify({
      file_id: option.fileId,
      sub_format: 'srt',
      file_name: option.fileName || `${media.title}.srt`,
    }),
  }, true);
  if (!response.link) throw new Error(response.message || 'OpenSubtitles não retornou um link de download.');

  const content = await downloadBytes(response.link);
  const hash = crypto.createHash('sha1').update(String(option.fileId)).digest('hex').slice(0, 12);
  const directory = path.join(getDataDir(), 'subtitles', media.id, episode.id);
  const baseName = safeFileName(path.basename(response.file_name || option.fileName || `opensubtitles-${hash}.srt`, path.extname(response.file_name || option.fileName || '.srt')));
  const targetPath = path.join(directory, `${baseName || `opensubtitles-${hash}`}.${path.extname(response.file_name || option.fileName || '.srt').replace('.', '') || 'srt'}`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(targetPath, content);

  const nextIndex = Math.max(99, ...episode.subtitleTracks.map((track) => track.index)) + 1;
  return {
    index: nextIndex,
    streamIndex: -1,
    codec: 'srt',
    language: normalizeLanguage(option.language),
    title: `OpenSubtitles${option.release ? ` · ${option.release}` : ''}`,
    isExternal: true,
    isImported: true,
    source: 'opensubtitles',
    filePath: targetPath,
  };
}
