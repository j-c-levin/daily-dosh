<script>
  import { money, shortDate } from './format.js';
  export let tx;
  export let onToggle;
</script>

<button class="row" class:ignored={tx.ignored} on:click={() => onToggle(tx.id)}>
  <span class="icon">
    {#if tx.logo}
      <img src={tx.logo} alt="" />
    {:else}
      <span class="emoji">{tx.emoji || '💳'}</span>
    {/if}
  </span>
  <span class="meta">
    <span class="name">{tx.description}</span>
    <span class="date muted">{shortDate(tx.created)}{tx.ignored ? ' · ignored' : ''}</span>
  </span>
  <span class="amount" class:credit={tx.amount > 0}>{money(tx.amount, { sign: true })}</span>
</button>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    background: none;
    border: none;
    padding: 12px 4px;
    text-align: left;
    color: var(--text);
    border-bottom: 1px solid var(--line);
  }
  .row:last-child {
    border-bottom: none;
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
</style>
