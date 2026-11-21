import { Injectable } from '@angular/core';

import { mapTitle } from './mappers';
import type { ActionResult, MediaType, Title } from './models';
import { environment } from '../../environments/environment';
import { isTmdbConfigured, supabase } from './supabase';
import { normalizeText } from './text';
import { validateSearch } from './validation';

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const SEARCH_LIMIT = 8;

interface TmdbListItem {
  id?: number;
  media_type?: string;
}

@Injectable({ providedIn: 'root' })
export class TitlesService {
  async listRecent(): Promise<ActionResult<{ titles: Title[] }>> {
    const { data, error } = await supabase
      .from('titles')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(40);
    if (error) {
      return { ok: false, error: 'No se pudo leer el catálogo.' };
    }
    return { ok: true, titles: (data ?? []).flatMap((row) => mapTitle(row) ?? []) };
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
    } catch {
      return { ok: false, error: 'No se pudo consultar TMDB. Revisa la clave y tu conexión.' };
    }

    const titles: Title[] = [];
    for (const item of results) {
      if (typeof item.id !== 'number') {
        continue;
      }
      const mediaType = item.media_type === 'tv' ? 'tv' : item.media_type === 'movie' ? 'movie' : null;
      if (!mediaType) {
        continue;
      }
      const stored = await this.ensureStored(item.id, mediaType);
      if (stored) {
        titles.push(stored);
      }
    }
    return { ok: true, titles };
  }

  private async searchTmdb(query: string): Promise<TmdbListItem[]> {
    const url = new URL('https://api.themoviedb.org/3/search/multi');
    url.searchParams.set('api_key', environment.tmdbApiKey);
    url.searchParams.set('language', 'es-ES');
    url.searchParams.set('include_adult', 'false');
    url.searchParams.set('query', query);
    const response = await fetch(url);
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
    return this.findStored(tmdbId, mediaType);
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

  private async fetchDetail(tmdbId: number, mediaType: MediaType): Promise<Record<string, unknown>> {
    const path = mediaType === 'movie' ? 'movie' : 'tv';
    const url = new URL(`https://api.themoviedb.org/3/${path}/${tmdbId}`);
    url.searchParams.set('api_key', environment.tmdbApiKey);
    url.searchParams.set('language', 'es-ES');
    url.searchParams.set('append_to_response', 'credits');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB ${response.status}`);
    }
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== 'object') {
      throw new Error('Respuesta vacía');
    }
    return body as Record<string, unknown>;
  }

  private toInsert(tmdbId: number, mediaType: MediaType, detail: Record<string, unknown>) {
    const name =
      mediaType === 'movie' ? text(detail['title']) : text(detail['name']);
    const release =
      mediaType === 'movie' ? text(detail['release_date']) : text(detail['first_air_date']);
    return {
      tmdb_id: tmdbId,
      media_type: mediaType,
      name: name || 'Sin título',
      overview: text(detail['overview']),
      release_date: release || null,
      poster_url: imageUrl(detail['poster_path']),
      backdrop_url: imageUrl(detail['backdrop_path']),
      genres: genreNames(detail['genres']),
      cast: castMembers(detail['credits']),
      runtime_minutes: runtime(mediaType, detail),
      original_language: text(detail['original_language']) || null,
      tmdb_score: roundScore(detail['vote_average']),
    };
  }
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
): { name: string; character: string; profile_url: string | null }[] {
  if (!credits || typeof credits !== 'object') {
    return [];
  }
  const cast = (credits as Record<string, unknown>)['cast'];
  if (!Array.isArray(cast)) {
    return [];
  }
  return cast.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const row = item as Record<string, unknown>;
    const name = text(row['name']);
    if (!name) {
      return [];
    }
    return [
      {
        name,
        character: text(row['character']),
        profile_url: imageUrl(row['profile_path']),
      },
    ];
  });
}

function runtime(mediaType: MediaType, detail: Record<string, unknown>): number | null {
  if (mediaType === 'movie' && typeof detail['runtime'] === 'number') {
    return detail['runtime'];
  }
  const list = detail['episode_run_time'];
  if (Array.isArray(list) && typeof list[0] === 'number') {
    return list[0];
  }
  return null;
}

function roundScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}
