export type UserRole = 'audience' | 'critic';

export type MediaType = 'movie' | 'tv';

export type GenreId = '' | 'accion' | 'drama' | 'misterio';

export type CatalogSort = 'score' | 'date';

export interface CatalogFilters {
  name: string;
  genre: GenreId;
  year: number | null;
  minScore: number;
  sort: CatalogSort;
  scoreKind: UserRole;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface CastMember {
  name: string;
  character: string;
  profileUrl: string | null;
}

export interface Title {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  overview: string;
  releaseDate: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  cast: CastMember[];
  runtimeMinutes: number | null;
  originalLanguage: string | null;
  tmdbScore: number | null;
  audienceScore: number | null;
  criticScore: number | null;
  audienceCount: number;
  criticCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  titleId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  body: string;
  score: number;
  createdAt: string;
  updatedAt: string;
  titleName: string | null;
  posterUrl: string | null;
}

export type ActionResult<T extends object | undefined = undefined> = [T] extends [undefined]
  ? { ok: true } | { ok: false; error: string }
  : ({ ok: true } & NonNullable<T>) | { ok: false; error: string };
