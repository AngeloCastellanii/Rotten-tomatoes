import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonLabel,
  IonRange,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { hideBrokenImage, scoreLabel, showFormat, showFormatLabel, yearLabel } from '../../core/display';
import { CATALOG_GENRES, matchesGenre } from '../../core/genres';
import type { CatalogSort, GenreId, MediaType, Title, UserRole } from '../../core/models';
import { normalizeKey } from '../../core/text';
import { TitlesService, type CatalogBoard, type SearchHit } from '../../core/titles.service';
import { asGenre, clampScore, parseYearInput, yearOptions } from '../../core/validation';
import { LIMITS } from '../../core/limits';

interface CatalogCard {
  key: string;
  id: string | null;
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  overview: string;
  releaseDate: string | null;
  posterUrl: string | null;
  genres: string[];
  audienceScore: number | null;
  criticScore: number | null;
}

@Component({
  selector: 'app-catalog',
  templateUrl: './catalog.page.html',
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonButton,
    IonButtons,
    IonSelect,
    IonSelectOption,
    IonRange,
    IonSegment,
    IonSegmentButton,
    IonLabel,
  ],
})
export class CatalogPage {
  private readonly titlesApi = inject(TitlesService);
  private readonly router = inject(Router);
  private loadGen = 0;
  private nameTimer: ReturnType<typeof setTimeout> | null = null;

  readonly years = yearOptions();
  readonly genres = CATALOG_GENRES;
  readonly titles = signal<Title[]>([]);
  readonly hits = signal<SearchHit[]>([]);
  readonly savedIds = signal<Record<string, string>>({});
  readonly boards = signal<CatalogBoard[]>([]);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly query = signal('');
  readonly genre = signal<GenreId>('');
  readonly year = signal('');
  readonly minScore = signal(0);
  readonly sort = signal<CatalogSort>('score');
  readonly scoreKind = signal<UserRole>('audience');
  readonly format = signal<'all' | 'movie' | 'series' | 'program'>('all');
  readonly searched = signal(false);
  readonly narrowed = computed(
    () =>
      this.query().trim().length >= LIMITS.search.min ||
      this.genre() !== '' ||
      this.year().trim() !== '' ||
      this.minScore() > 0,
  );
  readonly homeBoards = computed(() => {
    const format = this.format();
    return this.boards()
      .map((board) => ({
        ...board,
        titles: board.titles.filter((title) => format === 'all' || showFormat(title) === format),
      }))
      .filter((board) => board.titles.length > 0);
  });
  readonly visibleHits = computed(() => {
    const year = this.year().trim();
    const genre = this.genre();
    const minScore = this.minScore();
    return this.hits().filter((hit) => {
      if (year && !(hit.releaseDate ?? '').startsWith(year)) {
        return false;
      }
      if (genre && !matchesGenre(hit.genres, genre)) {
        return false;
      }
      if (minScore > 0 && (hit.tmdbScore ?? -1) * 10 < minScore) {
        return false;
      }
      return true;
    });
  });
  readonly sections = computed(() => {
    const format = this.format();
    const kinds = [
      { id: 'movie' as const, label: 'Películas' },
      { id: 'series' as const, label: 'Series' },
      { id: 'program' as const, label: 'Programas de televisión' },
    ];
    if (this.query().trim().length >= LIMITS.search.min) {
      return this.pack(
        kinds,
        this.visibleHits().map((hit) => this.cardFromHit(hit)),
        format,
      );
    }
    if (!this.narrowed() && !this.searched()) {
      return this.homeBoards().map((board) => ({
        id: board.id,
        label: board.label,
        hint: board.hint,
        cards: board.titles.map((title) => this.cardFromTitle(title)),
      }));
    }
    return this.pack(
      kinds,
      this.titles().map((title) => this.cardFromTitle(title)),
      format,
    );
  });

  readonly limits = LIMITS;
  readonly hideBroken = hideBrokenImage;
  readonly scoreText = scoreLabel;
  readonly yearText = yearLabel;
  readonly kind = showFormatLabel;

  constructor() {
    void this.load();
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  onQuery(event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail.value ?? '';
    this.query.set(value.slice(0, LIMITS.search.max));
    this.notice.set('');
    this.savedIds.set({});
    this.searched.set(false);
    if (this.nameTimer) {
      clearTimeout(this.nameTimer);
    }
    this.nameTimer = setTimeout(() => void this.load(), 300);
  }

  onGenre(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>).detail.value ?? '';
    this.genre.set(asGenre(value));
    this.searched.set(false);
    void this.load();
  }

  onYear(event: Event): void {
    const value = String((event as CustomEvent<{ value?: string | number | null }>).detail.value ?? '');
    this.year.set(value === 'undefined' ? '' : value);
    this.searched.set(false);
    void this.load();
  }

  onMin(event: Event): void {
    const value = (event as CustomEvent<{ value?: number }>).detail.value;
    this.minScore.set(clampScore(typeof value === 'number' ? value : 0));
    this.searched.set(false);
    void this.load();
  }

