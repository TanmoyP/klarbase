// @klar/core — components: palette, type table, occupancy. Pure. No DOM, no I/O.
// Ported byte-faithfully from prototypes/phase1.html (Phase 1 v4, spec v4.5).

export const PAL = {
  ground:    0xc98d5e,
  structure: 0xe6d5b8,
  accent:    0x6fc4b8,
  void:      0x584b73,
  grass:     0x86a86b,
  grassTip:  0xa9c483,
  avatar:    0xf4e9d8,
  avatarAcc: 0x6fc4b8,
};

/* ==================== MODULE: Components — socket-derived occupancy & nodes = */
// occ(c) -> list of [x,y,z] solid cells occupied
// nodes(c) -> list of walk nodes {x,y,z,h2}  (x,y,z = cell the feet occupy)
export const DIRS = [[0,0,-1],[1,0,0],[0,0,1],[-1,0,0]]; // r = 0..3

export const TYPES = {
  block: {
    label:'Block', key:'1', rotatable:false,
    occ:  c => [[c.p[0], c.p[1], c.p[2]]],
    node: c => ({ x:c.p[0], y:c.p[1]+1, z:c.p[2], h2:2*(c.p[1]+1) }),
    color:'ground',
    grass:true,
  },
  slab: {
    label:'Slab', key:'2', rotatable:false,
    occ:  c => [[c.p[0], c.p[1], c.p[2]]],
    node: c => ({ x:c.p[0], y:c.p[1], z:c.p[2], h2:2*c.p[1]+1 }),
    color:'structure',
  },
  stairs: {
    label:'Stair', key:'3', rotatable:true,
    occ:  c => [[c.p[0], c.p[1], c.p[2]]],
    node: c => ({ x:c.p[0], y:c.p[1]+1, z:c.p[2], h2:2*(c.p[1]+1) }),
    color:'structure',
  },
  column: {
    label:'Column', key:'4', rotatable:false,
    occ:  c => { const h = (c.v&&c.v.h)||3, out=[];
                 for(let i=0;i<h;i++) out.push([c.p[0], c.p[1]+i, c.p[2]]);
                 return out; },
    node: c => { const h=(c.v&&c.v.h)||3;
                 return { x:c.p[0], y:c.p[1]+h, z:c.p[2], h2:2*(c.p[1]+h) }; },
    color:'structure',
  },
  spawn: {
    label:'Spawn', key:'5', rotatable:false,
    occ:  c => [[c.p[0], c.p[1], c.p[2]]],
    node: c => ({ x:c.p[0], y:c.p[1]+1, z:c.p[2], h2:2*(c.p[1]+1) }),
    color:'void',
  },
  goal: {
    label:'Goal', key:'6', rotatable:false,
    occ:  c => [[c.p[0], c.p[1], c.p[2]]],
    node: c => ({ x:c.p[0], y:c.p[1]+1, z:c.p[2], h2:2*(c.p[1]+1) }),
    color:'accent',
  },
};

export const TYPE_ORDER = ['block','slab','stairs','column','spawn','goal'];
export const ROLE_ORDER = ['ground','structure','accent','void'];   // C cycles these (null = type default)

/* ---- plot ---- */
export const PLOT = { size:[16,12,16] };

export const ck  = (x,y,z) => x+','+y+','+z;
export const nk  = n => n.x+','+n.y+','+n.z;

/* ---------------------------------------------------- derived: occupancy */
export function buildOccupancy(comps){
  const solid = new Map();
  for(const c of comps)
    for(const cell of TYPES[c.t].occ(c)) solid.set(ck(...cell), c);
  return solid;
}
