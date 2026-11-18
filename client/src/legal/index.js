// Legal pages: one screen (#scr-legal), content loaded on demand so the game bundle stays small.
// Each page module exports { title, updated, html(), mount?(root) }.
export const LEGAL_PAGES = ['privacy', 'terms', 'guidelines', 'imprint', 'licenses'];

let seq = 0;
export async function showLegal(name){
  const root = document.querySelector('#scr-legal');
  if(!root || !LEGAL_PAGES.includes(name)) return;
  const body = root.querySelector('.scroll'), head = root.querySelector('h2');
  const mine = ++seq;
  head.textContent = '…'; body.textContent = '';
  let page;
  switch(name){   // literal paths so the bundler splits one chunk per page
    case 'privacy': page = await import('./privacy.js'); break;
    case 'terms': page = await import('./terms.js'); break;
    case 'guidelines': page = await import('./guidelines.js'); break;
    case 'imprint': page = await import('./imprint.js'); break;
    case 'licenses': page = await import('./licenses.js'); break;
  }
  if(mine !== seq) return;   // the player already moved on
  head.textContent = page.title;
  body.innerHTML = page.html();
  body.scrollTop = 0;
  if(page.mount) page.mount(body);
}
