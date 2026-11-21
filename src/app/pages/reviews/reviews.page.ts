import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonText,
  IonThumbnail,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { AuthService } from '../../core/auth.service';
import { roleLabel } from '../../core/display';
import type { Review } from '../../core/models';
import { ReviewsService } from '../../core/reviews.service';

@Component({
  selector: 'app-reviews',
  templateUrl: './reviews.page.html',
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonThumbnail,
    IonButton,
    IonSpinner,
    IonText,
  ],
})
export class ReviewsPage {
  private readonly auth = inject(AuthService);
  private readonly reviewsApi = inject(ReviewsService);
  private readonly alerts = inject(AlertController);

  readonly reviews = signal<Review[]>([]);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly roleText = roleLabel;

  ionViewWillEnter(): void {
    void this.load();
  }

  async confirmDelete(review: Review): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Borrar reseña',
      message: `Se quita tu opinión de ${review.titleName ?? 'este título'}.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar',
          role: 'destructive',
          handler: () => {
            void this.remove(review);
          },
        },
      ],
    });
    await alert.present();
  }

  private async load(): Promise<void> {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      this.reviews.set([]);
      return;
    }
    this.loading.set(true);
    const result = await this.reviewsApi.listMine(user.id);
    this.loading.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.error.set('');
    this.reviews.set(result.reviews);
  }

  private async remove(review: Review): Promise<void> {
    const user = this.auth.user();
    if (!user) {
      return;
    }
    const result = await this.reviewsApi.remove(review.id, user.id);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    await this.load();
  }
}
