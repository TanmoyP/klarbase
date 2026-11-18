// Comment text rules — pure, zero imports, so the test runs without a DB.
// Comments are plain text. Two things are refused on purpose:
//  - links / domains (same spirit as contrib.js "plain text, no links", plus bare domains)
//  - ROUTES: a comment may say "the crate goes before the lever", not "RRUULLDR".
//    Solutions are earned in Klarbase (ENGINEERING.md §4), and a thread is the
//    easiest place to leak one.
export const COMMENT_MAX = 500;
export const ROUTE_ERROR = 'Describe the idea, not the keys — routes are earned in Klarbase.';

// zero-width / bidi / line-separator chars would hide a route from the check (built from code points: no invisible chars in source)
const INVISIBLE = new RegExp('[' + [[0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0xfeff, 0xfeff]]
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']', 'g');
const CONTROL = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/;                    // \n is the only control char allowed

// links: contrib.js's scheme/www test + bare domains on common TLDs + "dot com" tricks + emails
const TLD = 'com|net|org|io|dev|gg|ly|me|co|app|xyz|info|biz|ru|cn|tk|ml|ga|cf|gq|to|be|tv|fm|cc|us|uk|de|fr|eu|ch|nl|it|es|site|online|store|shop|link|click|top|club|live|page|ai|gl|sh|im|so|ws|vip|fun';
const LINK = new RegExp(
  String.raw`(?:https?:|ftp:|www\.|//\w)|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${TLD})\b|\S@\S+\.\S|\bdot\s*(?:${TLD})\b|\[\.\]|\(dot\)`, 'i');

// routes: moves are U D L R X (X = the action key). Real words made only of those
// letters (DULL, LULL, DUD, RUDD, UR) are not moves, so they never join a run.
// A run is: one word of >= 6 move letters (RRUULL), or >= 2 move tokens — single
// letters, short groups or arrows, separated by space , ; . - > / | — adding up to
// >= 6 moves (R R U U L L · r,r,u,u,l,l · R->R->U · →→↑↑←←).
const EDGE = String.raw`(?<![\p{L}\p{N}])`, EDGE_END = String.raw`(?![\p{L}\p{N}])`;
const WORDS = String.raw`(?!(?:dull|lull|dud|rudd|ur)${EDGE_END})`;
const ARROW = '[←↑→↓⇐⇑⇒⇓⬅⬆➡⬇↖↗↘↙]';
const TOKEN = String.raw`(?:${EDGE}${WORDS}[udlrx]+${EDGE_END}|${ARROW})`;
const RUN = new RegExp(String.raw`${TOKEN}(?:[\s,;.\-–—>/|]*${TOKEN})*`, 'giu');
const TOKENS = new RegExp(TOKEN, 'giu');

export function hasRoute(text){
  for(const [run] of text.matchAll(RUN)){
    const toks = run.match(TOKENS) || [];
    const moves = toks.reduce((n, t) => n + t.length, 0);
    if(moves >= 6 && (toks.length >= 2 || toks[0].length >= 6)) return true;
  }
  return false;
}

// raw -> { ok:true, body } | { ok:false, error }. Pure; exported for tests.
export function parseComment(raw){
  if(typeof raw !== 'string') return { ok:false, error:'write a comment first' };
  const body = raw.replace(INVISIBLE, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
    .replace(/\n{3,}/g, '\n\n');
  if(!body) return { ok:false, error:'write a comment first' };
  if(body.length > COMMENT_MAX) return { ok:false, error:`keep it under ${COMMENT_MAX} characters` };
  if(CONTROL.test(body)) return { ok:false, error:'plain text only' };
  if(LINK.test(body)) return { ok:false, error:'no links, please — plain text only' };
  if(hasRoute(body)) return { ok:false, error:ROUTE_ERROR };
  return { ok:true, body };
}
