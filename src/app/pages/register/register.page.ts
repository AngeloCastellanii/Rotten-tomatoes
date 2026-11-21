import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { AuthService } from '../../core/auth.service';
import type { UserRole } from '../../core/models';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonInput,
    IonButton,
    IonText,
    IonSegment,
    IonSegmentButton,
    IonLabel,
  ],
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly forms = inject(FormBuilder);

  readonly error = signal('');
  readonly busy = signal(false);
  readonly role = signal<UserRole>('audience');
  readonly form = this.forms.nonNullable.group({
    name: '',
    email: '',
    password: '',
  });

  onRole(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>).detail.value;
    this.role.set(value === 'critic' ? 'critic' : 'audience');
  }

  async submit(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.error.set('');
    this.busy.set(true);
    const result = await this.auth.register({
      ...this.form.getRawValue(),
      role: this.role(),
    });
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    await this.router.navigateByUrl('/tabs/catalog');
  }
}
