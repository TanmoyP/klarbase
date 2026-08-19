// @klar/core — v4 schema: canonical serialization + content hash. Pure.
//
// The content hash covers CONTENT ONLY — geometry and authored seams — never
// metadata. Two exports of the same puzzle at different times (different
// meta.created, different key order) hash identically. That is what gives the
// platform dedup and immutable addressing: the hash IS the puzzle's id.
// Canonicalization: UTF-8 JSON, sorted keys, integers only — no floats, ever
// (spec v4.5 §1). The hash is stored outside the document, as the row's PK.

export const SCHEMA_VERSION = 4;

// The canonical content view of a puzzle document. Anything not listed here
// (meta, palette, audio, declared-but-empty ports) is presentation or
// provenance and does not affect identity.
export function canonicalContent(doc){
  const comps = (doc.components || [])
    .map(c => {
      const o = { i:c.i|0, t:String(c.t), p:[c.p[0]|0, c.p[1]|0, c.p[2]|0], r:(c.r|0) };
      if(c.c) o.c = String(c.c);
      if(c.v) o.v = { h:(c.v.h|0) };
      return o;
    })
    .sort((a,b) => a.i - b.i);
  const allow = (doc.illusionAllowlist || [])
    .map(s => ({ a:String(s.a), b:String(s.b), yaw:(s.yaw|0) }))
    .map(s => (s.a < s.b ? s : { a:s.b, b:s.a, yaw:s.yaw }))   // order-independent
    .sort((x,y) => (x.a+'|'+x.b+'|'+x.yaw).localeCompare(y.a+'|'+y.b+'|'+y.yaw));
  return { schemaVersion:SCHEMA_VERSION, components:comps, illusionAllowlist:allow };
}

// Stable stringify: every object key sorted, recursively. Arrays keep order.
export function stableStringify(v){
  if(v === null || typeof v !== 'object') return JSON.stringify(v);
  if(Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort()
    .map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

/* ---- SHA-256, pure JS (isomorphic: same hash in browser and Node) -------- */
// Not exposed to timing attacks here — it is an integrity/dedup hash, not a
// password hash — so a compact constant-time-agnostic implementation is fine.
const K = (() => {
  const r = [], primes = [];
  const isP = n => { for(let i=2;i*i<=n;i++) if(n%i===0) return false; return true; };
  for(let n=2; primes.length<64; n++) if(isP(n)) primes.push(n);
  const frac = x => ((x - Math.floor(x)) * 4294967296) >>> 0;
  for(let i=0;i<64;i++) r.push(frac(Math.cbrt(primes[i])));
  r.H = primes.slice(0,8).map(p => frac(Math.sqrt(p)));
  return r;
})();

export function sha256hex(input){
  const msg = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const bitLen = msg.length * 8;
  const pad = 64 - ((msg.length + 9) % 64 || 64);
  const bytes = new Uint8Array(msg.length + 1 + pad + 8);
  bytes.set(msg); bytes[msg.length] = 0x80;
  const dv = new DataView(bytes.buffer);
  dv.setUint32(bytes.length - 4, bitLen >>> 0);
  dv.setUint32(bytes.length - 8, Math.floor(bitLen / 4294967296));
  const H = K.H.slice();
  const w = new Uint32Array(64);
  const rr = (x,n) => (x>>>n) | (x<<(32-n));
  for(let off=0; off<bytes.length; off+=64){
    for(let t=0;t<16;t++) w[t] = dv.getUint32(off + t*4);
    for(let t=16;t<64;t++){
      const s0 = rr(w[t-15],7)^rr(w[t-15],18)^(w[t-15]>>>3);
      const s1 = rr(w[t-2],17)^rr(w[t-2],19)^(w[t-2]>>>10);
      w[t] = (w[t-16]+s0+w[t-7]+s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for(let t=0;t<64;t++){
      const S1 = rr(e,6)^rr(e,11)^rr(e,25), ch = (e&f)^(~e&g);
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rr(a,2)^rr(a,13)^rr(a,22), mj = (a&b)^(a&c)^(b&c);
      const t2 = (S0 + mj) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  return H.map(x => x.toString(16).padStart(8,'0')).join('');
}

// The one call sites should use: doc -> canonical hash (hex).
export function contentHash(doc){
  return sha256hex(stableStringify(canonicalContent(doc)));
}
