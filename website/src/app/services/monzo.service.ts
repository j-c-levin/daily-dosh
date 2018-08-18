import { Injectable } from '@angular/core';
import { Transaction } from 'src/app/store/state/monzo.state';
import { testTransactions } from 'src/app/store/test-transactions';
import { Observable, of } from 'rxjs';
import { LocalStorage } from '@ngx-pwa/local-storage';
import { environment } from 'src/environments/environment';
import { Http, RequestOptions, Headers } from '@angular/http';
import { switchMap, map, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class MonzoService {

  constructor(
    private localStorage: LocalStorage,
    private http: Http
  ) { }

  public getTransactions(): Observable<Transaction[]> {
    return this.localStorage
      .getItem(environment.monzoStorageKey)
      .pipe(
        switchMap(key => {
          const options = new RequestOptions({
            headers: new Headers({
              'Authorization': `Bearer ${key}`
            })
          });
          return this.http.get('https://api.monzo.com/transactions?account_id=acc_00009QPVkYD07hFl8yz9W5&since=2018-07-26', options);
        }),
        map(response => response.json().transactions)
      );
  }
}
