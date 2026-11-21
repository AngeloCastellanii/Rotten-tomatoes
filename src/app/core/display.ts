import type { MediaType, UserRole } from './models';

const LANGUAGES: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  fr: 'Francés',
  pt: 'Portugués',
  de: 'Alemán',
  it: 'Italiano',
  ja: 'Japonés',
  ko: 'Coreano',
  zh: 'Chino',
};

export function hideBrokenImage(event: Event): void {
  const image = event.target;
  if (image instanceof HTMLImageElement) {
    image.hidden = true;
  }
}

export function scoreLabel(value: number | null): string {
  if (value === null) {
    return 'Sin puntaje';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function yearLabel(value: string | null): string {
  return value ? value.slice(0, 4) : 'Sin fecha';
}

export function dateLabel(value: string | null): string {
  if (!value) {
    return 'Sin fecha';
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) {
    return value.slice(0, 4);
  }
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function runtimeLabel(minutes: number | null): string {
  return minutes ? `${minutes} min` : 'Sin duración';
}

export function languageLabel(code: string | null): string {
  if (!code) {
    return 'Sin idioma';
  }
  return LANGUAGES[code.toLowerCase()] ?? code.toUpperCase();
}

export type ShowFormat = 'movie' | 'series' | 'program';

const PROGRAM_GENRES = new Set([
  'reality',
  'news',
  'noticias',
  'talk',
  'talk show',
  'programa',
  'programa de television',
  'documental',
  'documentary',
]);

export function showFormat(title: { mediaType: MediaType; genres: string[] }): ShowFormat {
  if (title.mediaType === 'movie') {
    return 'movie';
  }
  return title.genres.some((genre) => PROGRAM_GENRES.has(foldLabel(genre))) ? 'program' : 'series';
}

export function showFormatLabel(title: { mediaType: MediaType; genres: string[] }): string {
  const format = showFormat(title);
  if (format === 'movie') {
    return 'Película';
  }
  return format === 'program' ? 'Programa' : 'Serie';
}

function foldLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function mediaLabel(type: MediaType): string {
  return type === 'tv' ? 'Serie' : 'Película';
}

export function roleLabel(role: UserRole): string {
  return role === 'critic' ? 'Crítico' : 'Público';
}
