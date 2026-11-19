// Springs for the reveal (technique after papertrails src/core/config/fold.js, MIT; ours is a plain
// underdamped analytic spring, x(t) = 1 - e^(-dt)(cos wt + d/w sin wt): starts at rest, overshoots a touch, settles).
const spring = (d, w) => t => t <= 0 ? 0 : t > 2.5 ? 1 : 1 - Math.exp(-d * t) * (Math.cos(w * t) + (d / w) * Math.sin(w * t));
export const rise = spring(7.2, 7.4);     // a chunk climbing out of the clouds: ~3 % overshoot, settled by ~1.1 s
export const pop = spring(6.0, 9.4);      // a tree / rock popping in: ~8 % overshoot, a little boing
export const easeIn = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t;
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
