import { Injectable } from '@angular/core';

import { showFormat } from './display';
import { matchesGenre } from './genres';
import { LIMITS } from './limits';
import { mapTitle } from './mappers';
import type { ActionResult, CatalogFilters, MediaType, Title } from './models';
import { environment } from '../../environments/environment';
import { isTmdbConfigured, supabase } from './supabase';
import { normalizeText } from './text';
import { clampScore, clipText, isUuid, validateSearch, validateYear } from './validation';

const NETWORK_ERROR = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const SEARCH_LIMIT = 8;
const TMDB_LANGUAGE = 'es-MX';

interface TmdbListItem {
  id?: number;
  media_type?: string;
}

@Injectable({ providedIn: 'root' })
export class TitlesService {
  async listCatalog(filters: CatalogFilters): Promise<ActionResult<{ titles: Title[] }>> {
    if (filters.year !== null) {
      const yearCheck = validateYear(filters.year);
      if (!yearCheck.ok) {
        return { ok: false, error: yearCheck.error ?? 'Año inválido.' };
      }
    }
    const scoreColumn = filters.scoreKind === 'critic' ? 'critic_score' : 'audience_score';
    const minScore = clampScore(filters.minScore);
    let request = supabase.from('titles').select('*');
    const name = clipText(filters.name, LIMITS.search.max).replace(/[%_,]/g, '');
    if (name) {
      request = request.ilike('name', `%${name}%`);
    }
    if (filters.year) {
      const year = String(filters.year);
      request = request
        .gte('release_date', `${year}-01-01`)
        .lte('release_date', `${year}-12-31`);
    }
    if (minScore > 0) {
      request = request.gte(scoreColumn, minScore);
    }
    request =
      filters.sort === 'date'
        ? request.order('release_date', { ascending: false, nullsFirst: false })
        : request.order(scoreColumn, { ascending: false, nullsFirst: false });

    try {
      const { data, error } = await request.limit(80);
      if (error) {
        return { ok: false, error: 'No se pudo leer el catálogo.' };
      }
      const titles = (data ?? [])
        .flatMap((row) => mapTitle(row) ?? [])
        .filter((title) => matchesGenre(title.genres, filters.genre));
      return { ok: true, titles };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }

  async getById(id: string): Promise<ActionResult<{ title: Title }>> {
    if (!isUuid(id)) {
      return { ok: false, error: 'No se encontró el título.' };
    }
    try {
      const { data, error } = await supabase.from('titles').select('*').eq('id', id).maybeSingle();
      if (error || !data) {
        return { ok: false, error: 'No se encontró el título.' };
      }
      const title = mapTitle(data);
      if (!title) {
        return { ok: false, error: 'No se encontró el título.' };
      }
      return { ok: true, title };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }

  async searchAndStore(rawQuery: string): Promise<ActionResult<{ titles: Title[] }>> {
    const query = normalizeText(rawQuery);
    const check = validateSearch(query);
    if (!check.ok) {
      return { ok: false, error: check.error ?? 'Búsqueda inválida.' };
    }
    if (!isTmdbConfigured) {
      return {
        ok: false,
        error: 'Falta TMDB_API_KEY en .env. Guárdala y vuelve a iniciar la app.',
      };
    }

    let results: TmdbListItem[];
    try {
      results = await this.searchTmdb(query);
    } catch (error) {
      return { ok: false, error: messageFrom(error) };
    }

    const jobs: { id: number; mediaType: MediaType }[] = results.flatMap((item) => {
      if (typeof item.id !== 'number' || item.id <= 0) {
        return [];
      }
      const mediaType: MediaType | null =
        item.media_type === 'tv' ? 'tv' : item.media_type === 'movie' ? 'movie' : null;
      return mediaType ? [{ id: item.id, mediaType }] : [];
    });
    let lastError: unknown = null;
    const stored = await pool(jobs, 3, async (job) => {
      try {
        return await this.ensureStored(job.id, job.mediaType);
      } catch (error) {
        lastError = error;
        return null;
      }
    });
    const titles = stored.flatMap((title) => title ?? []);
    if (titles.length === 0) {
      return {
        ok: false,
        error: lastError ? messageFrom(lastError) : 'TMDB no encontró títulos para guardar.',
      };
    }
    return { ok: true, titles };
  }

  async storePopular(): Promise<ActionResult<{ titles: Title[] }>> {
    if (!isTmdbConfigured) {
      return {
        ok: false,
        error: 'Falta TMDB_API_KEY en .env. Guárdala y vuelve a iniciar la app.',
      };
    }
    if (!this.popularTask) {
      this.popularTask = this.loadPopular().finally(() => {
        this.popularTask = null;
      });
    }
    return this.popularTask;
  }

  private popularTask: Promise<ActionResult<{ titles: Title[] }>> | null = null;

  private async loadPopular(): Promise<ActionResult<{ titles: Title[] }>> {
    const titles: Title[] = [];
    try {
      const movies = await this.listPopular('movie');
      const series = await this.listPopular('tv');
      for (const item of [...movies, ...series]) {
        const stored = await this.ensureStored(item.id, item.mediaType);
        if (stored) {
          titles.push(stored);
        }
      }
    } catch (error) {
      return { ok: false, error: messageFrom(error) };
    }
    if (titles.length === 0) {
      return { ok: false, error: 'TMDB respondió, pero no se pudo guardar la cartelera.' };
    }
    return { ok: true, titles };
  }

  private async listPopular(mediaType: MediaType): Promise<{ id: number; mediaType: MediaType }[]> {
    const path = mediaType === 'movie' ? 'movie' : 'tv';
    const url = new URL(`https://api.themoviedb.org/3/${path}/popular`);
    url.searchParams.set('api_key', environment.tmdbApiKey);
    url.searchParams.set('language', TMDB_LANGUAGE);
    const response = await tmdbFetch(url);
    if (!response.ok) {
      throw new Error(`TMDB ${response.status}`);
    }
    const body = (await response.json()) as { results?: { id?: number }[] };
    return (body.results ?? [])
      .flatMap((item) => (typeof item.id === 'number' && item.id > 0 ? [item.id] : []))
      .slice(0, 6)
      .map((id) => ({ id, mediaType }));
  }

  private async searchTmdb(query: string): Promise<TmdbListItem[]> {
    const url = new URL('https://api.themoviedb.org/3/search/multi');
    url.searchParams.set('api_key', environment.tmdbApiKey);
    url.searchParams.set('language', TMDB_LANGUAGE);
    url.searchParams.set('include_adult', 'false');
    url.searchParams.set('query', query);
    const response = await tmdbFetch(url);
    if (!response.ok) {
      throw new Error(`TMDB ${response.status}`);
    }
    const body = (await response.json()) as { results?: TmdbListItem[] };
    return (body.results ?? [])
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .slice(0, SEARCH_LIMIT);
  }

  private async ensureStored(tmdbId: number, mediaType: MediaType): Promise<Title | null> {
    const existing = await this.findStored(tmdbId, mediaType);
    if (existing) {
      return existing;
    }

    let detail: Record<string, unknown>;
    try {
      detail = await this.fetchDetail(tmdbId, mediaType);
    } catch {
      return null;
    }

    const row = this.toInsert(tmdbId, mediaType, detail);
    const { data, error } = await supabase.from('titles').insert(row).select('*').single();
    if (!error && data) {
      return mapTitle(data);
    }
    const saved = await this.findStored(tmdbId, mediaType);
    if (saved) {
      return saved;
    }
    throw new Error(error?.message || 'No se pudo guardar el título.');
  }

  async withFullDetail(title: Title): Promise<Title> {
    if (!isTmdbConfigured) {
      return title;
    }
    try {
      const detail = await this.fetchDetail(title.tmdbId, title.mediaType);
      const row = this.toInsert(title.tmdbId, title.mediaType, detail, null);
      return {
        ...title,
        name: row.name,
        overview: row.overview,
        releaseDate: row.release_date,
        posterUrl: row.poster_url,
        backdropUrl: row.backdrop_url,
        genres: row.genres,
        cast: row.cast.map((person) => ({
          name: person.name,
          character: person.character,
          profileUrl: person.profile_url,
        })),
        runtimeMinutes: row.runtime_minutes,
        originalLanguage: row.original_language,
        tmdbScore: row.tmdb_score,
      };
    } catch {
      return title;
    }
  }

  private async findStored(tmdbId: number, mediaType: MediaType): Promise<Title | null> {
    const { data, error } = await supabase
      .from('titles')
      .select('*')
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType)
      .maybeSingle();
    if (error || !data) {
      return null;
    }
    return mapTitle(data);
  }

  private async fetchDetail(
    tmdbId: number,
    mediaType: MediaType,
    credits = true,
  ): Promise<Record<string, unknown>> {
    const path = mediaType === 'movie' ? 'movie' : 'tv';
    const url = new URL(`https://api.themoviedb.org/3/${path}/${tmdbId}`);
    url.searchParams.set('api_key', environment.tmdbApiKey);
    url.searchParams.set('language', TMDB_LANGUAGE);
    if (credits) {
      url.searchParams.set('append_to_response', 'credits');
    }
    const response = await tmdbFetch(url);
    if (!response.ok) {
      throw new Error(`TMDB ${response.status}`);
    }
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== 'object') {
      throw new Error('Respuesta vacía');
    }
    return body as Record<string, unknown>;
  }

