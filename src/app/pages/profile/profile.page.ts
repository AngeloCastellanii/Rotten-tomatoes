import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';

import { AuthService } from '../../core/auth.service';
import type { UserRole } from '../../core/models';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonInput,
    IonButton,
    IonButtons,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonToggle,
    IonItem,
  ],
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly forms = inject(FormBuilder);
  private readonly alerts = inject(AlertController);
  readonly theme = inject(ThemeService);

  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly role = signal<UserRole>(this.auth.user()?.role ?? 'audience');
  readonly form = this.forms.nonNullable.group({
    name: this.auth.user()?.name ?? '',
    email: this.auth.user()?.email ?? '',
    password: '',
  });

  onRole(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>).detail.value;
    this.role.set(value === 'critic' ? 'critic' : 'audience');
  }

  async save(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    const result = await this.auth.updateProfile({
      ...this.form.getRawValue(),
      role: this.role(),
    });
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      setTimeout(() => document.getElementById('form-error')?.focus());
      return;
    }
    this.form.controls.password.setValue('');
    this.notice.set('Perfil actualizado.');
  }

  async confirmDelete(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Borrar cuenta',
      message: 'Se elimina tu perfil y tus reseñas.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar',
          role: 'destructive',
          handler: () => {
            void this.remove();
          },
        },
      ],
    });
    await alert.present();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private async remove(): Promise<void> {
    this.error.set('');
    const result = await this.auth.deleteAccount();
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    await this.router.navigateByUrl('/login');
  }
}
