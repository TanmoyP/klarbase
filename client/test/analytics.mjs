// Analytics gate: only catalogued events, only their allowed properties, no hashes in paths.
import assert from 'node:assert/strict';
import { EVENTS, sanitize, normalizePath } from '../src/analytics.js';

assert.deepEqual(EVENTS.map(e => e.name), ['pageview', 'isle_start', 'isle_clear', 'hint', 'restart', 'builder_open',
  'share_online', 'propose_github', 'sign_in', 'comment_post', 'map_enter', 'map_shrine_enter', 'map_region']);
assert.ok(EVENTS.every(e => e.description && Array.isArray(e.props)));

assert.equal(sanitize('click', {}), null, 'unknown events are dropped');
assert.deepEqual(sanitize('isle_clear', { source:'official', par:12, moves:14.2, ms_bucket:3, email:'a@b.c', name:'x' }),
  { source:'official', par:12, moves:14, ms_bucket:3 }, 'extra properties are stripped');
assert.deepEqual(sanitize('isle_start', { source:'evil<script>', par:NaN }), {}, 'bad values are dropped');
assert.deepEqual(sanitize('hint', { source:'official' }), {}, 'events without properties take none');
assert.deepEqual(sanitize('sign_in', { provider:'github' }), { provider:'github' });
assert.deepEqual(sanitize('sign_in', { provider:'facebook' }), {});

const h = 'ab'.repeat(32);
assert.equal(normalizePath(`/i/${h}`), '/i/:hash');
assert.equal(normalizePath(`/p/${h}?x=1#top`), '/p/:hash');
assert.equal(normalizePath('/isle/root-bridge?utm=1'), '/isle/root-bridge');
assert.deepEqual(sanitize('pageview', { path:`/i/${h}`, extra:1 }), { path:'/i/:hash' });

console.log('analytics: ok');
