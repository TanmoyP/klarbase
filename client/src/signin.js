// Sign-in modal — one place, so every feature that needs an account (the chip, comments,
// sharing, the solution lock) opens the same friendly dialog: openSignIn().
// The last provider used is remembered on this device (`klarbase.v2.lastProvider`, a
// DEVICE key — never synced) and shown first as the primary button.
import { signIn } from './auth.js';

const KEY = 'klarbase.v2.lastProvider';
const PROVIDERS = { github:'GitHub', google:'Google' };
const last = () => { try { const p = JSON.parse(localStorage.getItem(KEY)); return PROVIDERS[p] ? p : 'github'; } catch { return 'github'; } };

// remember the choice, then hand over to better-auth's OAuth redirect
export function startSignIn(provider){
  try { localStorage.setItem(KEY, JSON.stringify(provider)); } catch {}
  try { sessionStorage.setItem('klarbase.signin', provider); } catch {}   // hook(analytics): sign_in fires once after the OAuth return
  return signIn(provider);
}

// why = optional one-line reason shown above the benefits ("to comment on this isle")
export function openSignIn(why = ''){
  const first = last(), order = [first, ...Object.keys(PROVIDERS).filter(p => p !== first)];
  const btn = (p, i) => `<button class="btn${i ? '' : ' primary'}" id="${p === 'github' ? 'siGh' : 'siGo'}">Continue with ${PROVIDERS[p]}</button>`;
  const body = document.getElementById('modalBody');
  body.classList.remove('wide');
  body.innerHTML = `<h2>Sign in to Klarbase</h2>
    ${why ? `<p class="facts" style="font-weight:700">${why}</p>` : ''}
    <div class="rules" style="margin:10px 0 14px">
      <div><span class="ico">☁</span><span>Your progress on every device</span></div>
      <div><span class="ico">💬</span><span>Comment on isles</span></div>
      <div><span class="ico">🌐</span><span>Share isles online</span></div>
    </div>
    <div class="row">${order.map(btn).join('')}</div>
    <p class="facts" style="font-size:12.5px;font-weight:600;margin:12px 0 0">No account needed to play or build — everything works without one.</p>
    <p class="facts" style="font-size:12px;font-weight:600;margin:8px 0 0">By signing in you agree to the <a data-go='/terms' href="/terms" style="color:inherit">Terms</a> and <a data-go='/privacy' href="/privacy" style="color:inherit">Privacy policy</a>.</p>`;
  document.getElementById('modal').classList.add('on');
}
