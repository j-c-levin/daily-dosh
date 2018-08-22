import { Component, OnInit } from '@angular/core';
import { Http } from '@angular/http';
import { environment } from 'src/environments/environment';
import { ActivatedRoute, Router } from '@angular/router';
import { switchMap, map, tap, zip, combineAll, zipAll } from 'rxjs/operators';
import { LocalStorage } from '@ngx-pwa/local-storage';
import { Store } from '@ngxs/store';
import { SetAccessKey } from '../../store/actions/index';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent implements OnInit {

  constructor(
    private http: Http,
    private activatedRoute: ActivatedRoute,
    private localStorage: LocalStorage,
    private router: Router,
    private store: Store
  ) { }

  ngOnInit() {
    this.activatedRoute.queryParams
      .pipe(
        switchMap(params => {
          const body = { code: params.code };
          const url = `${environment.serverUrl}/auth`;
          return this.http.post(url, body);
        }),
        map(res => res.json()),
        switchMap((response) => this.localStorage.setItem(environment.monzoStorageKey, response.storage_key)),
        tap(() => this.router.navigate(['/']))
      )
      .subscribe();
  }

}
