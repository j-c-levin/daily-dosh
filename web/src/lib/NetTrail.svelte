<script>
  import { money } from './format.js';
  import { buildNetSeries } from './netSeries.js';

  export let daysInPeriod; // total days in the financial month
  export let paydayDate; // yyyy-mm-dd
  export let daysElapsed; // days since payday (today = daysElapsed)
  export let dailyAllowance; // pence per day
  export let transactions; // this month's transactions, newest first
  export let safeToSpend; // pence, balance-derived — today's dot is pinned to this
  export let projectedOutcome; // pence, projected end-of-month net position

  const H = 64;
  const PAD = 6; // room for the end-dot ring and stroke width without clipping

  let width = 0; // measured card width in px; viewBox tracks it 1:1 so nothing distorts

  // SVG ids are document-global; scope them per instance so multiple charts can coexist.
  const uid = Math.random().toString(36).slice(2);

  $: series = buildNetSeries({
    transactions,
    paydayDate,
    daysInPeriod,
    daysElapsed,
    dailyAllowance,
    safeToSpend,
  });

  // Zero is always in the domain so the baseline stays on screen; the projection
  // endpoint is included so the dotted line is never clipped.
  $: yMin = Math.min(0, projectedOutcome, ...series);
  $: yMax = Math.max(0, projectedOutcome, ...series);
  $: span = Math.max(yMax - yMin, 1);

  $: plotW = width - PAD * 2;
  $: plotH = H - PAD * 2;
  $: x = (day) => PAD + (day / daysInPeriod) * plotW;
  $: y = (pence) => PAD + ((yMax - pence) / span) * plotH;

  $: zeroY = y(0);
  $: points = series.map((v, d) => ({ x: x(d), y: y(v) }));
  $: lastDay = points.length - 1;
  $: trailPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  $: areaPath =
    points.length > 1
      ? `M${points[0].x},${zeroY} L${points.map((p) => `${p.x},${p.y}`).join(' L')} L${points[points.length - 1].x},${zeroY} Z`
      : '';
  $: dot = points[points.length - 1];
  $: projPath =
    dot && lastDay < daysInPeriod
      ? `M${dot.x},${dot.y} L${x(daysInPeriod)},${y(projectedOutcome)}`
      : '';

  $: ariaLabel =
    `Net position, day ${lastDay} of ${daysInPeriod}: ` +
    `${money(Math.abs(safeToSpend))} ${safeToSpend < 0 ? 'behind' : 'ahead'}, ` +
    `on pace to finish ${money(Math.abs(projectedOutcome))} ${projectedOutcome < 0 ? 'down' : 'up'}.`;
</script>

<div class="nettrail" bind:clientWidth={width}>
  {#if width > 0}
    <svg viewBox="0 0 {width} {H}" width="100%" height={H} preserveAspectRatio="none"
      role="img" aria-label={ariaLabel}>
      <defs>
        <!-- The trail is drawn twice, clipped at the zero line: green above, red below.
             Each rect extends a full H beyond the plot on its far side as generous slack
             for stroke width and dot overflow. -->
        <clipPath id="nt-above-{uid}"><rect x="0" y={-H} width={width} height={zeroY + H} /></clipPath>
        <clipPath id="nt-below-{uid}"><rect x="0" y={zeroY} width={width} height={H * 2} /></clipPath>
      </defs>
      <line class="zero" x1={PAD} y1={zeroY} x2={width - PAD} y2={zeroY} />
      {#if areaPath}
        <path class="area" d={areaPath} fill="var(--good)" clip-path="url(#nt-above-{uid})" />
        <path class="area" d={areaPath} fill="var(--bad)" clip-path="url(#nt-below-{uid})" />
      {/if}
      {#if points.length > 1}
        <path class="trail" d={trailPath} stroke="var(--good)" clip-path="url(#nt-above-{uid})" />
        <path class="trail" d={trailPath} stroke="var(--bad)" clip-path="url(#nt-below-{uid})" />
      {/if}
      {#if projPath}
        <path class="proj" d={projPath}
          stroke={projectedOutcome < 0 ? 'var(--bad)' : 'var(--good)'} />
      {/if}
      {#if dot}
        <circle cx={dot.x} cy={dot.y} r="4"
          fill={safeToSpend < 0 ? 'var(--bad)' : 'var(--good)'}
          stroke="var(--surface)" stroke-width="2" />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .nettrail {
    width: 100%;
    height: 64px;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .zero {
    stroke: var(--muted);
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
    opacity: 0.6;
  }
  .area {
    stroke: none;
    fill-opacity: 0.12;
  }
  .trail {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .proj {
    fill: none;
    stroke-width: 1.5;
    stroke-dasharray: 2 4;
    stroke-linecap: round;
    opacity: 0.55;
  }
</style>
