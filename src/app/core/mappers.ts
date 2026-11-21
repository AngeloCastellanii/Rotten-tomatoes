import type { CastMember, MediaType, Profile, Title, UserRole } from './models';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function role(value: unknown): UserRole {
  return value === 'critic' ? 'critic' : 'audience';
}

function mediaType(value: unknown): MediaType {
  return value === 'tv' ? 'tv' : 'movie';
}

export function mapCast(value: unknown): CastMember[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row) {
      return [];
    }
    const name = text(row['name']).trim();
    if (!name) {
      return [];
    }
    const profileUrl = text(row['profile_url']).trim();
    return [
      {
        name,
        character: text(row['character']).trim(),
        profileUrl: profileUrl || null,
      },
    ];
  });
}

export function mapProfile(value: unknown): Profile | null {
  const row = asRecord(value);
  if (!row || typeof row['id'] !== 'string') {
    return null;
  }
  return {
    id: row['id'],
    name: text(row['name']),
    email: text(row['email']),
    role: role(row['role']),
    createdAt: text(row['created_at']),
    updatedAt: text(row['updated_at']),
  };
}

export function mapTitle(value: unknown): Title | null {
  const row = asRecord(value);
  if (!row || typeof row['id'] !== 'string') {
    return null;
  }
  const tmdbId = numberOrNull(row['tmdb_id']);
  if (tmdbId === null) {
    return null;
  }
  const genres = Array.isArray(row['genres'])
    ? row['genres'].filter((item): item is string => typeof item === 'string')
    : [];
  return {
    id: row['id'],
    tmdbId,
    mediaType: mediaType(row['media_type']),
    name: text(row['name']),
    overview: text(row['overview']),
    releaseDate: text(row['release_date']) || null,
    posterUrl: text(row['poster_url']) || null,
    backdropUrl: text(row['backdrop_url']) || null,
    genres,
    cast: mapCast(row['cast']),
    runtimeMinutes: numberOrNull(row['runtime_minutes']),
    originalLanguage: text(row['original_language']) || null,
    tmdbScore: numberOrNull(row['tmdb_score']),
    audienceScore: numberOrNull(row['audience_score']),
    criticScore: numberOrNull(row['critic_score']),
    audienceCount: numberOrNull(row['audience_count']) ?? 0,
    criticCount: numberOrNull(row['critic_count']) ?? 0,
    createdAt: text(row['created_at']),
    updatedAt: text(row['updated_at']),
  };
}
