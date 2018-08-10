import { State, Selector, Action, StateContext } from '@node_modules/@ngxs/store';
import { UpdateTransactions, UpdateBalance } from '../actions/index';
import { MonzoService } from '../../services/monzo.service';
import { of } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';

export interface Transaction {
    amount: number;
    id: string;
    description: string;
    created: string;
    [others: string]: any;
}

export class MonzoStateModel {
    transactions: Transaction[];
    currentBalance: number;
    dailyBudget: number;
    startDay: string;
}

@State<MonzoStateModel>({
    name: 'Monzo',
    defaults: {
        transactions: [],
        currentBalance: 0,
        dailyBudget: 30,
        startDay: '2018-08-09T22:05:15.154Z'
    }
})

export class MonzoState {

    constructor(private monzoService: MonzoService) { }

    @Selector()
    static getTransactions(state: MonzoStateModel): Transaction[] {
        return state.transactions;
    }

    @Selector()
    static getBalance(state: MonzoStateModel): number {
        return state.currentBalance;
    }

    @Selector()
    static getBudget(state: MonzoStateModel): number {
        return state.dailyBudget;
    }

    @Selector()
    static getStartDay(state: MonzoStateModel): string {
        return state.startDay;
    }

    @Action(UpdateTransactions)
    updateTransactions(ctx: StateContext<MonzoStateModel>): void {
        this.monzoService.getTransactions()
            .pipe(
                // Set the transactions in the state
                tap(transactions => {
                    const state = ctx.getState();
                    ctx.setState({
                        ...state,
                        transactions
                    });
                })
            )
            .subscribe();
    }

    @Action(UpdateBalance)
    updateBalance(ctx: StateContext<MonzoStateModel>, { payload }: UpdateBalance) {
        const state = ctx.getState();
        ctx.setState({
            ...state,
            currentBalance: payload
        });
    }
}