  private toInsert(tmdbId: number, mediaType: MediaType, detail: Record<string, unknown>, castLimit: number | null = 40) {
    const name =
      mediaType === 'movie' ? text(detail['title']) : text(detail['name']);
    const release =
      mediaType === 'movie' ? text(detail['release_date']) : text(detail['first_air_date']);
    return {
      tmdb_id: tmdbId,
      media_type: mediaType,
      name: clipText(name || 'Sin título', LIMITS.titleName.max) || 'Sin título',
      overview: clipText(text(detail['overview']), LIMITS.overview.max),
      release_date: /^\d{4}-\d{2}-\d{2}$/.test(release) ? release : null,
      poster_url: imageUrl(detail['poster_path']),
      backdrop_url: imageUrl(detail['backdrop_path']),
      genres: genreList(mediaType, detail),
      cast: castMembers(detail['credits'], castLimit),
      runtime_minutes: runtime(mediaType, detail),
      original_language: text(detail['original_language']) || null,
      tmdb_score: roundScore(detail['vote_average']),
    };
  }
}

function messageFrom(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError' || raw === 'TMDB_TIMEOUT' || raw.startsWith('TMDB')) {
    return 'TMDB no respondió. Si tienes una VPN activa, apágala e inténtalo de nuevo.';
  }
  if (raw.toLowerCase().includes('failed to fetch') || raw.toLowerCase().includes('network')) {
    return 'No hay conexión con TMDB. Si tienes una VPN activa, apágala e inténtalo de nuevo.';
  }
  if (raw.toLowerCase().includes('row-level security') || raw.toLowerCase().includes('jwt')) {
    return 'No se pudo guardar. Cierra sesión, entra de nuevo e inténtalo.';
  }
  return raw.trim() || NETWORK_ERROR;
}

