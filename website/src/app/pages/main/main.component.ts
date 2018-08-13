import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Store, Select } from '@ngxs/store';
import { MonzoState, Transaction } from 'src/app/store/state/monzo.state';
import { Observable, combineLatest } from 'rxjs';
import { UpdateTransactions, UpdateBalance, ToggleIgnoreTransaction } from '../../store/actions/index';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainComponent implements OnInit {

  @Select(MonzoState.getTransactions) transactions$: Observable<Transaction[]>;
  @Select(MonzoState.getIgnoredTransactions) ignoredTransactions$: Observable<string[]>;
  @Select(MonzoState.getBalance) balance$: Observable<number>;
  @Select(MonzoState.getBudget) budget$: Observable<number>;
  @Select(MonzoState.getStartDay) startDay$: Observable<string>;

  constructor(private store: Store) { }

  ngOnInit() {
    this.store.dispatch(new UpdateTransactions());
    this.ignoredTransactions$.subscribe(_ => console.log('new value', _));
    combineLatest(this.transactions$, this.ignoredTransactions$, this.startDay$, this.budget$)
      .subscribe(([transactions, ignoredTransactions, startDay, budget]) => {
        console.log('called');
        this.updateBalance(transactions, ignoredTransactions, startDay, budget);
      });
  }

  public getTransactionValue(value: number): number {
    return value / 100;
  }

  public isTransactionIgnored(id: string): Observable<string> {
    return this.ignoredTransactions$.pipe(
      map((ignored) => {
        return (ignored.includes(id)) ? 'ignored' : '';
      })
    );
  }

  public toggleTransactionIgnored(id: string): void {
    this.store.dispatch(new ToggleIgnoreTransaction(id));
  }

  private updateBalance(transactions: Transaction[], ignoredTransactions: string[], startDay: string, budget: number): void {
    const balance = this.daysSinceStart(startDay) * budget;
    const difference = this.moneySpent(transactions, ignoredTransactions);
    this.store.dispatch(new UpdateBalance(balance - difference));
  }

  private daysSinceStart(startDay: string): number {
    const a = new Date(startDay),
      b = new Date(),
      difference = this.dateDiffInDays(a, b);
    return difference;
  }

  private dateDiffInDays(a: Date, b: Date): number {
    const _MS_PER_DAY = 1000 * 60 * 60 * 24;

    // Discard the time and time-zone information.
    const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

    return Math.floor((utc2 - utc1) / _MS_PER_DAY);
  }

  private moneySpent(transactions: Transaction[], ignoredTransactions: string[]): number {
    return transactions.reduce((currentValue: number, transaction: Transaction) => {
      // Only use the transaction value if it is not ignored
      if (ignoredTransactions.includes(transaction.id) === false) {
        currentValue += -(transaction.amount / 100);
      }
      return currentValue;
    }, 0);
  }

}
