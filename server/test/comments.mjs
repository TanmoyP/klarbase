// Comment rules tests (zero deps): node server/test/comments.mjs
// parseComment only — no DB, no Express. Routes, links, length, whitespace.
import { parseComment, COMMENT_MAX, ROUTE_ERROR } from '../src/routes/comment-rules.js';

let pass = 0, fail = 0;
const t = (name, cond) => { if(cond) pass++; else { fail++; console.error('FAIL:', name); } };
const ok = s => parseComment(s).ok === true;
const route = s => { const r = parseComment(s); return !r.ok && r.error === ROUTE_ERROR; };
const ZW = String.fromCharCode(0x200b);   // zero-width space: a route hidden between letters
const bad = s => parseComment(s).ok === false;

/* ---- routes, every format ---- */
for(const s of ['RRUULL', 'rruull', 'RrUuLl', 'R R U U L L', 'r,r,u,u,l,l', 'R-R-U-U-L-L', 'R->R->U->U->L->L', 'R → R → U → U → L → L',
  '→→↑↑←←', '→ → ↑ ↑ ← ←', '⬅⬅⬆⬆➡➡', 'R, R, U, U, L, L, D', 'RRRRRR', 'XXXXXX', 'RRUU LL', 'R R U U L L X',
  'try RRUULLDX first', 'the answer: U D U D L R L R', 'dull R R U U L L', 'R.R.U.U.L.L', 'R/R/U/U/L/L', 'RR UU LL DD',
  'R\nR\nU\nU\nL\nL', ['R','R','U','U','L','L'].join(ZW), 'UDLRXX', 'then →→→↓↓↓ and done'])
  t('route rejected: ' + JSON.stringify(s), route(s));
t('route message', parseComment('RRUULL').error === 'Describe the idea, not the keys — routes are earned in Klarbase.');

/* ---- normal text is fine ---- */
for(const s of ['LURID', 'DULL', 'UDDER', 'What a dull isle. Dull dull dull!', 'dud lull dull', 'Push the crate right, then up, then left.',
  'Took me 12 moves, the last step is sneaky', 'Love the ice section', 'U R great', 'ur dull', 'Go R then U then L', 'R R U', 'RRUUL',
  'The lever opens the bridge — then use the key.', 'Heads up: the second plate needs the crate (not Pip).', 'Rurrr! Fun.', 'a\nb', 'émoji 🎉 and ünïcode fine',
  'Part 1.5 was the hard bit... really', 'e.g. try the ledge first', 'u.r. not a link'])
  t('accepted: ' + JSON.stringify(s), ok(s));

/* ---- links ---- */
for(const s of ['see https://example.com', 'http://x.y', 'www.foo.bar', 'WWW.EVIL.COM', 'go to evil.com now', 'bit.ly/abc', 'discord.gg/abc', 't.me/abc',
  'mail me a@b.co', 'foo dot com', 'evil[.]com', 'evil(dot)com', 'sub.domain.example.org/path', 'see //evil.com', 'ftp://x', 'klarbase.dev is nice'])
  t('link rejected: ' + JSON.stringify(s), bad(s) && !route(s));

/* ---- length, emptiness, whitespace ---- */
t('non-string', bad(undefined) && bad(null) && bad(42) && bad({}) && bad([]));
t('empty', bad('') && bad('   ') && bad('\n\n\t'));
t('500 ok', ok('a'.repeat(COMMENT_MAX)));
t('501 rejected', bad('a'.repeat(COMMENT_MAX + 1)));
t('length counted after trim', ok('  ' + 'a'.repeat(COMMENT_MAX) + '  '));
t('trims', parseComment('  hello  ').body === 'hello');
t('collapses blank lines', parseComment('a\n\n\n\n\nb').body === 'a\n\nb');
t('keeps one blank line', parseComment('a\n\nb').body === 'a\n\nb');
t('CRLF normalised', parseComment('a\r\n\r\n\r\n\r\nb').body === 'a\n\nb');
t('trailing spaces before newline dropped', parseComment('a   \nb').body === 'a\nb');
t('control chars rejected', bad('a\u0000b') && bad('a\u0007b'));
t('invisible chars stripped', parseComment('hel' + ZW + 'lo').body === 'hello');
t('result shape', (() => { const r = parseComment('hi'); return r.ok === true && r.body === 'hi' && !('error' in r); })());
t('error shape', (() => { const r = parseComment(''); return r.ok === false && typeof r.error === 'string' && !('body' in r); })());

console.log(`comments: ${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
