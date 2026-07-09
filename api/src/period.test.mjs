import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPayday,
  paydayInstant,
  periodCutoff,
  estimateNextPayday,
  periodFromDates,
  buildPeriod,
  daysElapsed,
  upcomingCommitted,
} from './period.mjs';

// Helper to build a plausible inbound-credit transaction on the payday window.
function credit({ id, created, amount, name, merchant = undefined }) {
  return {
    id,
    created,
    amount,
    counterparty: name ? { name } : undefined,
    description: name ? `Payment from ${name}` : 'Payment',
    merchant,
  };
}

describe('detectPayday', () => {
  test('matches employer name case-insensitively in counterparty.name', () => {
    const tx = {
      id: 'tx1',
      created: '2026-01-25T09:00:00.000Z',
      amount: 500001,
      counterparty: { name: 'ACME CORP LTD' },
      description: 'Salary',
    };
    const result = detectPayday([tx], 'acme corp ltd');
    assert.equal(result.id, 'tx1');
  });

  test('matches employer name case-insensitively in description', () => {
    const tx = {
      id: 'tx2',
      created: '2026-01-25T09:00:00.000Z',
      amount: 500001,
      counterparty: {},
      description: 'PAYROLL FROM Acme Corp Ltd',
    };
    const result = detectPayday([tx], 'acme corp ltd');
    assert.equal(result.id, 'tx2');
  });

  test('rejects amounts of exactly £5,000 or less', () => {
    const atThreshold = {
      id: 'tx3',
      created: '2026-01-25T09:00:00.000Z',
      amount: 500000, // exactly £5,000, must not count (strictly greater required)
      counterparty: { name: 'Acme Corp' },
      description: '',
    };
    const belowThreshold = {
      ...atThreshold,
      id: 'tx4',
      amount: 499999,
    };
    assert.equal(detectPayday([atThreshold], 'Acme Corp'), null);
    assert.equal(detectPayday([belowThreshold], 'Acme Corp'), null);
  });

  test('rejects transactions carrying a merchant (card refunds)', () => {
    const tx = {
      id: 'tx5',
      created: '2026-01-25T09:00:00.000Z',
      amount: 600000,
      counterparty: { name: 'Acme Corp' },
      description: '',
      merchant: { name: 'Acme Corp' },
    };
    assert.equal(detectPayday([tx], 'Acme Corp'), null);
  });

  test('rejects transactions dated outside the 20th-25th', () => {
    const before = {
      id: 'tx6',
      created: '2026-01-19T09:00:00.000Z',
      amount: 600000,
      counterparty: { name: 'Acme Corp' },
      description: '',
    };
    const after = {
      id: 'tx7',
      created: '2026-01-26T09:00:00.000Z',
      amount: 600000,
      counterparty: { name: 'Acme Corp' },
      description: '',
    };
    assert.equal(detectPayday([before], 'Acme Corp'), null);
    assert.equal(detectPayday([after], 'Acme Corp'), null);
  });

  test('skips dismissed ids', () => {
    const tx = {
      id: 'tx8',
      created: '2026-01-25T09:00:00.000Z',
      amount: 600000,
      counterparty: { name: 'Acme Corp' },
      description: '',
    };
    assert.equal(detectPayday([tx], 'Acme Corp', ['tx8']), null);
  });

  test('returns the newest match', () => {
    const older = {
      id: 'old',
      created: '2025-12-24T09:00:00.000Z',
      amount: 600000,
      counterparty: { name: 'Acme Corp' },
      description: '',
    };
    const newer = {
      id: 'new',
      created: '2026-01-25T09:00:00.000Z',
      amount: 600000,
      counterparty: { name: 'Acme Corp' },
      description: '',
    };
    const result = detectPayday([older, newer], 'Acme Corp');
    assert.equal(result.id, 'new');
  });

  test('returns null with no employerName', () => {
    const tx = {
      id: 'tx9',
      created: '2026-01-25T09:00:00.000Z',
      amount: 600000,
      counterparty: { name: 'Acme Corp' },
      description: '',
    };
    assert.equal(detectPayday([tx], ''), null);
    assert.equal(detectPayday([tx], undefined), null);
  });
});

