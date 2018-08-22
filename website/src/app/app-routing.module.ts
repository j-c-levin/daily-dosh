import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MainComponent } from 'src/app/pages/main/main.component';
import { MonzoGuard } from './guards/monzo.guard';
import { AuthComponent } from './pages/auth/auth.component';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    component: MainComponent,
    canActivate: [MonzoGuard]
  },
  {
    path: 'oauth/redirect',
    component: AuthComponent,
    canActivate: [AuthGuard]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
