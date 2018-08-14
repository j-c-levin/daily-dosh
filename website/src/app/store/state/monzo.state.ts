import { State, Selector, Action, StateContext } from '@node_modules/@ngxs/store';
import { UpdateTransactions, UpdateBalance, ToggleIgnoreTransaction, UpdateIgnoredTransactions } from '../actions/index';
import { MonzoService } from '../../services/monzo.service';
import { tap } from 'rxjs/operators';
import { LocalStorage } from '@ngx-pwa/local-storage';

export interface Transaction {
    amount: number;
    id: string;
    description: string;
    created: string;
    [others: string]: any;
}

export class MonzoStateModel {
    transactions: Transaction[];
    ignoredTransactions: string[];
    currentBalance: number;
    dailyBudget: number;
    startDay: string;
}

@State<MonzoStateModel>({
    name: 'Monzo',
    defaults: {
        transactions: [],
        ignoredTransactions: [],
        currentBalance: 0,
        dailyBudget: 52,
        startDay: '2018-07-26'
    }
})

export class MonzoState {
    ignoredItemsKey = 'ignoredItems';

    constructor(private monzoService: MonzoService, private localStorage: LocalStorage) { }

    @Selector()
    static getTransactions(state: MonzoStateModel): Transaction[] {
        return state.transactions;
    }

    @Selector()
    static getIgnoredTransactions(state: MonzoStateModel): string[] {
        return state.ignoredTransactions;
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

    @Action(UpdateIgnoredTransactions)
    updateIgnoredTransactions(ctx: StateContext<MonzoStateModel>): void {
        this.localStorage.getItem(this.ignoredItemsKey)
            .subscribe((ignoredTransactions: string[]) => {
                if (ignoredTransactions === null) {
                    ignoredTransactions = [];
                }
                const state = ctx.getState();
                ctx.setState({
                    ...state,
                    ignoredTransactions
                });
            });
    }

    @Action(UpdateBalance)
    updateBalance(ctx: StateContext<MonzoStateModel>, { payload }: UpdateBalance) {
        const state = ctx.getState();
        ctx.setState({
            ...state,
            currentBalance: payload
        });
    }

    @Action(ToggleIgnoreTransaction)
    toggleIgnoreTransaction(ctx: StateContext<MonzoStateModel>, { payload }: ToggleIgnoreTransaction) {
        const state = ctx.getState();
        const ignored = JSON.parse(JSON.stringify(state.ignoredTransactions));
        const index = ignored.lastIndexOf(payload);
        // If the id is already in the array its index won't be -1
        (index !== -1) ? ignored.splice(index, 1) : ignored.push(payload);
        ctx.setState({
            ...state,
            ignoredTransactions: ignored
        });
        this.localStorage.setItem(this.ignoredItemsKey, ignored)
            .subscribe();
    }
}
