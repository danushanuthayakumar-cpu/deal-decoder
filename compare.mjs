export function breakdown(item, {mode, rate, timeRate}) {
  const pickup = item.type === 'pickup';
  const deliveryCost = pickup
    ? (item.km == null ? null : 2 * item.km * rate)
    : item.shipping;
  const round = (value) => Math.round(value * 100) / 100;
  const extra = deliveryCost == null ? null : round(deliveryCost + (item.fees ?? 0));
  const total = extra == null ? null : round(item.price + extra);
  let score = total;
  if (mode === 'value' && pickup) {
    score = total == null || item.minutes == null ? null : round(total + 2 * item.minutes / 60 * timeRate);
  }
  if (mode === 'trip') score = pickup ? item.minutes : null;
  return {item, extra, total, score, ready:item.stock === 'in' && total != null && score != null};
}

export function rank(items, options) {
  return items.map((item) => breakdown(item, options)).sort((a, b) =>
    Number(b.ready) - Number(a.ready) ||
    (a.score ?? Infinity) - (b.score ?? Infinity) ||
    (a.total ?? Infinity) - (b.total ?? Infinity) ||
    a.item.store.localeCompare(b.item.store));
}
