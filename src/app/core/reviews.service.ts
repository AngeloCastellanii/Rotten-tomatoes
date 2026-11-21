import { Injectable } from '@angular/core';

import { mapReview } from './mappers';
import type { ActionResult, Review } from './models';
import { supabase } from './supabase';
import { normalizeText } from './text';
import { isUuid, validateReviewBody, validateReviewScore } from './validation';

const NETWORK_ERROR = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';

const REVIEW_COLUMNS =
  'id, title_id, author_id, body, score, created_at, updated_at, profiles(name, role), titles(name, poster_url)';

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  async listForTitle(titleId: string): Promise<ActionResult<{ reviews: Review[] }>> {
    if (!isUuid(titleId)) {
      return { ok: false, error: 'No se pudieron leer las reseñas.' };
    }
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(REVIEW_COLUMNS)
        .eq('title_id', titleId)
        .order('created_at', { ascending: false });
      if (error) {
        return { ok: false, error: 'No se pudieron leer las reseñas.' };
      }
      return { ok: true, reviews: (data ?? []).flatMap((row) => mapReview(row) ?? []) };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }

  async listMine(authorId: string): Promise<ActionResult<{ reviews: Review[] }>> {
    if (!isUuid(authorId)) {
      return { ok: true, reviews: [] };
    }
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(REVIEW_COLUMNS)
        .eq('author_id', authorId)
        .order('updated_at', { ascending: false });
      if (error) {
        return { ok: false, error: 'No se pudieron leer tus reseñas.' };
      }
      return { ok: true, reviews: (data ?? []).flatMap((row) => mapReview(row) ?? []) };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }

  async save(input: {
    titleId: string;
    authorId: string;
    body: string;
    score: number;
  }): Promise<ActionResult<{ review: Review }>> {
    if (!isUuid(input.titleId) || !isUuid(input.authorId)) {
      return { ok: false, error: 'No se pudo guardar la reseña.' };
    }
    const body = normalizeText(input.body);
    const bodyCheck = validateReviewBody(body);
    if (!bodyCheck.ok) {
      return { ok: false, error: bodyCheck.error ?? 'Opinión inválida.' };
    }
    const score = Number.isFinite(input.score) ? Math.round(input.score) : Number.NaN;
    const scoreCheck = validateReviewScore(score);
    if (!scoreCheck.ok) {
      return { ok: false, error: scoreCheck.error ?? 'Puntaje inválido.' };
    }

    try {
      const { data, error } = await supabase
        .from('reviews')
        .upsert(
          {
            title_id: input.titleId,
            author_id: input.authorId,
            body,
            score,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'title_id,author_id' },
        )
        .select(REVIEW_COLUMNS)
        .single();
      if (error || !data) {
        return { ok: false, error: 'No se pudo guardar la reseña.' };
      }
      const review = mapReview(data);
      if (!review) {
        return { ok: false, error: 'No se pudo guardar la reseña.' };
      }
      return { ok: true, review };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }

  async remove(id: string, authorId: string): Promise<ActionResult> {
    if (!isUuid(id) || !isUuid(authorId)) {
      return { ok: false, error: 'No se pudo borrar la reseña.' };
    }
    try {
      const { error } = await supabase.from('reviews').delete().eq('id', id).eq('author_id', authorId);
      if (error) {
        return { ok: false, error: 'No se pudo borrar la reseña.' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }
}
