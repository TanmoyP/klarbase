// localStorage `klarbase.v2.map` = { pos:{x, z, t}, explored:['cx,cz', ...] } (cloudsave.js syncs it; MAX 2000 chunks).
const KEY = 'klarbase.v2.map', MAX = 2000;
export const loadMap = () => {
  try {
    const m = JSON.parse(localStorage.getItem(KEY));
    if(!m || typeof m !== 'object') return { pos:null, explored:[], extra:{} };
    const { pos, explored, ...extra } = m;
    return { pos:pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x:pos.x | 0, z:pos.z | 0, t:+pos.t || 0 } : null, explored:Array.isArray(explored) ? explored.filter(s => typeof s === 'string') : [], extra };
  } catch { return { pos:null, explored:[], extra:{} }; }
};
export function saveMap(pos, explored, extra = {}){
  try {
    let list = [...explored]; if(list.length > MAX) list = list.slice(list.length - MAX);
    localStorage.setItem(KEY, JSON.stringify({ ...extra, pos:{ x:pos.x, z:pos.z, t:Date.now() }, explored:list }));
  } catch {}
}
