import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from 'src/app/app-routing.module';
import { AppComponent } from 'src/app/app.component';
import { NgxsModule } from '@ngxs/store';
import { MonzoState } from 'src/app/store/state/monzo.state';
import { MainComponent } from 'src/app/pages/main/main.component';
import { MonzoService } from './services/monzo.service';
import { NgxsReduxDevtoolsPluginModule } from '@ngxs/devtools-plugin';
import { AuthComponent } from './pages/auth/auth.component';
import { HttpModule } from '@angular/http';

@NgModule({
  declarations: [
    AppComponent,
    MainComponent,
    AuthComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    NgxsModule.forRoot([MonzoState]),
    NgxsReduxDevtoolsPluginModule.forRoot(),
    HttpModule
  ],
  providers: [
    MonzoService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
