import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);

  constructor() {
    void this.auth.ready;
    void this.theme.dark();
  }
}
