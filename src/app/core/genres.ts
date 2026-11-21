export interface CatalogGenre {
  id: string;
  label: string;
  keys: string[];
}

export const CATALOG_GENRES: CatalogGenre[] = [
  { id: 'accion', label: 'Acción', keys: ['accion', 'action'] },
  {
    id: 'accion-aventura',
    label: 'Acción y aventura',
    keys: ['accion y aventura', 'action & adventure', 'action and adventure'],
  },
  { id: 'animacion', label: 'Animación', keys: ['animacion', 'animation'] },
  { id: 'aventura', label: 'Aventura', keys: ['aventura', 'adventure'] },
  { id: 'belica', label: 'Bélica', keys: ['belica', 'war'] },
  { id: 'ciencia-ficcion', label: 'Ciencia ficción', keys: ['ciencia ficcion', 'science fiction'] },
  {
    id: 'ciencia-ficcion-fantasia',
    label: 'Ciencia ficción y fantasía',
    keys: ['ciencia ficcion y fantasia', 'sci-fi & fantasy', 'science fiction & fantasy'],
  },
  { id: 'comedia', label: 'Comedia', keys: ['comedia', 'comedy'] },
  { id: 'crimen', label: 'Crimen', keys: ['crimen', 'crime'] },
  { id: 'documental', label: 'Documental', keys: ['documental', 'documentary'] },
  { id: 'drama', label: 'Drama', keys: ['drama'] },
  { id: 'familia', label: 'Familia', keys: ['familia', 'family'] },
  { id: 'fantasia', label: 'Fantasía', keys: ['fantasia', 'fantasy'] },
  { id: 'guerra-politica', label: 'Guerra y política', keys: ['guerra y politica', 'war & politics'] },
  { id: 'historia', label: 'Historia', keys: ['historia', 'history'] },
  { id: 'infantil', label: 'Infantil', keys: ['infantil', 'kids'] },
  { id: 'misterio', label: 'Misterio', keys: ['misterio', 'mystery'] },
  { id: 'musica', label: 'Música', keys: ['musica', 'music'] },
  { id: 'noticias', label: 'Noticias', keys: ['noticias', 'news'] },
  { id: 'pelicula-tv', label: 'Película de TV', keys: ['pelicula de tv', 'tv movie'] },
  { id: 'reality', label: 'Reality', keys: ['reality'] },
  { id: 'romance', label: 'Romance', keys: ['romance'] },
  { id: 'suspense', label: 'Suspense', keys: ['suspense', 'thriller'] },
  { id: 'talk-show', label: 'Talk show', keys: ['talk show', 'talk'] },
  { id: 'telenovela', label: 'Telenovela', keys: ['telenovela', 'soap'] },
  { id: 'terror', label: 'Terror', keys: ['terror', 'horror'] },
  { id: 'western', label: 'Western', keys: ['western'] },
];

const GENRE_KEYS = new Map(CATALOG_GENRES.map((genre) => [genre.id, new Set(genre.keys)]));

export function asGenre(value: string): string {
  const folded = fold(value);
  return GENRE_KEYS.has(folded) ? folded : '';
}

export function matchesGenre(genres: string[], genre: string): boolean {
  if (!genre) {
    return true;
  }
  const keys = GENRE_KEYS.get(genre);
  if (!keys) {
    return true;
  }
  return genres.some((name) => keys.has(fold(name)));
}

function fold(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