describe('paydayInstant', () => {
  const DATE = '2026-01-25';

  test('prefers the employer-matched credit on the date', () => {
    const employerCredit = credit({
      id: 'a',
      created: `${DATE}T09:00:00.000Z`,
      amount: 100000,
      name: 'Acme Corp',
    });
    const biggerNonEmployer = credit({
      id: 'b',
      created: `${DATE}T10:00:00.000Z`,
      amount: 999999,
      name: 'Someone Else',
    });
    const result = paydayInstant([employerCredit, biggerNonEmployer], 'Acme Corp', DATE);
    assert.equal(result, employerCredit.created);
  });

  test('largest amount wins among several employer matches', () => {
    const small = credit({ id: 'a', created: `${DATE}T09:00:00.000Z`, amount: 100000, name: 'Acme Corp' });
    const big = credit({ id: 'b', created: `${DATE}T11:00:00.000Z`, amount: 500001, name: 'Acme Corp' });
    const result = paydayInstant([small, big], 'Acme Corp', DATE);
    assert.equal(result, big.created);
  });

  test('falls back to the largest non-employer credit that day', () => {
    const small = credit({ id: 'a', created: `${DATE}T09:00:00.000Z`, amount: 100000, name: 'Someone' });
    const big = credit({ id: 'b', created: `${DATE}T11:00:00.000Z`, amount: 200000, name: 'Someone Else' });
    const result = paydayInstant([small, big], 'Acme Corp', DATE);
    assert.equal(result, big.created);
  });

  test('falls back to <date>T00:00:00.000Z when no credits', () => {
    const result = paydayInstant([], 'Acme Corp', DATE);
    assert.equal(result, `${DATE}T00:00:00.000Z`);
  });
});

describe('periodCutoff', () => {
  test('resolves paydayTransactionId from live transactions', () => {
    const period = { paydayTransactionId: 'tx1', paydayAt: '2026-01-25T00:00:00.000Z', paydayDate: '2026-01-25' };
    const transactions = [
      { id: 'tx1', created: '2026-01-25T09:12:00.000Z', amount: 600000, counterparty: { name: 'Acme' } },
    ];
    const user = { employerName: 'Acme', dismissedPaydayIds: [] };
    const result = periodCutoff(period, transactions, user);
    assert.equal(result, '2026-01-25T09:12:00.000Z');
  });

  test('falls back to period.paydayAt when the tx has aged out', () => {
    const period = {
      paydayTransactionId: 'gone',
      paydayAt: '2026-01-25T09:12:00.000Z',
      paydayDate: '2026-01-25',
    };
    const transactions = []; // the tx has aged out of the fetched window
    const user = { employerName: 'Acme', dismissedPaydayIds: [] };
    const result = periodCutoff(period, transactions, user);
    assert.equal(result, period.paydayAt);
  });

  test('falls back to the paydayInstant guess when neither is available', () => {
    const period = { paydayDate: '2026-01-25' };
    const transactions = [
      credit({ id: 'a', created: '2026-01-25T09:00:00.000Z', amount: 600000, name: 'Acme' }),
    ];
    const user = { employerName: 'Acme', dismissedPaydayIds: [] };
    const result = periodCutoff(period, transactions, user);
    assert.equal(result, transactions[0].created);
  });
});

describe('estimateNextPayday', () => {
  test('lands on the 25th of next month when it is a weekday', () => {
    // June 25 2026 is a Thursday.
    const result = estimateNextPayday('2026-05-25');
    assert.equal(result, '2026-06-25');
  });

  test('rolls back to Friday when the 25th is a Saturday', () => {
    // April 25 2026 is a Saturday -> Friday April 24.
    const result = estimateNextPayday('2026-03-25');
    assert.equal(result, '2026-04-24');
  });

  test('rolls back to Friday when the 25th is a Sunday', () => {
    // January 25 2026 is a Sunday -> Friday January 23.
    const result = estimateNextPayday('2025-12-25');
    assert.equal(result, '2026-01-23');
  });
});

describe('periodFromDates / buildPeriod', () => {
  test('periodFromDates computes correct daysInPeriod', () => {
    const period = periodFromDates('2026-01-25', '2026-02-25', 100000);
    assert.equal(period.paydayDate, '2026-01-25');
    assert.equal(period.nextPaydayDate, '2026-02-25');
    assert.equal(period.daysInPeriod, 31);
    assert.equal(period.disposablePot, 100000);
  });

  test('periodFromDates enforces a minimum of 1 day', () => {
    const period = periodFromDates('2026-01-25', '2026-01-25', 100000);
    assert.equal(period.daysInPeriod, 1);
  });

  test('buildPeriod derives nextPaydayDate and daysInPeriod from a detected payday', () => {
    // May 25 2026 -> next payday June 25 2026 (weekday, no rollback): 31 days.
    const period = buildPeriod('2026-05-25', 250000);
    assert.equal(period.paydayDate, '2026-05-25');
    assert.equal(period.nextPaydayDate, '2026-06-25');
    assert.equal(period.daysInPeriod, 31);
  });
});

