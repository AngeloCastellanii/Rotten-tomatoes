import type { Routes } from '@angular/router';

import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'catalog',
        loadComponent: () => import('../pages/catalog/catalog.page').then((m) => m.CatalogPage),
      },
      {
        path: 'title/:id',
        loadComponent: () => import('../pages/title/title.page').then((m) => m.TitlePage),
      },
      {
        path: 'reviews',
        loadComponent: () => import('../pages/reviews/reviews.page').then((m) => m.ReviewsPage),
      },
      {
        path: 'profile',
        loadComponent: () => import('../pages/profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: '',
        redirectTo: '/tabs/catalog',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/catalog',
    pathMatch: 'full',
  },
];
