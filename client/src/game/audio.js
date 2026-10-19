// Fully synthesized audio (Web Audio). No files: a footstep is a note from the
// theme's pentatonic scale, so nothing a player does can sound wrong. The game
// is fully playable muted — sound only reinforces what you already see.
let ctx = null, master = null, amb = null, on = true, pending = null;

// Browsers only allow audio after a user gesture: themes requested before then
// are remembered and start on the first key or tap.
export function unlockAudio(){
  try {
    if(!ctx){
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = on ? 0.8 : 0; master.connect(ctx.destination);
      if(pending){ const p = pending; pending = null; ambient(p); }
    }
    if(ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}
export function setSound(enabled){ on = enabled; if(master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05); }
export const soundOn = () => on;

function tone(freq, { dur = 0.14, type = 'sine', gain = 0.1, attack = 0.004, to = null, at = 0, out = master } = {}){
  if(!ctx || !on) return;
  const t0 = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if(to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise({ dur = 0.2, gain = 0.06, freq = 1200, q = 0.8, type = 'bandpass', at = 0, sweep = null } = {}){
  if(!ctx || !on) return;
  const t0 = ctx.currentTime + at, len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if(sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t0);
}

let scale = [220, 246.94, 293.66, 329.63, 392];
export function setScale(s){ scale = s; }
const note = i => scale[((i % 5) + 5) % 5] * Math.pow(2, Math.floor(i / 5));

export const sfx = {
  step:(h = 0, k = 0) => { tone(note(h * 2 + (k % 3)) * 2, { dur:0.09, type:'triangle', gain:0.045 }); noise({ dur:0.05, gain:0.025, freq:2400 }); },
  hopDown:() => { tone(note(4) * 2, { dur:0.18, type:'sine', gain:0.05, to:note(1) * 2 }); },
  push:() => { tone(110, { dur:0.18, gain:0.14, to:70 }); noise({ dur:0.16, gain:0.05, freq:300, type:'lowpass' }); },
  sink:() => { tone(520, { dur:0.25, gain:0.08, to:120 }); for(let i = 0; i < 4; i++) tone(700 + i * 160, { dur:0.05, gain:0.03, at:0.12 + i * 0.06 }); },
  slide:() => { noise({ dur:0.28, gain:0.05, freq:3000, sweep:900 }); },
  tp:() => { [0, 2, 4, 7].forEach((n, i) => tone(note(n) * 2, { dur:0.25, type:'sine', gain:0.05, at:i * 0.05 })); },
  key:() => { tone(note(7) * 2, { dur:0.25, gain:0.08 }); tone(note(9) * 2, { dur:0.35, gain:0.07, at:0.08 }); },
  door:() => { tone(90, { dur:0.45, type:'sawtooth', gain:0.03, to:140 }); noise({ dur:0.3, gain:0.04, freq:500 }); },
  toggle:() => { tone(160, { dur:0.12, type:'square', gain:0.04 }); [0, 2, 4].forEach((n, i) => tone(note(n), { dur:0.5, type:'triangle', gain:0.035, at:0.06 + i * 0.04 })); },
  gate:open => { tone(open ? 80 : 120, { dur:0.5, type:'sawtooth', gain:0.03, to:open ? 140 : 70 }); noise({ dur:0.4, gain:0.035, freq:200, type:'lowpass' }); },
  fall:() => { tone(300, { dur:0.35, gain:0.08, to:90 }); noise({ dur:0.3, gain:0.05, freq:600, at:0.15 }); },
  scales:up => { tone(up ? 140 : 180, { dur:0.42, type:'triangle', gain:0.05, to:up ? 200 : 110 }); noise({ dur:0.3, gain:0.03, freq:700, type:'lowpass' }); },   // a woody creak as the vine settles
  bonk:() => { tone(260, { dur:0.12, type:'sine', gain:0.06, to:180 }); },
  // Weight II
  take:what => what === 'stone' ? (tone(95, { dur:0.2, gain:0.12, to:75 }), noise({ dur:0.12, gain:0.05, freq:400, type:'lowpass' }))
                                : [0, 4].forEach((n, i) => tone(note(n) * 2, { dur:0.16, type:'sine', gain:0.05, at:i * 0.06, to:note(n + 2) * 2 })),
  drop:() => { tone(80, { dur:0.25, gain:0.12, to:60 }); noise({ dur:0.2, gain:0.05, freq:300, type:'lowpass' }); },
  release:() => { tone(note(4) * 2, { dur:0.6, type:'sine', gain:0.045, to:note(9) * 4 }); },
  glide:() => { noise({ dur:0.5, gain:0.035, freq:900, sweep:500, type:'lowpass' }); tone(note(7) * 2, { dur:0.45, type:'sine', gain:0.03, to:note(2) * 2 }); },
  gust:() => { noise({ dur:0.45, gain:0.05, freq:1400, sweep:600 }); },
  float:() => { tone(330, { dur:0.2, gain:0.05, to:440 }); for(let i = 0; i < 3; i++) tone(900 + i * 200, { dur:0.04, gain:0.02, at:0.08 + i * 0.05 }); },
  seed:() => { [7, 9, 12].forEach((n, i) => tone(note(n) * 2, { dur:0.18, type:'triangle', gain:0.04, at:i * 0.05 })); },
  undo:() => { tone(note(3) * 2, { dur:0.08, type:'sine', gain:0.04, to:note(1) * 2 }); },
  ui:() => { tone(note(5) * 2, { dur:0.06, type:'triangle', gain:0.035 }); },
  win:() => {
    [0, 2, 4, 5, 7, 9].forEach((n, i) => tone(note(n) * 2, { dur:0.5, type:'triangle', gain:0.06, at:i * 0.08 }));
    [0, 4, 7].forEach(n => tone(note(n), { dur:1.6, type:'sine', gain:0.05, at:0.5 }));
    for(let i = 0; i < 6; i++) tone(2400 + Math.random() * 1600, { dur:0.08, gain:0.02, at:0.4 + Math.random() * 0.8 });
  },
};

// Ambient bed: a slow detuned pad on the theme chord + a nature layer.
export function ambient(theme){
  if(!ctx){ pending = theme; return; }
  if(amb){ const old = amb; old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6); setTimeout(() => old.stop(), 2500); }
  const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(master);
  g.gain.setTargetAtTime(0.05, ctx.currentTime, 1.2);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g);
  const nodes = [];
  for(const f of theme.chord){
    for(const det of [-4, 4]){
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f / 2; o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(lp); o.start(); nodes.push(o);
    }
  }
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 350;
  lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); nodes.push(lfo);
  let timer = null;
  const kind = theme.particles;
  const tick = () => {
    if(!on) return;
    if(kind === 'fireflies' || kind === 'petals'){                      // birdsong
      const base = 1800 + Math.random() * 1400;
      for(let i = 0; i < 2 + (Math.random() * 3 | 0); i++) tone(base + Math.random() * 400, { dur:0.07, gain:0.012, to:base * 1.3, at:i * 0.09 });
    } else if(kind === 'snow' || kind === 'dust'){                       // gusts
      noise({ dur:2.5, gain:0.012, freq:500 + Math.random() * 400, q:0.4, sweep:300 });
    } else {                                                             // distant city
      tone(70 + Math.random() * 20, { dur:1.5, type:'sawtooth', gain:0.006 });
    }
  };
  timer = setInterval(tick, 2600 + Math.random() * 2000);
  amb = { gain:g, stop:() => { clearInterval(timer); nodes.forEach(n => { try { n.stop(); } catch {} }); g.disconnect(); } };
}
