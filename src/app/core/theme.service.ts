import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const THEME_KEY = 'theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly dark = signal(false);
  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.restore();
  }

  async setDark(dark: boolean): Promise<void> {
    await this.readyPromise;
    await Preferences.set({ key: THEME_KEY, value: dark ? 'dark' : 'light' });
    this.apply(dark);
  }

  private async restore(): Promise<void> {
    const { value } = await Preferences.get({ key: THEME_KEY });
    if (value === 'dark' || value === 'light') {
      this.apply(value === 'dark');
      return;
    }
    this.apply(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  private apply(dark: boolean): void {
    this.dark.set(dark);
    document.documentElement.classList.toggle('ion-palette-dark', dark);
  }
}
