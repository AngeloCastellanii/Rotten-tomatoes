import { Component, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput } from '@ionic/angular';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonContent,
    IonInput,
    IonButton,
  ],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly forms = inject(FormBuilder);
  private readonly emailField = viewChild<IonInput>('emailField');

  readonly mode = signal<'welcome' | 'login'>('welcome');
  readonly showPassword = signal(false);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly form = this.forms.nonNullable.group({
    email: '',
    password: '',
  });

  showLogin(): void {
    this.mode.set('login');
    setTimeout(() => void this.emailField()?.setFocus());
  }

  showWelcome(): void {
    this.error.set('');
    this.mode.set('welcome');
    setTimeout(() => document.getElementById('gate-enter')?.focus());
  }

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
      setTimeout(() => document.getElementById('form-error')?.focus());
      return;
    }
    await this.router.navigateByUrl('/tabs/catalog');
  }
}