  onSort(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>).detail.value;
    this.sort.set(value === 'date' ? 'date' : 'score');
    void this.load();
  }

  onScoreKind(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>).detail.value;
    this.scoreKind.set(value === 'critic' ? 'critic' : 'audience');
    void this.load();
  }

  onFormat(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>).detail.value;
    this.format.set(value === 'movie' || value === 'series' || value === 'program' ? value : 'all');
  }

  async save(event?: Event): Promise<void> {
    event?.preventDefault();
    const hits = this.visibleHits();
    if (this.busy() || hits.length === 0) {
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    const result = await this.titlesApi.storeHits(hits);
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      this.focusError();
      return;
    }
    const ids: Record<string, string> = {};
    for (const title of result.titles) {
      ids[`${title.mediaType}:${title.tmdbId}`] = title.id;
    }
    this.savedIds.set(ids);
    this.notice.set('Listo. Quedó guardado en la cartelera.');
  }

  async openCard(event: Event, card: CatalogCard): Promise<void> {
    if (card.id) {
      return;
    }
    event.preventDefault();
    const hit = this.hits().find(
      (item) => item.tmdbId === card.tmdbId && item.mediaType === card.mediaType,
    );
    if (!hit) {
      return;
    }
    this.busy.set(true);
    const result = await this.titlesApi.storeHit(hit);
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      this.focusError();
      return;
    }
    const key = `${hit.mediaType}:${hit.tmdbId}`;
    this.savedIds.update((ids) => ({ ...ids, [key]: result.title.id }));
    await this.router.navigate(['/tabs/title', result.title.id]);
  }

  private async load(): Promise<void> {
    const parsedYear = parseYearInput(this.year());
    if (parsedYear.state === 'pending') {
      return;
    }
    if (parsedYear.state === 'invalid') {
      this.error.set(parsedYear.error);
      this.loading.set(false);
      this.focusError();
      return;
    }

    const gen = ++this.loadGen;
    this.loading.set(true);
    if (this.query().trim().length >= LIMITS.search.min) {
      const result = await this.titlesApi.searchLive(this.query());
      if (gen !== this.loadGen) {
        return;
      }
      this.loading.set(false);
      if (!result.ok) {
        this.hits.set([]);
        this.error.set(result.error);
        this.focusError();
        return;
      }
      this.error.set('');
      this.hits.set(result.hits);
      return;
    }
    this.hits.set([]);
    if (!this.narrowed() && !this.searched()) {
      const boards = await this.titlesApi.loadBoards();
      if (gen !== this.loadGen) {
        return;
      }
      if (boards.ok && boards.boards.length > 0) {
        this.loading.set(false);
        this.error.set('');
        this.boards.set(boards.boards);
        return;
      }
      if (!boards.ok) {
        this.error.set(boards.error);
      }
    }
    if (parsedYear.state === 'ok') {
      const discovered = await this.titlesApi.discoverYear(parsedYear.year);
      if (gen !== this.loadGen) {
        return;
      }
      this.loading.set(false);
      if (!discovered.ok) {
        this.error.set(discovered.error);
        this.focusError();
        return;
      }
      this.error.set('');
      this.titles.set(this.arrange(discovered.titles));
      return;
    }
    const result = await this.titlesApi.listCatalog({
      name: this.query(),
      genre: this.genre(),
      year: null,
      minScore: this.minScore(),
      sort: this.sort(),
      scoreKind: this.scoreKind(),
    });
    if (gen !== this.loadGen) {
      return;
    }
    if (!result.ok) {
      this.loading.set(false);
      this.error.set(result.error);
      this.focusError();
      return;
    }
    this.loading.set(false);
    if (!this.error()) {
      this.error.set('');
    }
    this.titles.set(result.titles);
  }

  private pack(
    kinds: { id: 'movie' | 'series' | 'program'; label: string }[],
    cards: CatalogCard[],
    format: 'all' | 'movie' | 'series' | 'program',
  ) {
    return kinds
      .filter((kind) => format === 'all' || format === kind.id)
      .map((kind) => ({
        id: kind.id,
        label: kind.label,
        hint: '',
        cards: cards.filter((card) => showFormat(card) === kind.id),
      }))
      .filter((section) => section.cards.length > 0);
  }

  private cardFromTitle(title: Title): CatalogCard {
    return {
      key: title.id,
      id: title.id,
      tmdbId: title.tmdbId,
      mediaType: title.mediaType,
      name: title.name,
      overview: title.overview,
      releaseDate: title.releaseDate,
      posterUrl: title.posterUrl,
      genres: title.genres,
      audienceScore: title.audienceScore,
      criticScore: title.criticScore,
    };
  }

  private cardFromHit(hit: SearchHit): CatalogCard {
    const key = `${hit.mediaType}:${hit.tmdbId}`;
    return {
      key,
      id: this.savedIds()[key] ?? null,
      tmdbId: hit.tmdbId,
      mediaType: hit.mediaType,
      name: hit.name,
      overview: hit.overview,
      releaseDate: hit.releaseDate,
      posterUrl: hit.posterUrl,
      genres: hit.genres,
      audienceScore: null,
      criticScore: null,
    };
  }

  private arrange(titles: Title[]): Title[] {
    const name = normalizeKey(this.query());
    let next = titles;
    if (name) {
      next = next.filter((title) => normalizeKey(title.name).includes(name));
    }
    if (this.genre()) {
      next = next.filter((title) => matchesGenre(title.genres, this.genre()));
    }
    const minScore = this.minScore();
    if (minScore > 0) {
      next = next.filter((title) => this.scoreOf(title) >= minScore);
    }
    if (this.sort() === 'date') {
      return [...next].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
    }
    return [...next].sort((a, b) => this.scoreOf(b) - this.scoreOf(a));
  }

  private scoreOf(title: Title): number {
    const own = this.scoreKind() === 'critic' ? title.criticScore : title.audienceScore;
    if (own !== null) {
      return own;
    }
    return title.tmdbScore === null ? -1 : title.tmdbScore * 10;
  }

  private focusError(): void {
    setTimeout(() => document.getElementById('form-error')?.focus());
  }
}

