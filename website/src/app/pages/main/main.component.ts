import { Component, OnInit } from '@angular/core';
import { Store, Select } from '@ngxs/store';
import { MonzoState, Transaction } from 'src/app/store/state/monzo.state';
import { Observable } from 'rxjs';
import { UpdateBalance } from '../../store/actions/index';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {

  @Select(MonzoState.getTransactions) transactions$: Observable<Transaction[]>;
  @Select(MonzoState.getBalance) balance$: Observable<number>;
  @Select(MonzoState.getBudget) budget$: Observable<number>;

  constructor(private store: Store) { }

  ngOnInit() {
    this.store.dispatch(new UpdateBalance());
  }

}
