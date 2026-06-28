/** Pence (integer) -> "£1.23" or "-£1.23". */
export function money(pence, { sign = false } = {}) {
  const v = (pence ?? 0) / 100;
  const s = sign && v > 0 ? '+' : '';
  const neg = v < 0 ? '-' : '';
  return `${s}${neg}£${Math.abs(v).toFixed(2)}`;
}

export function shortDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
