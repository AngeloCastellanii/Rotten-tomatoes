import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
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
import { CATALOG_GENRES } from '../../core/genres';
import type { CatalogSort, GenreId, Title, UserRole } from '../../core/models';
import { TitlesService } from '../../core/titles.service';
import { asGenre, clampScore, parseYearInput } from '../../core/validation';
import { LIMITS } from '../../core/limits';

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
    IonInput,
    IonRange,
    IonSegment,
    IonSegmentButton,
    IonLabel,
  ],
})
export class CatalogPage {
  private readonly titlesApi = inject(TitlesService);
  private loadGen = 0;
  private nameTimer: ReturnType<typeof setTimeout> | null = null;

  readonly genres = CATALOG_GENRES;
  readonly titles = signal<Title[]>([]);
  readonly error = signal('');
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
  readonly filtering = computed(
    () =>
      this.query().trim() !== '' ||
      this.genre() !== '' ||
      this.year().trim() !== '' ||
      this.minScore() > 0 ||
      this.format() !== 'all',
  );
  readonly groups = computed(() => {
    const format = this.format();
    const sections = [
      { id: 'movie' as const, label: 'Películas' },
      { id: 'series' as const, label: 'Series' },
      { id: 'program' as const, label: 'Programas de televisión' },
    ];
    return sections
      .filter((section) => format === 'all' || format === section.id)
      .map((section) => ({
        ...section,
        titles: this.titles().filter((title) => showFormat(title) === section.id),
      }))
      .filter((section) => section.titles.length > 0);
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
    const value = (event as CustomEvent<{ value?: string | null }>).detail.value ?? '';
    const digits = value.replace(/\D/g, '').slice(0, 4);
    this.year.set(digits);
    this.searched.set(false);
    const parsed = parseYearInput(digits);
    if (parsed.state === 'invalid') {
      this.error.set(parsed.error);
      return;
    }
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

  async search(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.busy()) {
      return;
    }
    this.error.set('');
    if (this.nameTimer) {
      clearTimeout(this.nameTimer);
    }
    const gen = ++this.loadGen;
    this.busy.set(true);
    this.loading.set(true);
    try {
      const result = await this.titlesApi.searchAndStore(this.query());
      if (gen !== this.loadGen) {
        return;
      }
      this.searched.set(true);
      if (!result.ok) {
        this.error.set(result.error);
        this.focusError();
        return;
      }
      this.error.set('');
      this.titles.set(result.titles);
    } finally {
      this.busy.set(false);
      if (gen === this.loadGen) {
        this.loading.set(false);
      }
    }
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
    const result = await this.titlesApi.listCatalog({
      name: this.query(),
      genre: this.genre(),
      year: parsedYear.state === 'ok' ? parsedYear.year : null,
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
    if (result.titles.length === 0 && !this.filtering() && !this.searched()) {
      const seeded = await this.titlesApi.storePopular();
      if (gen !== this.loadGen) {
        return;
      }
      if (!seeded.ok) {
        this.loading.set(false);
        this.error.set(seeded.error);
        this.focusError();
        return;
      }
      const again = await this.titlesApi.listCatalog({
        name: this.query(),
        genre: this.genre(),
        year: parsedYear.state === 'ok' ? parsedYear.year : null,
        minScore: this.minScore(),
        sort: this.sort(),
        scoreKind: this.scoreKind(),
      });
      if (gen !== this.loadGen) {
        return;
      }
      this.loading.set(false);
      if (!again.ok) {
        this.error.set(again.error);
        this.focusError();
        return;
      }
      this.error.set('');
      this.titles.set(again.titles);
      return;
    }
    this.loading.set(false);
    this.error.set('');
    this.titles.set(result.titles);
  }

  private focusError(): void {
    setTimeout(() => document.getElementById('form-error')?.focus());
  }
}
