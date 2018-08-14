export class UpdateTransactions {
    static readonly type = '[Monzo] Update Transactions';
}

export class UpdateIgnoredTransactions {
    static readonly type = '[Monzo] Update Ignored Transactions';
}

export class ToggleIgnoreTransaction {
    static readonly type = '[Monzo] Toggle Ignore Transaction';
    constructor(public payload: string) { }
}
