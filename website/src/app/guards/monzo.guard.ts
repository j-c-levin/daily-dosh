import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { LocalStorage } from '@ngx-pwa/local-storage';
import { map, tap, filter } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MonzoGuard implements CanActivate {

  redirectUri = environment.redirectUri;
  state = '96d2eb6a-c1ab-40db-878e-97af6e04ee8d';
  // tslint:disable-next-line:max-line-length
  authenticationUrl = `https://auth.monzo.com/?client_id=${environment.clientId}&redirect_uri=${this.redirectUri}&response_type=code&state=${this.state}`;

  constructor(private localStorage: LocalStorage, private router: Router) { }

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean> {
    return this.localStorage
      .getItem(environment.monzoStorageKey)
      .pipe(
        map(key => key !== null),
        map(hasKey => {
          console.log('has key', hasKey);
          const hasCode = Object.keys(next.queryParams).includes('code');
          console.log('has code', hasCode);
          if (hasKey === false && hasCode) {
            // this.router.navigateByUrl(`oauth/redirect?code=${next.queryParams.code}&state=${next.queryParams.state}`);
            console.log('has code');
            return false;
          } else {
            return hasKey;
          }
        }),
        tap(result => {
          // Redirect to log in via monzo
          if (result === false) {
            // window.location.href = this.authenticationUrl;
          }
        })
      );
  }
}
