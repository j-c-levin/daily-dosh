export class UpdateTransactions {
    static readonly type = '[Monzo] Update Transactions';
}

export class UpdateBalance {
    static readonly type = '[Monzo] Update Balance';
    constructor(public payload: number) { }
}