describe('daysElapsed', () => {
  test('payday itself is day 1', () => {
    const result = daysElapsed('2026-01-25', new Date('2026-01-25T12:00:00.000Z'));
    assert.equal(result, 1);
  });

  test('a normal mid-month value', () => {
    const result = daysElapsed('2026-01-25', new Date('2026-02-03T12:00:00.000Z'));
    assert.equal(result, 10);
  });

  test('never goes below 1 when now is before payday', () => {
    const result = daysElapsed('2026-01-25', new Date('2026-01-01T12:00:00.000Z'));
    assert.equal(result, 1);
  });

  test('BST regression: counts the new UK day starting at UK local midnight, not UTC midnight', () => {
    // 2026-06-30T23:30:00Z is 00:30 on 1 July in London (BST, UTC+1).
    // The old UTC-only logic would say it's still 30 June (day 6); the
    // correct London-day answer is 1 July (day 7).
    const result = daysElapsed('2026-06-25', new Date('2026-06-30T23:30:00.000Z'));
    assert.equal(result, 7);
  });

  test('winter (GMT) case: UTC and London calendar days agree', () => {
    // In December the UK is on GMT (UTC+0), so no offset applies.
    const result = daysElapsed('2025-12-25', new Date('2025-12-30T23:30:00.000Z'));
    assert.equal(result, 6);
  });
});

describe('upcomingCommitted', () => {
  const PERIOD = { paydayDate: '2026-01-25', nextPaydayDate: '2026-02-25' };
  const rent = { sourceId: 'src1', name: 'Big Landlord Ltd', amount: -95000, day: 1 };
  const debit = (description, extra = {}) =>
    ({ id: 'x', created: '2026-01-26T09:00:00.000Z', amount: -95000, description, ignored: false, ...extra });

  test('a bill not yet seen this period is upcoming, dated by its day-of-month', () => {
    const result = upcomingCommitted([rent], [debit('Coffee Shop')], PERIOD);
    assert.deepEqual(result, {
      total: 95000,
      items: [{ name: 'Big Landlord Ltd', amount: -95000, expectedDate: '2026-02-01' }],
    });
  });

  test('an occurred instance this period suppresses the bill', () => {
    const result = upcomingCommitted([rent], [debit('BIG LANDLORD LTD')], PERIOD);
    assert.deepEqual(result, { total: 0, items: [] });
  });

  test('matches substring either way, case-insensitively', () => {
    // tx description is a substring of the recurring name
    const result = upcomingCommitted([rent], [debit('big landlord')], PERIOD);
    assert.equal(result.items.length, 0);
  });

  test('amounts drift: a different amount still counts as occurred', () => {
    const result = upcomingCommitted([rent], [debit('Big Landlord Ltd', { amount: -98000 })], PERIOD);
    assert.deepEqual(result.items, []);
  });

  test('ignored instances do not count as occurred', () => {
    const result = upcomingCommitted([rent], [debit('Big Landlord Ltd', { ignored: true })], PERIOD);
    assert.equal(result.total, 95000);
  });

  test('credits never match', () => {
    const refund = debit('Big Landlord Ltd', { amount: 95000 });
    const result = upcomingCommitted([rent], [refund], PERIOD);
    assert.equal(result.total, 95000);
  });

  test('day 31 clamps to the last day of a shorter month', () => {
    const item = { sourceId: 's', name: 'Gym', amount: -3999, day: 31 };
    // Feb 2026 has 28 days, so "the 31st" lands on the 28th.
    const period = { paydayDate: '2026-02-01', nextPaydayDate: '2026-03-01' };
    const result = upcomingCommitted([item], [], period);
    assert.equal(result.items[0].expectedDate, '2026-02-28');
  });

  test('a bill whose day never falls inside a short period is skipped', () => {
    const item = { sourceId: 's', name: 'Gym', amount: -3999, day: 20 };
    const period = { paydayDate: '2026-01-05', nextPaydayDate: '2026-01-10' };
    const result = upcomingCommitted([item], [], period);
    assert.deepEqual(result, { total: 0, items: [] });
  });

  test('empty or absent recurring list yields zero', () => {
    assert.deepEqual(upcomingCommitted([], [debit('Rent')], PERIOD), { total: 0, items: [] });
    assert.deepEqual(upcomingCommitted(undefined, [], PERIOD), { total: 0, items: [] });
  });

  test('multiple upcoming bills sum into a positive total', () => {
    const gym = { sourceId: 'src2', name: 'Gym', amount: -3999, day: 3 };
    const result = upcomingCommitted([rent, gym], [], PERIOD);
    assert.equal(result.total, 98999);
    assert.equal(result.items.length, 2);
  });
});
