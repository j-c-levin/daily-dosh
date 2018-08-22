export class LoadParameters {
    static readonly type = '[Monzo] Load Parameters';
}

export class SetAccessKey {
    static readonly type = '[Monzo] Set Access Key';
    constructor(public key: string) { }
}

export class UpdateTransactions {
    static readonly type = '[Monzo] Update Transactions';
}

export class UpdateIgnoredTransactions {
    static readonly type = '[Monzo] Update Ignored Transactions';
}

export class UpdateStartDate {
    static readonly type = '[Monzo] Update Start Date';
}

export class ToggleIgnoreTransaction {
    static readonly type = '[Monzo] Toggle Ignore Transaction';
    constructor(public payload: string) { }
}

export class SetStartDate {
    static readonly type = '[Monzo] Set Start Date';
    constructor(public date: string) { }
}
