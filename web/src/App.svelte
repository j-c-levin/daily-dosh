<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './lib/api.js';
  import { money, shortTime } from './lib/format.js';
  import TransactionRow from './lib/TransactionRow.svelte';
  import BurnDown from './lib/BurnDown.svelte';

  const KEY = 'dd_storage_key';
  const REDIRECT_PATH = '/oauth/redirect';

  let storageKey = localStorage.getItem(KEY);
  let phase = 'loading'; // loading | connect | callback | data | error
  let state = null; // server payload when phase === 'data'
  let error = '';
  let employerInput = '';
  let busy = false;
  let poll;

  // Manual override ("Adjust") form.
  let showReset = false;
  let resetStart = '';
  let resetEnd = '';
  let resetPot = '';
  // "Pick your payday" selector: the transactions on the chosen start date.
  let resetDay = [];
  let resetPaydayId = null;
  let loadingDay = false;
  let dayError = '';

  onMount(async () => {
    if (location.pathname === REDIRECT_PATH) {
      await handleCallback();
      return;
    }
    if (storageKey) {
      await refresh();
    } else {
      phase = 'connect';
    }
  });

  onDestroy(() => clearTimeout(poll));

  async function refresh() {
    try {
      state = await api.state(storageKey);
      phase = 'data';
      // Keep polling while we wait for the user to approve access in-app.
      clearTimeout(poll);
      if (state.status === 'awaiting_approval') {
        poll = setTimeout(refresh, 3000);
      }
      if (state.status === 'reauth') {
        localStorage.removeItem(KEY);
        storageKey = null;
        phase = 'connect';
      }
    } catch (e) {
      error = e.message;
      phase = 'error';
    }
  }

  async function connect() {
    const cfg = await api.config();
    const nonce = crypto.randomUUID();
    sessionStorage.setItem('dd_oauth_state', nonce);
    const redirectUri = location.origin + REDIRECT_PATH;
    const url =
      `${cfg.authUrl}?client_id=${encodeURIComponent(cfg.clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&state=${nonce}`;
    location.href = url;
  }

  async function handleCallback() {
    phase = 'callback';
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    const expected = sessionStorage.getItem('dd_oauth_state');
    if (!code || (expected && returnedState !== expected)) {
      error = 'Authentication failed. Please try connecting again.';
      phase = 'error';
      return;
    }
    try {
      const { storageKey: key } = await api.auth(code, location.origin + REDIRECT_PATH);
      localStorage.setItem(KEY, key);
      storageKey = key;
      history.replaceState({}, '', '/');
      await refresh();
    } catch (e) {
      error = e.message;
      phase = 'error';
    }
  }

  async function action(fn) {
    busy = true;
    try {
      state = await fn();
      phase = 'data';
    } catch (e) {
      error = e.message;
      phase = 'error';
    } finally {
      busy = false;
    }
  }

  // Whole days between two yyyy-mm-dd dates, for the "as of" staleness check.
  const daysBetween = (from, to) => Math.round((new Date(to) - new Date(from)) / 86400000);

  const saveEmployer = () =>
    employerInput.trim() && action(() => api.setEmployer(storageKey, employerInput.trim()));
  const confirmBuckets = () => action(() => api.confirmBuckets(storageKey));
  const dismissPayday = () => action(() => api.dismissPayday(storageKey, state.payday.id));
  const toggleIgnore = (id) => action(() => api.toggleIgnore(storageKey, id));

  function openReset() {
    const p = state?.period;
    // UK civil date (matches the server's day boundary), not the UTC date.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    resetStart = p?.paydayDate || today;
    resetEnd = p?.nextPaydayDate || '';
    resetPot = p ? (p.disposablePot / 100).toFixed(2) : '';
    resetPaydayId = p?.paydayTransactionId || null;
    resetDay = [];
    dayError = '';
    showReset = true;
    loadDay();
  }

  // Fetch the chosen start date's transactions so the user can tap their payday.
  async function loadDay() {
    if (!resetStart) return;
    loadingDay = true;
    dayError = '';
    try {
      const { transactions } = await api.day(storageKey, resetStart);
      resetDay = transactions;
    } catch (e) {
      dayError = e.message;
      resetDay = [];
    } finally {
      loadingDay = false;
    }
  }

  // A different start date means a different day of transactions to pick from.
  function onStartChange() {
    resetPaydayId = null;
    loadDay();
  }

  async function saveReset() {
    const payday = resetDay.find((t) => t.id === resetPaydayId);
    await action(() =>
      api.reset(storageKey, {
        startDate: resetStart,
        endDate: resetEnd,
        potAmount: Number(resetPot),
        paydayTransactionId: payday?.id ?? null,
        paydayAt: payday?.created ?? null,
      })
    );
    showReset = false;
  }

  function disconnect() {
    localStorage.removeItem(KEY);
    storageKey = null;
    state = null;
    phase = 'connect';
  }
