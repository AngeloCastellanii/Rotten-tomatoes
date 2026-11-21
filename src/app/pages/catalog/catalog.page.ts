import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
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

import { hideBrokenImage, mediaLabel, scoreLabel, yearLabel } from '../../core/display';
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
  private request = 0;
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
  readonly searched = signal(false);
  readonly filtering = computed(
    () =>
      this.query().trim() !== '' ||
      this.genre() !== '' ||
      this.year().trim() !== '' ||
      this.minScore() > 0,
  );

  readonly limits = LIMITS;
  readonly hideBroken = hideBrokenImage;
  readonly scoreText = scoreLabel;
  readonly yearText = yearLabel;
  readonly kind = mediaLabel;

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

  async search(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.busy()) {
      return;
    }
    this.error.set('');
    this.busy.set(true);
    const result = await this.titlesApi.searchAndStore(this.query());
    this.busy.set(false);
    this.searched.set(true);
    if (!result.ok) {
      this.error.set(result.error);
      this.focusError();
      return;
    }
    await this.load();
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

    const current = ++this.request;
    this.loading.set(true);
    const result = await this.titlesApi.listCatalog({
      name: this.query(),
      genre: this.genre(),
      year: parsedYear.state === 'ok' ? parsedYear.year : null,
      minScore: this.minScore(),
      sort: this.sort(),
      scoreKind: this.scoreKind(),
    });
    if (current !== this.request) {
      return;
    }
    this.loading.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      this.focusError();
      return;
    }
    this.error.set('');
    this.titles.set(result.titles);
  }

  private focusError(): void {
    setTimeout(() => document.getElementById('form-error')?.focus());
  }
}
