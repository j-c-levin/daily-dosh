<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './lib/api.js';
  import { money } from './lib/format.js';
  import TransactionRow from './lib/TransactionRow.svelte';

  const KEY = 'dd_storage_key';
  const REDIRECT_PATH = '/oauth/redirect';

  let storageKey = localStorage.getItem(KEY);
  let phase = 'loading'; // loading | connect | callback | data | error
  let state = null; // server payload when phase === 'data'
  let error = '';
  let employerInput = '';
  let busy = false;
  let poll;

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

  const saveEmployer = () =>
    employerInput.trim() && action(() => api.setEmployer(storageKey, employerInput.trim()));
  const confirmBuckets = () => action(() => api.confirmBuckets(storageKey));
  const toggleIgnore = (id) => action(() => api.toggleIgnore(storageKey, id));

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
    </div>

  {:else if state?.status === 'new_month'}
    <div class="card">
      <h2>New pay's in 🎉</h2>
      <p class="muted">{money(state.payday.amount)} landed on
        {new Date(state.payday.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p>
      <p>Move everything into your pots, then confirm — whatever's left becomes this month's
        spending money.</p>
      <button class="btn" disabled={busy} on:click={confirmBuckets}>I've sorted my pots</button>
    </div>

  {:else if state?.status === 'ready'}
    <header class="top">
      <span class="brand small">Daily Dosh</span>
      <button class="link" on:click={disconnect}>Disconnect</button>
    </header>

    <section class="hero" class:over={state.todayBalance < 0}>
      <p class="hero-label">{state.todayBalance < 0 ? 'Over budget by' : 'You can spend today'}</p>
      <p class="hero-value">{money(Math.abs(state.todayBalance))}</p>
      <p class="muted">{money(state.dailyAllowance)} a day · {state.daysRemaining} days to next payday</p>
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
</style>
