import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonRange,
  IonTextarea,
  IonThumbnail,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { AuthService } from '../../core/auth.service';
import { dateLabel, hideBrokenImage, languageLabel, mediaLabel, roleLabel, runtimeLabel, scoreLabel } from '../../core/display';
import { LIMITS } from '../../core/limits';
import type { Review, Title } from '../../core/models';
import { ReviewsService } from '../../core/reviews.service';
import { TitlesService } from '../../core/titles.service';
import { clampScore } from '../../core/validation';

@Component({
  selector: 'app-title',
  templateUrl: './title.page.html',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonThumbnail,
    IonTextarea,
    IonRange,
    IonButton,
  ],
})
export class TitlePage {
  private readonly route = inject(ActivatedRoute);
  private readonly titlesApi = inject(TitlesService);
  private readonly reviewsApi = inject(ReviewsService);
  private readonly alerts = inject(AlertController);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly title = signal<Title | null>(null);
  readonly reviews = signal<Review[]>([]);
  readonly error = signal('');
  readonly notice = signal('');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly body = signal('');
  readonly score = signal(70);

  readonly limits = LIMITS;
  readonly hideBroken = hideBrokenImage;
  readonly scoreText = scoreLabel;
  readonly dateText = dateLabel;
  readonly runtimeText = runtimeLabel;
  readonly languageText = languageLabel;
  readonly kind = mediaLabel;
  readonly roleText = roleLabel;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      void this.open(params.get('id') ?? '');
    });
  }

  onBody(event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail.value ?? '';
    this.body.set(value.slice(0, LIMITS.review.max));
  }

  onScore(event: Event): void {
    const value = (event as CustomEvent<{ value?: number }>).detail.value;
    this.score.set(clampScore(typeof value === 'number' ? value : 0));
  }

  ownReview(): Review | null {
    const userId = this.auth.user()?.id;
    return this.reviews().find((review) => review.authorId === userId) ?? null;
  }

  async save(): Promise<void> {
    const title = this.title();
    const user = this.auth.user();
    if (!title || !user || this.busy()) {
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    const result = await this.reviewsApi.save({
      titleId: title.id,
      authorId: user.id,
      body: this.body(),
      score: this.score(),
    });
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      setTimeout(() => document.getElementById('form-error')?.focus());
      return;
    }
    this.notice.set(this.ownReview() ? 'Reseña actualizada.' : 'Reseña publicada.');
    await this.open(title.id, true);
  }

  async confirmDelete(): Promise<void> {
    const own = this.ownReview();
    if (!own) {
      return;
    }
    const alert = await this.alerts.create({
      header: 'Borrar reseña',
      message: 'Se quita tu opinión y se recalcula el puntaje.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar',
          role: 'destructive',
          handler: () => {
            void this.remove(own.id);
          },
        },
      ],
    });
    await alert.present();
  }

  private async open(id: string, quiet = false): Promise<void> {
    if (!id) {
      this.loading.set(false);
      this.error.set('No se encontró el título.');
      return;
    }
    if (!quiet) {
      this.error.set('');
      this.notice.set('');
    }
    this.loading.set(!quiet);
    const [titleResult, reviewResult] = await Promise.all([
      this.titlesApi.getById(id),
      this.reviewsApi.listForTitle(id),
    ]);
    this.loading.set(false);
    if (!titleResult.ok) {
      this.title.set(null);
      this.error.set(titleResult.error);
      return;
    }
    this.title.set(titleResult.title);
    if (!reviewResult.ok) {
      this.error.set(reviewResult.error);
      this.reviews.set([]);
      return;
    }
    this.reviews.set(reviewResult.reviews);
    const own = reviewResult.reviews.find((review) => review.authorId === this.auth.user()?.id);
    this.body.set(own?.body ?? '');
    this.score.set(own?.score ?? 70);
  }

  private async remove(id: string): Promise<void> {
    const user = this.auth.user();
    const title = this.title();
    if (!user || !title) {
      return;
    }
    this.error.set('');
    this.notice.set('');
    const result = await this.reviewsApi.remove(id, user.id);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.notice.set('Reseña borrada.');
    await this.open(title.id, true);
  }
}
