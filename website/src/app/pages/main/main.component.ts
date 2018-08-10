import { Component, OnInit } from '@angular/core';
import { Store, Select } from '@ngxs/store';
import { MonzoState, Transaction } from 'src/app/store/state/monzo.state';
import { Observable, zip } from 'rxjs';
import { UpdateTransactions, UpdateBalance } from '../../store/actions/index';
import { start } from 'repl';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {

  @Select(MonzoState.getTransactions) transactions$: Observable<Transaction[]>;
  @Select(MonzoState.getBalance) balance$: Observable<number>;
  @Select(MonzoState.getBudget) budget$: Observable<number>;
  @Select(MonzoState.getStartDay) startDay$: Observable<number>;

  constructor(private store: Store) { }

  ngOnInit() {
    this.store.dispatch(new UpdateTransactions());
    zip(this.transactions$, this.startDay$, this.budget$)
      .subscribe(([transactions, startDay, budget]) => this.updateBalance(transactions, startDay, budget));
  }

  public getTransactionValue(value: number): number {
    return value / 100;
  }

  private updateBalance(transactions: Transaction[], startDay: number, budget: number): void {
    const balance = this.daysSinceStart(startDay) * budget;
    const difference = this.moneySpent(transactions);
    this.store.dispatch(new UpdateBalance(balance - difference));
  }

  private daysSinceStart(startDay: number): number {
    return 1;
  }

  private moneySpent(transactions: Transaction[]): number {
    return transactions.reduce((currentValue: number, transaction: Transaction) => {
      currentValue += (transaction.amount / 100);
      return currentValue;
    }, 0);
  }

}
