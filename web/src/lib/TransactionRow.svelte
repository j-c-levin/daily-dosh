<script>
  import { money, shortDate } from './format.js';
  export let tx;
  export let onToggle;
  export let onRecur = null;
</script>

{#if tx.isPayday}
  <div class="row payday">
    <span class="icon">
      {#if tx.logo}
        <img src={tx.logo} alt="" />
      {:else}
        <span class="emoji">{tx.emoji || '💰'}</span>
      {/if}
    </span>
    <span class="meta">
      <span class="name">{tx.description}</span>
      <span class="date muted">{shortDate(tx.created)} · payday</span>
    </span>
    <span class="amount credit">{money(tx.amount, { sign: true })}</span>
  </div>
{:else}
  <div class="row" class:ignored={tx.ignored}>
    <button class="tap" on:click={() => onToggle(tx.id)}>
      <span class="icon">
        {#if tx.logo}
          <img src={tx.logo} alt="" />
        {:else}
          <span class="emoji">{tx.emoji || '💳'}</span>
        {/if}
      </span>
      <span class="meta">
        <span class="name">{tx.description}</span>
        <span class="date muted">{shortDate(tx.created)}{tx.ignored ? ' · ignored' : ''}{tx.recurring ? ' · monthly' : ''}</span>
      </span>
      <span class="amount" class:credit={tx.amount > 0}>{money(tx.amount, { sign: true })}</span>
    </button>
    {#if onRecur && tx.amount < 0}
      <button class="recur" class:active={tx.recurring}
        aria-label={tx.recurring ? 'unmark as a monthly bill' : 'mark as a monthly bill'}
        on:click={() => onRecur(tx.id)}>↻</button>
    {/if}
  </div>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    width: 100%;
    border-bottom: 1px solid var(--line);
  }
  .row:last-child {
    border-bottom: none;
  }
  .tap {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    background: none;
    border: none;
    padding: 12px 4px;
    text-align: left;
    color: var(--text);
  }
  .recur {
    flex: 0 0 auto;
    background: none;
    border: none;
    color: var(--muted);
    opacity: 0.55;
    font-size: 17px;
    padding: 12px 6px;
  }
  .recur.active {
    color: var(--good);
    opacity: 1;
  }
  .icon {
    flex: 0 0 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--surface-2);
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .emoji {
    font-size: 18px;
  }
  .meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .date {
    font-size: 13px;
  }
  .amount {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .amount.credit {
    color: var(--good);
  }
  .ignored {
    opacity: 0.4;
  }
  .ignored .name {
    text-decoration: line-through;
  }
  .payday {
    gap: 12px;
    padding: 12px 4px;
    border-top: 1px solid var(--line);
    background: color-mix(in srgb, var(--good) 8%, transparent);
  }
  .payday .date {
    color: var(--good);
  }
</style>
