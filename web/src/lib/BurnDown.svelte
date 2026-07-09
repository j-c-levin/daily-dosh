<script>
  import { money } from './format.js';

  export let daysInPeriod; // total days in the financial month
  export let paydayDate; // yyyy-mm-dd
  export let disposablePot; // pence, this month's pot
  export let daysElapsed; // days since payday (today = daysElapsed)
  export let transactions; // this month's transactions, newest first
  export let over; // true when behind — mirrors the hero's state.safeToSpend < 0

  const H = 64;
  const PAD = 6; // room for the end-dot ring and stroke width without clipping

  let width = 0; // measured card width in px; viewBox tracks it 1:1 so nothing distorts

  // UK civil date (matches the server's day boundary), not the transaction's UTC date.
  const londonDate = (iso) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso));
  const dayOffset = (dateStr) => Math.round((new Date(dateStr) - new Date(paydayDate)) / 86400000);

  $: lastDay = Math.max(0, Math.min(daysElapsed, daysInPeriod));

  // Net spend per day-offset from payday: credits net against spend, payday itself excluded.
  $: byDay = (() => {
    const m = new Map();
    for (const t of transactions) {
      if (t.ignored || t.isPayday) continue;
      const d = dayOffset(londonDate(t.created));
      m.set(d, (m.get(d) || 0) - t.amount);
    }
    return m;
  })();

  // Cumulative spend for day 0..lastDay, clamped to >=0 for display. Day 0 has no point of
  // its own on the chart (it's the reference line's zero anchor) so any same-day spend rolls
  // into day 1's running total rather than being dropped.
  $: cumulative = (() => {
    let running = byDay.get(0) || 0;
    const arr = [0];
    for (let d = 1; d <= lastDay; d++) {
      running += byDay.get(d) || 0;
      arr.push(Math.max(0, running));
    }
    return arr;
  })();

  $: spentToDate = cumulative[cumulative.length - 1] ?? 0;
  $: yMax = Math.max(disposablePot, spentToDate, 1);

  $: plotW = width - PAD * 2;
  $: plotH = H - PAD * 2;
  $: x = (day) => PAD + (day / daysInPeriod) * plotW;
  $: y = (pence) => PAD + plotH - (pence / yMax) * plotH;

  $: allowancePath = `M${x(0)},${y(0)} L${x(daysInPeriod)},${y(disposablePot)}`;

  $: points = cumulative.map((v, d) => ({ x: x(d), y: y(v) }));
  $: spendPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  $: areaPath =
    points.length > 1
      ? `M${points[0].x},${y(0)} L${points.map((p) => `${p.x},${p.y}`).join(' L')} L${points[points.length - 1].x},${y(0)} Z`
      : '';
  $: dot = points[points.length - 1];

  $: color = over ? 'var(--bad)' : 'var(--good)';

  // Allowance-to-date is what the reference line reads at "today" — used only for the label.
  $: allowanceToDate = Math.round((disposablePot * lastDay) / daysInPeriod);
  $: diff = spentToDate - allowanceToDate;
  $: ariaLabel =
    `Burn-down chart, day ${lastDay} of ${daysInPeriod}: spent ${money(spentToDate)} against an ` +
    `allowance of ${money(allowanceToDate)} to date — ${money(Math.abs(diff))} ` +
    `${diff > 0 ? 'behind' : 'ahead of'} pace.`;
</script>

<div class="burndown" bind:clientWidth={width}>
  {#if width > 0}
    <svg viewBox="0 0 {width} {H}" width="100%" height={H} preserveAspectRatio="none"
      role="img" aria-label={ariaLabel}>
      <path class="allowance" d={allowancePath} />
      {#if areaPath}<path class="area" d={areaPath} fill={color} />{/if}
      {#if spendPath}<path class="spend" d={spendPath} stroke={color} />{/if}
      {#if dot}<circle cx={dot.x} cy={dot.y} r="4" fill={color} stroke="var(--surface)" stroke-width="2" />{/if}
    </svg>
  {/if}
</div>

<style>
  .burndown {
    width: 100%;
    height: 64px;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .allowance {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
    opacity: 0.6;
  }
  .area {
    stroke: none;
    fill-opacity: 0.12;
  }
  .spend {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
