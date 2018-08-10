import { Injectable } from '@angular/core';
import { Transaction } from 'src/app/store/state/monzo.state';
import { testTransactions } from 'src/app/store/test-transactions';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MonzoService {

  constructor() { }

  public getTransactions(): Observable<Transaction[]> {
    return of(testTransactions);
  }
}
