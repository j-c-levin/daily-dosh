import { State, Selector } from '@node_modules/@ngxs/store';
import { testTransactions } from './test-transactions';
import { Observable } from 'node_modules/rxjs';

export interface Transaction {
    amount: number;
    id: string;
    description: string;
    created: string;
    [others: string]: any;
}

export class MonzoStateModel {
    transactions: Transaction[];
}

@State<MonzoStateModel>({
    name: 'Monzo',
    defaults: {
        transactions: testTransactions
    }
})

export class MonzoState {

    @Selector()
    static getTransactions(state: MonzoStateModel): Transaction[] {
        return state.transactions;
    }
}
