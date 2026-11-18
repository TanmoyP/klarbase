// Klarbase — usage analytics. Cookieless PostHog (EU), privacy-first.
//
//   - Does NOTHING unless VITE_POSTHOG_KEY is set at build time, the player has not
//     switched it off (localStorage klarbase.v2.analytics = 'off'), and the browser
//     is not sending Do Not Track / Global Privacy Control.
//   - Talks only to our own /ingest proxy (server/src/routes/ingest.js), which drops
//     the player's IP and cookies before anything reaches PostHog.
//   - memory persistence: no cookie, no localStorage entry, no ID that survives a reload.
//   - Autocapture, session recording, surveys, feature flags, heatmaps, dead clicks and
//     exception capture are all off. The ONLY events sent are the fixed list below, each
//     with a fixed list of properties — anything else is dropped before it leaves track().
//   - The list is also rendered on the privacy page, so what we say is what the code sends.
const FLAG = 'klarbase.v2.analytics';

// name -> { about (shown on /privacy), props: allowed property names }
const CATALOGUE = {
  pageview:          { props:['path'],                                  about:'A page of the game was opened (the address only, e.g. /isle/root-bridge; no query string).' },
  isle_start:        { props:['source', 'par'],                         about:'You made the first move on an isle (where it came from, and its par).' },
  isle_clear:        { props:['source', 'par', 'moves', 'ms_bucket'],   about:'You cleared an isle (where it came from, par, your moves, and a rough time bucket).' },
  hint:              { props:[],                                        about:'You asked for a hint.' },
  restart:           { props:[],                                        about:'You restarted an isle part-way through.' },
  builder_open:      { props:[],                                        about:'You opened the isle builder.' },
  share_online:      { props:[],                                        about:'You shared an isle online.' },
  propose_github:    { props:[],                                        about:'You chose to propose an isle on GitHub (the prefilled pull request link, or the file download).' },
  sign_in:           { props:['provider'],                              about:'You signed in (GitHub or Google).' },
  comment_post:      { props:[],                                        about:'You posted a comment on an isle.' },
  map_enter:         { props:[],                                        about:'You opened the world map.' },
  map_shrine_enter:  { props:['kind'],                                  about:'You walked into a shrine on the map (which kind).' },
  map_region:        { props:['theme'],                                 about:'You entered a region of the map (its theme).' },
};
export const EVENTS = Object.entries(CATALOGUE).map(([name, e]) => ({ name, props:e.props, description:e.about }));

const SOURCES = ['official', 'community', 'daily', 'online', 'wild'];
const PROVIDERS = ['github', 'google'];
const HASH = /[0-9a-f]{64}/g;

// Keep the route's shape, drop anything that identifies a specific shared isle.
export const normalizePath = p => String(p || '/').split(/[?#]/)[0].replace(HASH, ':hash').slice(0, 120) || '/';

// Per-property sanitiser: enumerations are closed, numbers finite, strings short.
const clean = {
  path:      normalizePath,
  source:    v => SOURCES.includes(v) ? v : undefined,
  provider:  v => PROVIDERS.includes(v) ? v : undefined,
  par:       v => Number.isFinite(v) ? Math.max(0, Math.min(500, Math.round(v))) : undefined,
  moves:     v => Number.isFinite(v) ? Math.max(0, Math.min(500, Math.round(v))) : undefined,
  ms_bucket: v => Number.isInteger(v) && v >= 0 && v <= 20 ? v : undefined,
  kind:      v => typeof v === 'string' && /^[\w-]{1,24}$/.test(v) ? v : undefined,
  theme:     v => typeof v === 'string' && /^[\w-]{1,24}$/.test(v) ? v : undefined,
};
export function sanitize(name, props){
  const spec = CATALOGUE[name]; if(!spec) return null;
  const out = {};
  for(const k of spec.props){ const v = props && clean[k](props[k]); if(v !== undefined) out[k] = v; }
  return out;
}

let ph = null, starting = false, enabled = false, queue = [], whoami = null;
const read = () => { try { return localStorage.getItem(FLAG); } catch { return null; } };
const write = on => { try { on ? localStorage.removeItem(FLAG) : localStorage.setItem(FLAG, 'off'); } catch {} };
const signal = () => navigator.doNotTrack === '1' || !!navigator.globalPrivacyControl;
const configured = () => !!import.meta.env.VITE_POSTHOG_KEY;

// 'on' | 'off' (you turned it off) | 'dnt' (your browser asks not to be tracked) | 'unconfigured' (this build sends nothing)
export function analyticsState(){
  if(!configured()) return 'unconfigured';
  if(signal()) return 'dnt';
  return read() === 'off' ? 'off' : 'on';
}

// Our own event gate in front of PostHog: no PostHog-side opt-out flag is used, because
// that would be written to storage — and "off" must leave nothing behind but our one flag.
async function start(){
  if(ph || starting || analyticsState() !== 'on') return;
  starting = true; enabled = true;
  try {
    const { default: posthog } = await import('posthog-js');
    posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
      api_host: '/ingest', ui_host: 'https://eu.posthog.com',   // same-origin proxy; ui_host for links back to PostHog
      persistence: 'memory',                                     // no cookie, no localStorage
      person_profiles: 'identified_only',
      autocapture: false, capture_pageview: false, capture_pageleave: false,
      disable_session_recording: true, disable_surveys: true, disable_product_tours: true, disable_conversations: true,
      disable_web_experiments: true, advanced_disable_flags: true,   // also stops the remote-config / flags request
      capture_heatmaps: false, capture_dead_clicks: false, capture_exceptions: false, rageclick: false,
      capture_performance: false, disable_scroll_properties: true,
      save_referrer: false, save_campaign_params: false,
      disable_external_dependency_loading: true,                 // never fetch extra scripts from PostHog
      // The default $current_url/$pathname would carry the 64-hex hash of a shared isle; keep only the route shape.
      before_send: ev => {
        if(!ev) return ev;
        const p = ev.properties || (ev.properties = {});
        if(p.$pathname) p.$pathname = normalizePath(p.$pathname);
        if(p.$current_url) p.$current_url = location.origin + normalizePath(location.pathname);
        delete p.$referrer;
        return ev;
      },
    });
    ph = posthog;
    if(whoami) ph.identify(whoami);
    for(const [n, p] of queue.splice(0)) ph.capture(n, p);
  } catch(e){
    if(import.meta.env.DEV) console.warn('[klarbase] analytics failed to load', e);
    enabled = false; queue = [];
  }
  starting = false;
}

export function initAnalytics(){ if(analyticsState() === 'on') start(); }

export function track(name, props){
  const p = sanitize(name, props);
  if(!p){ if(import.meta.env.DEV) console.warn('[klarbase] unknown analytics event dropped:', name); return; }
  if(analyticsState() !== 'on') return;
  if(ph) ph.capture(name, p);
  else if(enabled && queue.length < 50) queue.push([name, p]);
}

// The opaque better-auth user id ONLY — never a name or an email.
export function identify(userId){
  if(typeof userId !== 'string' || !/^[\w-]{6,64}$/.test(userId)) return;
  whoami = userId;
  if(ph && analyticsState() === 'on') ph.identify(userId);
}
export function reset(){ whoami = null; queue = []; if(ph) ph.reset(); }

// The privacy page toggle: persists the choice and applies it right away.
export function setAnalyticsEnabled(on){
  write(!!on);
  if(on){ start(); }
  else { enabled = false; queue = []; whoami = null; if(ph) ph.reset(); }
}
