import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

describe('AppComponent', () => {
  it('should create the app', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { ready: Promise.resolve(), user: () => null, loading: () => false },
        },
        { provide: ThemeService, useValue: { dark: () => false } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
