import { Injectable } from '@angular/core';
import { Transaction } from 'src/app/store/state/monzo.state';
import { testTransactions } from 'src/app/store/test-transactions';
import { Observable, of, zip } from 'rxjs';
import { LocalStorage } from '@ngx-pwa/local-storage';
import { environment } from 'src/environments/environment';
import { Http, RequestOptions, Headers } from '@angular/http';
import { switchMap, map, tap, combineAll, catchError, filter } from 'rxjs/operators';
import { Store } from '@ngxs/store';
import { MonzoStateModel } from '../store/state/monzo.state';

@Injectable({
  providedIn: 'root'
})
export class MonzoService {

  constructor(
    private localStorage: LocalStorage,
    private http: Http,
    private store: Store
  ) { }

  public getTransactions(): Observable<Transaction[]> {
    return this.localStorage.getItem(environment.monzoStorageKey)
      .pipe(
        switchMap(storageKey => this.http.get(`${environment.serverUrl}/auth?storage_key=${storageKey}`)),
        catchError((err) => {
          console.error('error getting access token:' + err);
          this.localStorage.removeItem(environment.monzoStorageKey)
            .pipe(map(() => window.location.reload()));
          return of(null);
        }),
        map(res => res.json().access_token),
        switchMap((accessKey) => {
          return zip(of(accessKey), this.localStorage.getItem(environment.startDateStorageKey));
        }),
        switchMap(([accessKey, startDate]) => {
          const options = new RequestOptions({
            headers: new Headers({
              'Authorization': `Bearer ${accessKey}`
            })
          });
          return this.http.get(`https://api.monzo.com/transactions?account_id=acc_00009QPVkYD07hFl8yz9W5&since=${startDate}`, options);
        }),
        map(response => response.json().transactions),
        map((transactions: Transaction[]) => transactions.reverse()),
      );
  }
}
