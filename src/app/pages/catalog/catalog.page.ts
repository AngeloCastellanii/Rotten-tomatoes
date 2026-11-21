import { Component, inject, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSpinner,
  IonText,
  IonThumbnail,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import type { Title } from '../../core/models';
import { TitlesService } from '../../core/titles.service';

@Component({
  selector: 'app-catalog',
  templateUrl: './catalog.page.html',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonButton,
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

  readonly titles = signal<Title[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly query = signal('');
  readonly searched = signal(false);

  constructor() {
    void this.loadRecent();
  }

  onQuery(event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail.value;
    this.query.set(value ?? '');
  }

  async search(): Promise<void> {
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
    this.titles.set(result.titles);
  }

  year(value: string | null): string {
    return value ? value.slice(0, 4) : 'Sin fecha';
  }

  kind(title: Title): string {
    return title.mediaType === 'tv' ? 'Serie' : 'Película';
  }

  private async loadRecent(): Promise<void> {
    const result = await this.titlesApi.listRecent();
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    if (!this.searched()) {
      this.titles.set(result.titles);
    }
  }
}
