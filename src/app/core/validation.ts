import { LIMITS } from './limits';
import type { UserRole } from './models';
import { normalizeText } from './text';

export { asGenre } from './genres';

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

const EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function validateName(value: string): ValidationResult {
  const name = normalizeText(value);
  if (name.length < LIMITS.name.min) {
    return { ok: false, error: `El nombre debe tener al menos ${LIMITS.name.min} caracteres.` };
  }
  if (name.length > LIMITS.name.max) {
    return { ok: false, error: `El nombre no puede superar ${LIMITS.name.max} caracteres.` };
  }
  return { ok: true };
}

export function validateEmail(value: string): ValidationResult {
  const email = normalizeText(value).toLowerCase();
  if (email.length < LIMITS.email.min) {
    return { ok: false, error: 'Ingresa un correo válido.' };
  }
  if (email.length > LIMITS.email.max) {
    return { ok: false, error: `El correo no puede superar ${LIMITS.email.max} caracteres.` };
  }
  if (!email.includes('@')) {
    return { ok: false, error: 'El correo debe incluir @.' };
  }
  if (!EMAIL_REGEX.test(email)) {
    return {
      ok: false,
      error: 'Ingresa un correo válido (ej: tu@correo.com, nombre@empresa.net).',
    };
  }
  return { ok: true };
}

export function validatePassword(value: string): ValidationResult {
  if (value.length < LIMITS.password.min) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${LIMITS.password.min} caracteres.`,
    };
  }
  if (value.length > LIMITS.password.max) {
    return {
      ok: false,
      error: `La contraseña no puede superar ${LIMITS.password.max} caracteres.`,
    };
  }
  return { ok: true };
}

export function validateRole(value: string): value is UserRole {
  return value === 'audience' || value === 'critic';
}

export function validateReviewBody(value: string): ValidationResult {
  const body = normalizeText(value);
  if (body.length < LIMITS.review.min) {
    return { ok: false, error: 'Escribe tu opinión.' };
  }
  if (body.length > LIMITS.review.max) {
    return { ok: false, error: `La opinión no puede superar ${LIMITS.review.max} caracteres.` };
  }
  return { ok: true };
}

export function validateReviewScore(value: number): ValidationResult {
  if (!Number.isInteger(value) || value < LIMITS.score.min || value > LIMITS.score.max) {
    return { ok: false, error: 'El puntaje debe ser un número entero entre 0 y 100.' };
  }
  return { ok: true };
}

export function validateYear(value: number): ValidationResult {
  if (!Number.isInteger(value) || value < LIMITS.year.min || value > LIMITS.year.max) {
    return { ok: false, error: `El año debe estar entre ${LIMITS.year.min} y ${LIMITS.year.max}.` };
  }
  return { ok: true };
}

export function yearOptions(now = new Date().getFullYear()): number[] {
  const newest = Math.min(LIMITS.year.max, now + 1);
  const years: number[] = [];
  for (let year = newest; year >= LIMITS.year.min; year -= 1) {
    years.push(year);
  }
  return years;
}

export type YearInput =
  | { state: 'empty' }
  | { state: 'pending' }
  | { state: 'invalid'; error: string }
  | { state: 'ok'; year: number };

export function parseYearInput(raw: string): YearInput {
  const value = raw.trim();
  if (!value) {
    return { state: 'empty' };
  }
  if (/^\d{1,3}$/.test(value)) {
    return { state: 'pending' };
  }
  if (!/^\d{4}$/.test(value)) {
    return { state: 'invalid', error: 'El año debe tener 4 dígitos, sin decimales.' };
  }
  const year = Number(value);
  const check = validateYear(year);
  if (!check.ok) {
    return { state: 'invalid', error: check.error ?? 'Año inválido.' };
  }
  return { state: 'ok', year };
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return LIMITS.score.min;
  }
  return Math.min(LIMITS.score.max, Math.max(LIMITS.score.min, Math.round(value)));
}

export function clipText(value: string, max: number): string {
  const text = normalizeText(value);
  return text.length > max ? text.slice(0, max).trim() : text;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function validateSearch(value: string): ValidationResult {
  const query = normalizeText(value);
  if (query.length < LIMITS.search.min) {
    return { ok: false, error: `Escribe al menos ${LIMITS.search.min} caracteres.` };
  }
  if (query.length > LIMITS.search.max) {
    return { ok: false, error: `La búsqueda no puede superar ${LIMITS.search.max} caracteres.` };
  }
  return { ok: true };
}
