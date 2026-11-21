import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
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
  ],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly forms = inject(FormBuilder);

  readonly error = signal('');
  readonly busy = signal(false);
  readonly form = this.forms.nonNullable.group({
    email: '',
    password: '',
  });

  async submit(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.error.set('');
    this.busy.set(true);
    const result = await this.auth.login(this.form.getRawValue());
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    await this.router.navigateByUrl('/tabs/profile');
  }
}
