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

const BOARD_TTL_MS = 5 * 60 * 1000;
const NETWORK_ERROR = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const SEARCH_LIMIT = 20;
const TMDB_LANGUAGE = 'es-MX';

interface ListedTitle {
  id: number;
  mediaType: MediaType;
  name: string;
  overview: string;
  date: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  genreIds: number[];
  vote: number | null;
  originalLanguage: string | null;
  popularity: number;
  rank: number;
}

export interface SearchHit {
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  overview: string;
  releaseDate: string | null;
  posterUrl: string | null;
  genres: string[];
  tmdbScore: number | null;
}

export interface CatalogBoard {
  id: string;
  label: string;
  hint: string;
  titles: Title[];
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

    let results: ListedTitle[];
    try {
      results = await this.searchTmdb(query);
    } catch (error) {
      return { ok: false, error: messageFrom(error) };
    }
    const titles = await this.storeListed(results);
    if (titles.length === 0) {
      return { ok: false, error: 'TMDB no encontró títulos para guardar.' };
    }
    return { ok: true, titles };
  }

  async searchLive(rawQuery: string): Promise<ActionResult<{ hits: SearchHit[] }>> {
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
    try {
      const hits = (await this.searchTmdb(query)).map((item) => this.toHit(item));
      if (hits.length === 0) {
        return { ok: false, error: 'TMDB no encontró títulos.' };
      }
      return { ok: true, hits };
    } catch (error) {
      return { ok: false, error: messageFrom(error) };
    }
  }

  async storeHit(hit: SearchHit): Promise<ActionResult<{ title: Title }>> {
    const title = await this.ensureHit(hit);
    if (!title) {
      return { ok: false, error: 'No se pudo guardar el título.' };
    }
    return { ok: true, title };
  }

  async storeHits(hits: SearchHit[]): Promise<ActionResult<{ titles: Title[] }>> {
    const stored = await pool(hits, 8, (hit) => this.ensureHit(hit));
    const titles = stored.flatMap((title) => title ?? []);
    if (titles.length === 0) {
      return { ok: false, error: 'No se pudo guardar.' };
    }
    return { ok: true, titles };
  }

  async discoverYear(year: number): Promise<ActionResult<{ titles: Title[] }>> {
    const check = validateYear(year);
    if (!check.ok) {
      return { ok: false, error: check.error ?? 'Año inválido.' };
    }
    if (!isTmdbConfigured) {
      return {
        ok: false,
        error: 'Falta TMDB_API_KEY en .env. Guárdala y vuelve a iniciar la app.',
      };
    }
    try {
      const pages = ['1', '2', '3'];
      const lists = await Promise.all([
        ...pages.map((page) =>
          this.listFeed('discover/movie', 'movie', {
            primary_release_year: String(year),
            sort_by: 'popularity.desc',
            include_adult: 'false',
            page,
          }),
        ),
        ...pages.map((page) =>
          this.listFeed('discover/tv', 'tv', {
            first_air_date_year: String(year),
            sort_by: 'popularity.desc',
            include_adult: 'false',
            page,
          }),
        ),
      ]);
      const ranked = lists.flat().sort((a, b) => b.popularity - a.popularity);
      const titles = await this.storeListed(ranked);
      if (titles.length === 0) {
        return { ok: false, error: 'TMDB no tiene estrenos populares de ese año.' };
      }
      return { ok: true, titles };
    } catch (error) {
      return { ok: false, error: messageFrom(error) };
    }
  }

  async loadBoards(): Promise<ActionResult<{ boards: CatalogBoard[] }>> {
    if (!isTmdbConfigured) {
      return {
        ok: false,
        error: 'Falta TMDB_API_KEY en .env. Guárdala y vuelve a iniciar la app.',
      };
    }
    const cached = this.boardsCache;
    if (cached && Date.now() - cached.at < BOARD_TTL_MS) {
      return { ok: true, boards: cached.boards };
    }
    if (!this.boardTask) {
      this.boardTask = this.fetchBoards().finally(() => {
        this.boardTask = null;
      });
    }
    return this.boardTask;
  }

  private boardTask: Promise<ActionResult<{ boards: CatalogBoard[] }>> | null = null;
  private boardsCache: { at: number; boards: CatalogBoard[] } | null = null;

  private async fetchBoards(): Promise<ActionResult<{ boards: CatalogBoard[] }>> {
    try {
      const today = todayStamp();
      const [trending, upcoming, playing, airing, movieRated, tvRated] = await Promise.all([
        this.listFeed('trending/all/day', null),
        this.listFeed('movie/upcoming', 'movie'),
        this.listFeed('movie/now_playing', 'movie'),
        this.listFeed('tv/on_the_air', 'tv'),
        this.listFeed('movie/top_rated', 'movie'),
        this.listFeed('tv/top_rated', 'tv'),
      ]);
      const picked = [
        { id: 'trending', label: 'Tendencias', hint: 'Lo más visto ahora.', items: take(trending, 20) },
        {
          id: 'upcoming',
          label: 'Próximos estrenos',
          hint: 'Lo que está por salir.',
          items: take(
            upcoming
              .filter((item) => item.date !== null && item.date >= today)
              .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
            20,
          ),
        },
        {
          id: 'recent',
          label: 'Recién estrenados',
          hint: 'Lo que acaba de llegar.',
          items: take(
            [...playing, ...airing]
              .filter((item) => item.date !== null && item.date <= today)
              .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
            20,
          ),
        },
        {
          id: 'rated',
          label: 'Mejor valorados',
          hint: 'Las notas más altas.',
          items: take(
            [...movieRated, ...tvRated].sort((a, b) => (b.vote ?? 0) - (a.vote ?? 0)),
            20,
          ),
        },
      ];
      const seen = new Set<string>();
      const selected = picked.map((board) => ({
        ...board,
        items: board.items.filter((item) => {
          const key = `${item.mediaType}:${item.id}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        }),
      }));
      const stored = await this.storeListed(selected.flatMap((board) => board.items));
      const byKey = new Map(stored.map((title) => [`${title.mediaType}:${title.tmdbId}`, title] as const));
      const boards = selected
        .map((board) => ({
          id: board.id,
          label: board.label,
          hint: board.hint,
          titles: board.items.flatMap((item) => byKey.get(`${item.mediaType}:${item.id}`) ?? []),
        }))
        .filter((board) => board.titles.length > 0);
      if (boards.length === 0) {
        return { ok: false, error: 'TMDB respondió, pero no se pudo armar la cartelera.' };
      }
      this.boardsCache = { at: Date.now(), boards };
      return { ok: true, boards };
    } catch (error) {
      return { ok: false, error: messageFrom(error) };
    }
  }

  private async listFeed(
    path: string,
    fallback: MediaType | null,
    extra: Record<string, string> = {},
  ): Promise<ListedTitle[]> {
    const url = new URL(`https://api.themoviedb.org/3/${path}`);
    url.searchParams.set('api_key', environment.tmdbApiKey);
    url.searchParams.set('language', TMDB_LANGUAGE);
    for (const [key, value] of Object.entries(extra)) {
      url.searchParams.set(key, value);
    }
    const response = await tmdbFetch(url);
    if (!response.ok) {
      throw new Error(`TMDB ${response.status}`);
    }
    const body = (await response.json()) as { results?: Record<string, unknown>[] };
    return (body.results ?? []).flatMap((item, index) => listedFromRow(item, index, fallback) ?? []);
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

  private toHit(item: ListedTitle): SearchHit {
    return {
      tmdbId: item.id,
      mediaType: item.mediaType,
      name: item.name || 'Sin título',
      overview: item.overview,
      releaseDate: item.date,
      posterUrl: imageUrl(item.posterPath),
      genres: genreNamesFromIds(item.genreIds),
      tmdbScore: roundScore(item.vote),
    };
  }

  private async ensureHit(hit: SearchHit): Promise<Title | null> {
    const existing = await this.findStored(hit.tmdbId, hit.mediaType);
    if (existing) {
      return existing;
    }
    const row = {
      tmdb_id: hit.tmdbId,
      media_type: hit.mediaType,
      name: clipText(hit.name || 'Sin título', LIMITS.titleName.max) || 'Sin título',
      overview: clipText(hit.overview, LIMITS.overview.max),
      release_date: hit.releaseDate,
      poster_url: hit.posterUrl,
      backdrop_url: null,
      genres: hit.genres,
      cast: [],
      runtime_minutes: null,
      original_language: null,
      tmdb_score: roundScore(hit.tmdbScore),
    };
    const { data, error } = await supabase.from('titles').insert(row).select('*').single();
    if (!error && data) {
      return mapTitle(data);
    }
    return this.findStored(hit.tmdbId, hit.mediaType);
  }

  private async searchTmdb(query: string): Promise<ListedTitle[]> {
    const results = await this.listFeed('search/multi', null, {
      include_adult: 'false',
      query,
    });
    return results.slice(0, SEARCH_LIMIT);
  }

  private async storeListed(items: ListedTitle[]): Promise<Title[]> {
    const unique: ListedTitle[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.mediaType}:${item.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(item);
    }
    const stored = await pool(unique, 8, (item) => this.ensureListed(item));
    const byKey = new Map(
      stored.flatMap((title) => (title ? [[`${title.mediaType}:${title.tmdbId}`, title] as const] : [])),
    );
    return unique.flatMap((item) => byKey.get(`${item.mediaType}:${item.id}`) ?? []);
  }

  private async ensureListed(item: ListedTitle): Promise<Title | null> {
    const existing = await this.findStored(item.id, item.mediaType);
    if (existing) {
      return existing;
    }
    const row = {
      tmdb_id: item.id,
      media_type: item.mediaType,
      name: clipText(item.name || 'Sin título', LIMITS.titleName.max) || 'Sin título',
      overview: clipText(item.overview, LIMITS.overview.max),
      release_date: item.date,
      poster_url: imageUrl(item.posterPath),
      backdrop_url: imageUrl(item.backdropPath),
      genres: genreNamesFromIds(item.genreIds),
      cast: [],
      runtime_minutes: null,
      original_language: item.originalLanguage,
      tmdb_score: roundScore(item.vote),
    };
    const { data, error } = await supabase.from('titles').insert(row).select('*').single();
    if (!error && data) {
      return mapTitle(data);
    }
    return this.findStored(item.id, item.mediaType);
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

function todayStamp(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function take(items: ListedTitle[], limit: number): ListedTitle[] {
  return items.slice(0, limit);
}

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

function listedFromRow(
  item: Record<string, unknown>,
  index: number,
  fallback: MediaType | null,
): ListedTitle | null {
  const id = item['id'];
  if (typeof id !== 'number' || id <= 0) {
    return null;
  }
  const rawType = item['media_type'];
  const mediaType = fallback ?? (rawType === 'tv' ? 'tv' : rawType === 'movie' ? 'movie' : null);
  if (!mediaType) {
    return null;
  }
  const date = text(item['release_date']) || text(item['first_air_date']);
  const genreIds = Array.isArray(item['genre_ids'])
    ? item['genre_ids'].filter((value): value is number => typeof value === 'number')
    : [];
  return {
    id,
    mediaType,
    name: text(item['title']) || text(item['name']),
    overview: text(item['overview']),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    posterPath: text(item['poster_path']) || null,
    backdropPath: text(item['backdrop_path']) || null,
    genreIds,
    vote: typeof item['vote_average'] === 'number' ? item['vote_average'] : null,
    originalLanguage: text(item['original_language']) || null,
    popularity: typeof item['popularity'] === 'number' ? item['popularity'] : 0,
    rank: index,
  };
}

const GENRE_NAMES: Record<number, string> = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia ficción',
  10770: 'Película de TV',
  53: 'Suspense',
  10752: 'Bélica',
  37: 'Western',
  10759: 'Acción y aventura',
  10762: 'Infantil',
  10763: 'Noticias',
  10764: 'Reality',
  10765: 'Ciencia ficción y fantasía',
  10766: 'Telenovela',
  10767: 'Talk show',
  10768: 'Guerra y política',
};

function genreNamesFromIds(ids: number[]): string[] {
  return ids.flatMap((id) => GENRE_NAMES[id] ?? []);
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