</script>

<main>
  {#if phase === 'loading' || phase === 'callback'}
    <div class="center">
      <div class="spinner"></div>
      <p class="muted">{phase === 'callback' ? 'Connecting your account…' : 'Loading…'}</p>
    </div>

  {:else if phase === 'connect'}
    <div class="center">
      <h1 class="brand">Daily&nbsp;Dosh</h1>
      <p class="muted">Your spending money for today, worked out from payday.</p>
      <button class="btn" on:click={connect}>Connect Monzo</button>
    </div>

  {:else if phase === 'error'}
    <div class="center">
      <p class="bad">{error}</p>
      <button class="btn secondary" on:click={() => location.assign('/')}>Try again</button>
    </div>

  {:else if showReset}
    <div class="card">
      <h2>Set budget manually</h2>
      <p class="muted">Override the current financial month — handy if a payday was missed or
        you want to tweak the numbers.</p>
      <label class="field">
        <span class="muted small">Start date (payday)</span>
        <input type="date" bind:value={resetStart} on:change={onStartChange} />
      </label>

      {#if resetStart}
        <div class="field">
          <span class="muted small">Which transaction is your payday? Tap it.</span>
          {#if loadingDay}
            <p class="muted small">Loading that day…</p>
          {:else if dayError}
            <p class="bad small">{dayError}</p>
          {:else if resetDay.length}
            <div class="picker">
              {#each resetDay as t (t.id)}
                <button type="button" class="pick" class:selected={t.id === resetPaydayId}
                  on:click={() => (resetPaydayId = t.id)}>
                  <span class="pick-icon">
                    {#if t.logo}<img src={t.logo} alt="" />{:else}<span>{t.emoji || '💳'}</span>{/if}
                  </span>
                  <span class="pick-meta">
                    <span class="pick-name">{t.description}</span>
                    <span class="muted small">{shortTime(t.created)}</span>
                  </span>
                  <span class="pick-amt" class:credit={t.amount > 0}>{money(t.amount, { sign: true })}</span>
                </button>
              {/each}
            </div>
            <span class="muted small">Spending before your payday lands won't count this month. Optional — leave unset to use the start of the day.</span>
          {:else}
            <p class="muted small">No transactions on this day.</p>
          {/if}
        </div>
      {/if}

      <label class="field">
        <span class="muted small">Spending pot (£)</span>
        <input type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"
          bind:value={resetPot} />
      </label>
      <label class="field">
        <span class="muted small">End date (next payday)</span>
        <input type="date" bind:value={resetEnd} />
      </label>
      <button class="btn" disabled={busy || !resetStart || !resetEnd || resetPot === ''}
        on:click={saveReset}>Save budget</button>
      <button class="btn secondary" disabled={busy} on:click={() => (showReset = false)}>Cancel</button>
    </div>

  {:else if state?.status === 'awaiting_approval'}
    <div class="center">
      <div class="spinner"></div>
      <h2>Approve access</h2>
      <p class="muted">Open your Monzo app and approve the request. This page will continue
        automatically.</p>
    </div>

  {:else if state?.status === 'needs_employer'}
    <div class="card">
      <h2>Who pays you?</h2>
      <p class="muted">We use this to spot your payday each month and reset your budget.</p>
      <input class="input" placeholder="Employer name" bind:value={employerInput} />
      {#if state.recentCredits?.length}
        <p class="muted small">Recent income — tap to use:</p>
        <div class="chips">
          {#each state.recentCredits.slice(0, 6) as c}
            <button class="chip" on:click={() => (employerInput = c.name)}>
              {c.name} · {money(c.amount)}
            </button>
          {/each}
        </div>
      {/if}
      <button class="btn" disabled={busy || !employerInput.trim()} on:click={saveEmployer}>Save</button>
    </div>

  {:else if state?.status === 'no_payday'}
    <div class="center">
      <h2>No payday yet</h2>
      <p class="muted">We haven't seen a payment from <b>{state.employerName || 'your employer'}</b>
        in the last 40 days. It'll show up here once it lands.</p>
      <button class="btn secondary" on:click={refresh}>Refresh</button>
      <button class="link" on:click={openReset}>Set budget manually</button>
    </div>

  {:else if state?.status === 'new_month'}
    <div class="card">
      <h2>Is this your pay? 🤔</h2>
      <p class="muted">{money(state.payday.amount)} from {state.employerName || 'your employer'} landed on
        {new Date(state.payday.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p>
      <p>If it's your pay, move everything into your pots first — whatever's left becomes this
        month's spending money.</p>
      {#if state.lastMonth}
        <p class="muted">Last month you finished {money(Math.abs(state.lastMonth.safeToSpend))}
          {state.lastMonth.safeToSpend < 0 ? 'behind' : 'ahead'}{daysBetween(state.lastMonth.date, state.payday.date) > 1
            ? ` (as of ${new Date(state.lastMonth.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })})`
            : ''}</p>
      {/if}
      <button class="btn" disabled={busy} on:click={confirmBuckets}>Yes — I've sorted my pots</button>
      <button class="btn secondary" disabled={busy} on:click={dismissPayday}>No, that's not my pay</button>
    </div>

  {:else if state?.status === 'ready'}
    <header class="top">
      <span class="brand small">Daily Dosh</span>
      <span class="actions">
        <button class="link" on:click={openReset}>Adjust</button>
        <button class="link" on:click={disconnect}>Disconnect</button>
      </span>
    </header>

    <section class="hero" class:over={state.safeToSpend < 0}>
      <p class="hero-label">{state.safeToSpend < 0 ? 'Behind by' : 'Safe to spend'}</p>
      <p class="hero-value">{money(Math.abs(state.safeToSpend))}</p>
      <p class="muted">building up £{(state.dailyAllowance / 100).toFixed(2)} a day · {state.daysRemaining} days to next payday</p>
      <p class="muted">at this pace you'll finish {money(Math.abs(state.projectedOutcome))} {state.projectedOutcome < 0 ? 'down' : 'up'}</p>
    </section>

    <section class="card burndown-card">
      <BurnDown
        daysInPeriod={state.period.daysInPeriod}
        paydayDate={state.period.paydayDate}
        disposablePot={state.period.disposablePot}
        daysElapsed={state.daysElapsed}
        transactions={state.transactions}
        over={state.safeToSpend < 0}
      />
    </section>

    <section class="stats">
      <div><span class="muted small">This month's pot</span><b>{money(state.period.disposablePot)}</b></div>
      <div><span class="muted small">Spent so far</span><b>{money(state.spent)}</b></div>
      <div><span class="muted small">In your account</span><b>{money(state.currentBalance)}</b></div>
    </section>

    <section class="card list">
      <h3>This month <span class="muted small">· tap to ignore</span></h3>
      {#if state.transactions.length}
        {#each state.transactions as tx (tx.id)}
          <TransactionRow {tx} onToggle={toggleIgnore} />
        {/each}
      {:else}
        <p class="muted">No transactions since payday.</p>
      {/if}
    </section>
  {/if}
</main>

<style>
  .brand {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .brand.small {
    font-size: 18px;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
  }
  .link {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 14px;
  }
  .hero {
    text-align: center;
    padding: 30px 0 24px;
  }
  .hero-label {
    margin: 0;
    color: var(--muted);
    font-size: 15px;
  }
  .hero-value {
    margin: 6px 0 8px;
    font-size: 60px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--good);
    font-variant-numeric: tabular-nums;
  }
  .hero.over .hero-value {
    color: var(--bad);
  }
  .burndown-card {
    margin-bottom: 18px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 18px;
  }
  .stats div {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stats b {
    font-size: 17px;
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 12.5px;
  }
  .list h3 {
    margin: 0 0 8px;
  }
  .input {
    width: 100%;
    margin: 14px 0;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .chip {
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 13px;
  }
  .bad {
    color: var(--bad);
  }
  h2 {
    margin: 0 0 6px;
  }
  .card .btn {
    margin-top: 10px;
  }
  .actions {
    display: flex;
    gap: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 14px 0;
  }
  .field input {
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    color-scheme: dark;
  }
  .picker {
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface-2);
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid var(--line);
    padding: 10px 12px;
    text-align: left;
    color: var(--text);
    font: inherit;
  }
  .pick:last-child {
    border-bottom: none;
  }
  .pick.selected {
    background: color-mix(in srgb, var(--good) 18%, transparent);
    box-shadow: inset 3px 0 0 var(--good);
  }
  .pick-icon {
    flex: 0 0 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--surface);
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .pick-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pick-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .pick-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pick-amt {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .pick-amt.credit {
    color: var(--good);
  }
</style>
