// The PostHog proxy must never pass the player's IP, cookies or credentials upstream.
// Pure tests — no network, no server.
import assert from 'node:assert/strict';
import { forwardHeaders, upstreamUrl } from '../src/routes/ingest.js';

const incoming = {
  host:'klarbase.dev', 'content-type':'application/json', 'content-encoding':'gzip', 'user-agent':'UA/1.0',
  cookie:'better-auth.session_token=secret', authorization:'Bearer x',
  'x-forwarded-for':'203.0.113.9', 'x-real-ip':'203.0.113.9', 'cf-connecting-ip':'203.0.113.9', forwarded:'for=203.0.113.9',
  'x-forwarded-proto':'https', 'cf-ipcountry':'DE', referer:'https://klarbase.dev/isle/x', origin:'https://klarbase.dev', 'accept-language':'de',
};
const out = forwardHeaders(incoming);
assert.deepEqual(out, { 'content-type':'application/json', 'content-encoding':'gzip', 'user-agent':'UA/1.0' });
for(const bad of ['cookie', 'authorization', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded', 'host', 'referer', 'origin'])
  assert.ok(!(bad in out), `${bad} must not be forwarded`);
assert.deepEqual(forwardHeaders({}), {});
assert.deepEqual(forwardHeaders(), {});
assert.deepEqual(forwardHeaders({ 'user-agent':['a', 'b'] }), {}, 'non-string header values are ignored');

assert.equal(upstreamUrl('/ingest/e/?ip=1&_=1'), 'https://eu.i.posthog.com/e/?ip=1&_=1');
assert.equal(upstreamUrl('/ingest/flags/?v=2'), 'https://eu.i.posthog.com/flags/?v=2');
assert.equal(upstreamUrl('/ingest/static/array.js'), 'https://eu-assets.i.posthog.com/static/array.js');
assert.equal(upstreamUrl('/ingest'), 'https://eu.i.posthog.com/');

console.log('ingest proxy: ok');
