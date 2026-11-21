import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-reviews',
  templateUrl: './reviews.page.html',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class ReviewsPage {}
