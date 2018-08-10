import { Component, OnInit } from '@angular/core';
import { Store, Select } from '@ngxs/store';
import { MonzoState, Transaction } from 'src/app/store/state/monzo.state';
import { Observable, zip } from 'rxjs';
import { UpdateTransactions, UpdateBalance } from '../../store/actions/index';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {

  @Select(MonzoState.getTransactions) transactions$: Observable<Transaction[]>;
  @Select(MonzoState.getBalance) balance$: Observable<number>;
  @Select(MonzoState.getBudget) budget$: Observable<number>;
  @Select(MonzoState.getStartDay) startDay$: Observable<string>;

  constructor(private store: Store) { }

  ngOnInit() {
    this.store.dispatch(new UpdateTransactions());
    zip(this.transactions$, this.startDay$, this.budget$)
      .subscribe(([transactions, startDay, budget]) => this.updateBalance(transactions, startDay, budget));
  }

  public getTransactionValue(value: number): number {
    return value / 100;
  }

  private updateBalance(transactions: Transaction[], startDay: string, budget: number): void {
    const balance = this.daysSinceStart(startDay) * budget;
    const difference = this.moneySpent(transactions);
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

  private moneySpent(transactions: Transaction[]): number {
    return transactions.reduce((currentValue: number, transaction: Transaction) => {
      currentValue += -(transaction.amount / 100);
      return currentValue;
    }, 0);
  }

}
