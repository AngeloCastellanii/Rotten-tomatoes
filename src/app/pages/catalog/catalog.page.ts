import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonRange,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonThumbnail,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { mediaLabel, scoreLabel, yearLabel } from '../../core/display';
import { CATALOG_GENRES } from '../../core/genres';
import type { CatalogSort, GenreId, Title, UserRole } from '../../core/models';
import { TitlesService } from '../../core/titles.service';
import { validateYear } from '../../core/validation';

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
    IonList,
    IonItem,
    IonLabel,
    IonThumbnail,
    IonSpinner,
    IonText,
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
    const value = (event as CustomEvent<{ value?: string | null }>).detail.value;
    this.query.set(value ?? '');
    this.searched.set(false);
    if (this.nameTimer) {
      clearTimeout(this.nameTimer);
    }
    this.nameTimer = setTimeout(() => void this.load(), 300);
  }

  onGenre(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>).detail.value;
    this.genre.set(value === 'accion' || value === 'drama' || value === 'misterio' ? value : '');
    this.searched.set(false);
    void this.load();
  }

  onYear(event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail.value ?? '';
    this.year.set(value);
    this.searched.set(false);
    if (value.trim() !== '' && !/^\d{4}$/.test(value.trim())) {
      return;
    }
    void this.load();
  }

  onMin(event: Event): void {
    const value = (event as CustomEvent<{ value?: number }>).detail.value;
    this.minScore.set(typeof value === 'number' ? Math.round(value) : 0);
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
      return;
    }
    await this.load();
  }

  private async load(): Promise<void> {
    const rawYear = this.year().trim();
    let year: number | null = null;
    if (rawYear) {
      if (!/^\d{4}$/.test(rawYear)) {
        return;
      }
      year = Number(rawYear);
      const check = validateYear(year);
      if (!check.ok) {
        this.error.set(check.error ?? 'Año inválido.');
        return;
      }
    }

    const current = ++this.request;
    this.loading.set(true);
    const result = await this.titlesApi.listCatalog({
      name: this.query(),
      genre: this.genre(),
      year,
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
      return;
    }
    this.error.set('');
    this.titles.set(result.titles);
  }
}
