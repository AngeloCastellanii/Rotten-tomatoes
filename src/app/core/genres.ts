import type { GenreId } from './models';

export const CATALOG_GENRES: { id: Exclude<GenreId, ''>; label: string }[] = [
  { id: 'accion', label: 'Acción' },
  { id: 'drama', label: 'Drama' },
  { id: 'misterio', label: 'Misterio' },
];

const GENRE_KEYS: Record<Exclude<GenreId, ''>, string[]> = {
  accion: ['accion', 'action'],
  drama: ['drama'],
  misterio: ['misterio', 'mystery'],
};

export function matchesGenre(genres: string[], genre: GenreId): boolean {
  if (!genre) {
    return true;
  }
  const keys = new Set(GENRE_KEYS[genre]);
  return genres.some((name) => keys.has(fold(name)));
}

function fold(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
