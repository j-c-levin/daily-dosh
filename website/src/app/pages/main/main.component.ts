import { Component, OnInit } from '@angular/core';
import { Store, Selector, Select } from 'node_modules/@ngxs/store';
import { MonzoState, Transaction } from '../../store/monzo.state';
import { Observable } from 'node_modules/rxjs';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {

  @Select(MonzoState.getTransactions) transactions$: Observable<Transaction[]>;

  constructor(private store: Store) { }

  ngOnInit() {
  }

}
