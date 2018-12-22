import { State, Selector, Action, StateContext } from '@node_modules/@ngxs/store';
import {
    UpdateTransactions,
    ToggleIgnoreTransaction,
    UpdateIgnoredTransactions,
    SetStartDate,
    LoadParameters,
    UpdateStartDate,
    SetAccessKey
} from '../actions/index';
import { MonzoService } from '../../services/monzo.service';
import { tap, map, switchMap } from 'rxjs/operators';
import { LocalStorage } from '@ngx-pwa/local-storage';
import { of, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface Transaction {
    amount: number;
    id: string;
    description: string;
    created: string;
    [others: string]: any;
}

export class MonzoStateModel {
    accessKey: string;
    transactions: Transaction[];
    ignoredTransactions: string[];
    dailyBudget: number;
    startDay: string;
}

@State<MonzoStateModel>({
    name: 'Monzo',
    defaults: {
        accessKey: '',
        transactions: [],
        ignoredTransactions: [],
        dailyBudget: 30,
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
    static getBudget(state: MonzoStateModel): number {
        return state.dailyBudget;
    }

    @Selector()
    static getStartDay(state: MonzoStateModel): string {
        return state.startDay;
    }

    @Action(SetAccessKey)
    SetAccessKey(ctx: StateContext<MonzoStateModel>, { key }: SetAccessKey) {
        const state = ctx.getState();
        ctx.setState({
            ...state,
            accessKey: key
        });
    }

    @Action(LoadParameters)
    loadParameters(ctx: StateContext<MonzoStateModel>): Observable<void> {
        return of(null)
            .pipe(
                switchMap(() => ctx.dispatch(new UpdateTransactions())),
                switchMap(() => ctx.dispatch(new UpdateIgnoredTransactions())),
                switchMap(() => ctx.dispatch(new UpdateStartDate()))
            );
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

    @Action(UpdateStartDate)
    UpdateStartDate(ctx: StateContext<MonzoStateModel>): void {
        this.localStorage
            .getItem(environment.startDateStorageKey)
            .subscribe((startDay) => {
                const state = ctx.getState();
                ctx.setState({
                    ...state,
                    startDay
                });
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

    @Action(SetStartDate)
    SetStartDate(ctx: StateContext<MonzoStateModel>, { date }: SetStartDate) {
        this.localStorage
            .setItem(environment.startDateStorageKey, date)
            .pipe(
                map(() => {
                    const state = ctx.getState();
                    ctx.setState({
                        ...state,
                        startDay: date
                    });
                }),
                tap(() => ctx.dispatch(new LoadParameters()))
            )
            .subscribe();
    }
}
