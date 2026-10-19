#!/usr/bin/env node
// tools/growth-post.mjs — posts ONE maker-approved text to the maker's own Bluesky or
// Mastodon account. Only growth-publisher calls this, and only for queue items the maker
// approved in the morning session (marketing/PLAN.md §0). No scheduling, no retries, no
// replies/likes/follows: one post, then print its URL.
//
//   node tools/growth-post.mjs bluesky  --file <text.txt> [--dry-run]
//   node tools/growth-post.mjs mastodon --file <text.txt> [--dry-run]
//
// Credentials come from the environment only (never the repo):
//   Bluesky   BSKY_HANDLE, BSKY_APP_PASSWORD (Settings → App passwords; not your login password)
//   Mastodon  MASTODON_INSTANCE (e.g. https://mastodon.gamedev.place), MASTODON_TOKEN (scope write:statuses)
// Zero dependencies.
import fs from 'node:fs';

const [, , target, ...args] = process.argv;
const file = args[args.indexOf('--file') + 1];
const dry = args.includes('--dry-run');
const die = msg => { console.error(msg); process.exit(1); };
if(!['bluesky', 'mastodon'].includes(target) || !args.includes('--file') || !file) die('usage: growth-post.mjs bluesky|mastodon --file <text.txt> [--dry-run]');
const text = fs.readFileSync(file, 'utf8').trim();
if(!text) die('empty post');

/* ---- Bluesky ------------------------------------------------------------ */
// Links and hashtags are plain text unless declared as facets with UTF-8 byte offsets.
function facets(s){
  const enc = new TextEncoder(), at = i => enc.encode(s.slice(0, i)).length, out = [];
  for(const m of s.matchAll(/https?:\/\/[^\s)]+[^\s).,!?]/g))
    out.push({ index:{ byteStart:at(m.index), byteEnd:at(m.index + m[0].length) },
               features:[{ $type:'app.bsky.richtext.facet#link', uri:m[0] }] });
  for(const m of s.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)){
    const start = m.index + m[1].length;
    out.push({ index:{ byteStart:at(start), byteEnd:at(start + 1 + m[2].length) },
               features:[{ $type:'app.bsky.richtext.facet#tag', tag:m[2] }] });
  }
  return out;
}

async function bluesky(){
  if([...new Intl.Segmenter().segment(text)].length > 300) die('Bluesky posts are limited to 300 characters');
  const record = { $type:'app.bsky.feed.post', text, createdAt:new Date().toISOString(), facets:facets(text), langs:['en'] };
  if(dry) return console.log(JSON.stringify(record, null, 2));
  const { BSKY_HANDLE:handle, BSKY_APP_PASSWORD:password } = process.env;
  if(!handle || !password) die('set BSKY_HANDLE and BSKY_APP_PASSWORD');
  const call = async (nsid, body, jwt) => {
    const res = await fetch(`https://bsky.social/xrpc/${nsid}`, { method:'POST',
      headers:{ 'content-type':'application/json', ...(jwt ? { authorization:`Bearer ${jwt}` } : {}) }, body:JSON.stringify(body) });
    const j = await res.json();
    if(!res.ok) die(`${nsid}: ${res.status} ${j.message || j.error}`);
    return j;
  };
  const s = await call('com.atproto.server.createSession', { identifier:handle, password });
  const r = await call('com.atproto.repo.createRecord', { repo:s.did, collection:'app.bsky.feed.post', record }, s.accessJwt);
  console.log(`https://bsky.app/profile/${s.handle}/post/${r.uri.split('/').pop()}`);
}

/* ---- Mastodon ----------------------------------------------------------- */
async function mastodon(){
  if(text.length > 500) die('Mastodon posts are limited to 500 characters on most instances');
  if(dry) return console.log(JSON.stringify({ status:text, visibility:'public', language:'en' }, null, 2));
  const { MASTODON_INSTANCE:inst, MASTODON_TOKEN:token } = process.env;
  if(!inst || !token) die('set MASTODON_INSTANCE and MASTODON_TOKEN');
  const res = await fetch(`${inst.replace(/\/$/, '')}/api/v1/statuses`, { method:'POST',
    headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json', 'idempotency-key':`klar-${Buffer.from(text).toString('base64url').slice(0, 48)}` },
    body:JSON.stringify({ status:text, visibility:'public', language:'en' }) });
  const j = await res.json();
  if(!res.ok) die(`statuses: ${res.status} ${j.error}`);
  console.log(j.url);
}

await (target === 'bluesky' ? bluesky() : mastodon());
