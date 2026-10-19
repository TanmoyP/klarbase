// @klar/core — the Daily Isle. One isle per UTC day, the same for everyone.
// A hand-made dated file (isles/daily/YYYY-MM-DD.json) wins; otherwise the day
// picks from a pool (Twist isles, Tricky+ official isles, community isles).
// Pure: the date is passed in, so a test, a server and every browser agree.

export const DAILY_EPOCH = '2026-10-19';   // Daily #1 when there are no dated files yet
const DAY = 86400000;

export const utcDate = (d = new Date()) => d.toISOString().slice(0, 10);
// Daily number: #1 is the epoch (the first dated file's date, if any).
export const dailyNumber = (date, epoch = DAILY_EPOCH) =>
  Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(epoch + 'T00:00:00Z')) / DAY) + 1;
export const dailyEpoch = datedDates => [...datedDates].sort()[0] || DAILY_EPOCH;

// Deterministic shuffle of the pool (a fixed-seed LCG over the sorted keys),
// walked one isle per day: no repeats until every isle has had its day.
// The order depends only on the pool, so a build with the same isles always
// gives the same isle for a date. -> one key of `keys`, or null for an empty pool.
export function dailyPick(keys, date){
  const order = [...keys].sort();
  if(!order.length) return null;
  let seed = 0x6b6c6172;                                   // "klar"
  for(let i = order.length - 1; i > 0; i--){
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1); [order[i], order[j]] = [order[j], order[i]];
  }
  const n = dailyNumber(date) - 1;
  return order[((n % order.length) + order.length) % order.length];
}

// Spoiler-free result: no route, just how you did. `Klarbase Daily #42 · 18 moves (par 17) · ★★☆`
export const dailyShareText = ({ no, moves, par, stars }) =>
  `Klarbase Daily #${no} · ${moves} moves${par ? ` (par ${par})` : ''} · ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