const TMDB_TIMEOUT_MS = 8000;
const PROGRAM_TYPES = new Set(['reality', 'talk show', 'news', 'documentary', 'video']);

async function tmdbFetch(url: URL): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(TMDB_TIMEOUT_MS) });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error('TMDB_TIMEOUT');
    }
    throw error;
  }
}

async function pool<T, R>(items: T[], size: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await task(items[index]);
    }
  };
  const workers = Math.min(size, items.length);
  await Promise.all(Array.from({ length: workers }, () => run()));
  return out;
}

function genreList(mediaType: MediaType, detail: Record<string, unknown>): string[] {
  const names = genreNames(detail['genres']);
  if (mediaType !== 'tv' || !PROGRAM_TYPES.has(text(detail['type']).toLowerCase())) {
    return names;
  }
  if (showFormat({ mediaType, genres: names }) === 'program') {
    return names;
  }
  return [...names, 'Programa'];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function imageUrl(value: unknown): string | null {
  const path = text(value);
  return path ? `${IMAGE_BASE}${path}` : null;
}

function genreNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const name = text((item as Record<string, unknown>)['name']);
    return name ? [name] : [];
  });
}

function castMembers(
  credits: unknown,
  limit: number | null,
): { name: string; character: string; profile_url: string | null }[] {
  if (!credits || typeof credits !== 'object') {
    return [];
  }
  const cast = (credits as Record<string, unknown>)['cast'];
  if (!Array.isArray(cast)) {
    return [];
  }
  const people = limit === null ? cast : cast.slice(0, limit);
  return people.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const row = item as Record<string, unknown>;
    const name = clipText(text(row['name']), LIMITS.castName.max);
    if (!name) {
      return [];
    }
    return [
      {
        name,
        character: clipText(text(row['character']), LIMITS.castName.max),
        profile_url: imageUrl(row['profile_path']),
      },
    ];
  });
}

function boundedMinutes(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > 2000) {
    return null;
  }
  return Math.round(value);
}

function runtime(mediaType: MediaType, detail: Record<string, unknown>): number | null {
  if (mediaType === 'movie' && typeof detail['runtime'] === 'number') {
    return boundedMinutes(detail['runtime']);
  }
  const list = detail['episode_run_time'];
  if (Array.isArray(list) && typeof list[0] === 'number') {
    return boundedMinutes(list[0]);
  }
  return null;
}

function roundScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) {
    return null;
  }
  return Math.round(value * 10) / 10;
}
