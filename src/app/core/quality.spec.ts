import { describe, expect, it } from 'vitest';

import { dateLabel, scoreLabel } from './display';
import { matchesGenre } from './genres';
import { mapReview, mapTitle } from './mappers';
import {
  asGenre,
  clampScore,
  clipText,
  isUuid,
  parseYearInput,
  validateEmail,
  validateName,
  validatePassword,
  validateReviewBody,
  validateReviewScore,
  validateSearch,
} from './validation';

const TITLE_ID = '11111111-1111-4111-8111-111111111111';

describe('parametros de entrada', () => {
  it('rechaza nombre, correo y clave fuera de rango', () => {
    expect(validateName('A').ok).toBe(false);
    expect(validateName('Ana').ok).toBe(true);
    expect(validateName('A'.repeat(61)).ok).toBe(false);

    expect(validateEmail('sin-arroba.com').error).toContain('@');
    expect(validateEmail('a@b').ok).toBe(false);
    expect(validateEmail('ana@correo.gob').ok).toBe(true);
    expect(validateEmail(`${'a'.repeat(250)}@correo.com`).ok).toBe(false);

    expect(validatePassword('12345').ok).toBe(false);
    expect(validatePassword('123456').ok).toBe(true);
    expect(validatePassword('x'.repeat(73)).ok).toBe(false);
  });

  it('no deja pasar reseñas ni búsquedas inválidas', () => {
    expect(validateReviewBody('   ').ok).toBe(false);
    expect(validateReviewBody('Me gustó').ok).toBe(true);
    expect(validateReviewBody('x'.repeat(1001)).ok).toBe(false);

    expect(validateReviewScore(-1).ok).toBe(false);
    expect(validateReviewScore(1.5).ok).toBe(false);
    expect(validateReviewScore(0).ok).toBe(true);
    expect(validateReviewScore(100).ok).toBe(true);
    expect(validateReviewScore(101).ok).toBe(false);

    expect(validateSearch('a').ok).toBe(false);
    expect(validateSearch('dune').ok).toBe(true);
    expect(validateSearch('d'.repeat(81)).ok).toBe(false);
  });

  it('normaliza año, puntaje, género e identificadores', () => {
    expect(parseYearInput('').state).toBe('empty');
    expect(parseYearInput('202').state).toBe('pending');
    expect(parseYearInput('20.2').state).toBe('invalid');
    expect(parseYearInput('1492').state).toBe('invalid');
    expect(parseYearInput('1999')).toEqual({ state: 'ok', year: 1999 });

    expect(clampScore(Number.NaN)).toBe(0);
    expect(clampScore(-4)).toBe(0);
    expect(clampScore(100.6)).toBe(100);
    expect(clampScore(88.2)).toBe(88);

    expect(asGenre('accion')).toBe('accion');
    expect(asGenre('comedia')).toBe('comedia');
    expect(asGenre('no-existe')).toBe('');
    expect(clipText('  hola   mundo  ', 4)).toBe('hola');
    expect(isUuid(TITLE_ID)).toBe(true);
    expect(isUuid('no-es-uuid')).toBe(false);
  });

  it('reconoce géneros en español e inglés y puntajes vacíos', () => {
    expect(matchesGenre(['Acción', 'Aventura'], 'accion')).toBe(true);
    expect(matchesGenre(['Action'], 'accion')).toBe(true);
    expect(matchesGenre(['Comedia'], 'misterio')).toBe(false);
    expect(matchesGenre(['Ciencia ficción', 'Aventura'], 'ciencia-ficcion')).toBe(true);
    expect(matchesGenre(['Thriller'], 'suspense')).toBe(true);
    expect(scoreLabel(null)).toBe('Sin puntaje');
    expect(scoreLabel(8.5)).toBe('8.5');
    expect(dateLabel(null)).toBe('Sin fecha');
    expect(dateLabel('2024-03-01')).toContain('2024');
  });

  it('descarta filas de la base que no cumplen el contrato', () => {
    expect(mapTitle(null)).toBeNull();
    expect(mapTitle({ id: TITLE_ID })).toBeNull();
    expect(
      mapTitle({
        id: TITLE_ID,
        tmdb_id: '550',
        media_type: 'movie',
        name: 'El club',
        overview: '',
        release_date: '1999-10-15',
        genres: ['Drama', 1],
        cast: [{ name: 'Brad', character: 'Tyler', profile_url: '' }],
        audience_score: '80.5',
        audience_count: null,
      })?.name,
    ).toBe('El club');

    expect(mapReview({ id: TITLE_ID, title_id: TITLE_ID })).toBeNull();
    expect(
      mapReview({
        id: TITLE_ID,
        title_id: TITLE_ID,
        author_id: TITLE_ID,
        body: 'Bien',
        score: '90',
        profiles: { name: 'Ana', role: 'critic' },
        titles: { name: 'El club', poster_url: '' },
      }),
    ).toMatchObject({
      authorName: 'Ana',
      authorRole: 'critic',
      score: 90,
      titleName: 'El club',
    });
  });
});
