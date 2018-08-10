import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from 'src/app/app-routing.module';
import { AppComponent } from 'src/app/app.component';
import { NgxsModule } from '@ngxs/store';
import { MonzoState } from 'src/app/store/state/monzo.state';
import { MainComponent } from 'src/app/pages/main/main.component';
import { MonzoService } from './services/monzo.service';

@NgModule({
  declarations: [
    AppComponent,
    MainComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    NgxsModule.forRoot([MonzoState])
  ],
  providers: [
    MonzoService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
