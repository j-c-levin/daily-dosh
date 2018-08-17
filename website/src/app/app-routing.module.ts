import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MainComponent } from 'src/app/pages/main/main.component';
import { MonzoGuard } from './guards/monzo.guard';

const routes: Routes = [
  {
    path: '',
    component: MainComponent,
    canActivate: [MonzoGuard]
  },
  {
    path: 'oauth/redirect',
    component: MainComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
