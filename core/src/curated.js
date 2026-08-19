// @klar/core — curated playset maquettes (single source of truth).
//
// These 16 verified, solvable v4 maquettes are imported by the client preset
// loader and by tools/author.mjs. Any change here is immediately reflected in
// both the in-game Playset and the generated canonical JSON artifacts.

const B = (x,y,z)=>({t:'block',p:[x,y,z]});
const build = list => list.map((c,i)=>({ i:i+1, t:c.t, p:c.p, r:c.r||0, v:c.v }));

/* ---- 1. First Steps ---- */
function m1(){
  const out=[];
  for(let x=2;x<=8;x++) for(let z=2;z<=8;z++) out.push(B(x,0,z));
  out.push({t:'column',p:[1,0,1],v:{h:4}},{t:'column',p:[9,0,1],v:{h:2}},
           {t:'column',p:[1,0,9],v:{h:2}},{t:'column',p:[9,0,9],v:{h:4}});
  out.push({t:'slab',p:[6,1,5]},{t:'slab',p:[7,1,5]},{t:'slab',p:[6,1,6]},{t:'slab',p:[7,1,6]});
  const keep=out.filter(c=>!(c.p[0]===2&&c.p[2]===2)&&!(c.p[0]===8&&c.p[2]===8));
  keep.push({t:'spawn',p:[2,0,2]},{t:'goal',p:[8,0,8]});
  return build(keep);
}

/* ---- 2. The Climb ---- */
function m2(){
  const out=[];
  for(let x=0;x<=7;x++) for(let z=0;z<=3;z++) out.push(B(x,0,z));
  out.push({t:'stairs',p:[3,1,1],r:1}); out.push(B(4,1,1)); out.push(B(5,1,1));
  out.push({t:'stairs',p:[5,2,1],r:1}); out.push(B(6,1,1)); out.push({t:'goal',p:[6,2,1]});
  out.push({t:'column',p:[0,1,3],v:{h:3}},{t:'column',p:[7,1,0],v:{h:2}});
  const keep=out.filter(c=>!(c.p[0]===0&&c.p[1]===0&&c.p[2]===1));
  keep.push({t:'spawn',p:[0,0,1]});
  return build(keep);
}

/* ---- 3. Split Level ---- */
function m3(){
  const out=[];
  for(let x=0;x<=7;x++) for(let z=0;z<=4;z++){
    if((x===0&&z===2)||(x===1&&z===0)||(x===7&&z===4)) continue;
    out.push(B(x,0,z));
  }
  out.push({t:'spawn',p:[0,0,2]});
  out.push({t:'stairs',p:[3,1,2],r:1});
  out.push(B(4,1,2),B(5,1,2));
  out.push({t:'column',p:[1,0,0],v:{h:3}},{t:'column',p:[7,0,4],v:{h:2}});
  out.push({t:'goal',p:[6,1,2]});
  return build(out);
}

/* ---- 4. The Seam ---- */
function m4(){
  return build([
    {t:'spawn',p:[0,0,0]}, B(1,0,0), B(2,0,0),
    {t:'column',p:[5,0,3],v:{h:3}}, B(5,3,3), B(6,3,3), B(7,3,3),
    {t:'goal',p:[8,3,3]},
  ]);
}
const m4allow=[{a:'2,1,0', b:'5,4,3', yaw:0}];

/* ---- 5. Turnabout ---- */
function m5(){
  return build([
    {t:'spawn',p:[0,0,2]}, B(1,0,2), B(2,0,2),
    {t:'column',p:[7,0,5],v:{h:3}}, B(5,3,5), B(6,3,5), B(7,3,5),
    {t:'goal',p:[8,3,5]},
  ]);
}
const m5allow=[{a:'2,1,2', b:'5,4,5', yaw:0}];

/* ---- 6. Twofold ---- */
function m6(){
  return build([
    {t:'spawn',p:[0,0,0]}, B(1,0,0), B(2,0,0),
    {t:'column',p:[5,0,3],v:{h:3}}, B(5,3,3), B(6,3,3),
    {t:'column',p:[9,0,6],v:{h:4}}, {t:'column',p:[9,4,6],v:{h:2}}, B(9,6,6),
    B(10,6,6), {t:'goal',p:[11,6,6]},
  ]);
}
const m6allow=[{a:'2,1,0', b:'5,4,3', yaw:0}, {a:'6,4,3', b:'9,7,6', yaw:0}];

/* ---- 7. The Gap ---- */
function m7(){
  const out=[];
  for(let x=0;x<=8;x++) for(let z=2;z<=6;z++){
    if(x===0&&z===4) continue;
    out.push(B(x,0,z));
  }
  out.push({t:'spawn',p:[0,0,4]});
  out.push({t:'stairs',p:[2,1,4],r:1}); out.push(B(3,1,4),B(4,1,4));
  out.push({t:'column',p:[7,0,7],v:{h:4}}, B(7,4,7), B(8,4,7));
  out.push({t:'goal',p:[9,4,7]});
  return build(out);
}
const m7allow=[{a:'4,2,4', b:'7,5,7', yaw:0}];

/* ---- 8. The Ascent ---- */
function m8(){
  return build([
    {t:'spawn',p:[0,0,0]}, B(1,0,0), B(2,0,0),
    {t:'column',p:[5,0,3],v:{h:3}}, B(5,3,3), B(6,3,3),
    {t:'column',p:[9,0,6],v:{h:4}}, {t:'column',p:[9,4,6],v:{h:2}}, B(9,6,6), B(10,6,6),
    {t:'column',p:[13,0,9],v:{h:4}}, {t:'column',p:[13,4,9],v:{h:4}}, {t:'column',p:[13,8,9],v:{h:1}}, B(13,9,9),
    {t:'goal',p:[14,9,9]},
  ]);
}
const m8allow=[{a:'2,1,0',b:'5,4,3',yaw:0},{a:'6,4,3',b:'9,7,6',yaw:0},{a:'10,7,6',b:'13,10,9',yaw:0}];

/* ---- 9. The Gardens ---- */
function m9(){
  const out=[];
  // 12x12 garden floor with winding ponds (holes)
  for(let x=2;x<=13;x++) for(let z=2;z<=13;z++){
    if((x>=5&&x<=7 && z>=5&&z<=7) || (x>=9&&x<=11 && z>=9&&z<=11) || (x>=4&&x<=6 && z>=10&&z<=12)) continue;
    out.push(B(x,0,z));
  }
  // corner columns outside the garden floor
  out.push({t:'column',p:[1,0,1],v:{h:3}},{t:'column',p:[14,0,1],v:{h:3}},
           {t:'column',p:[1,0,14],v:{h:3}},{t:'column',p:[14,0,14],v:{h:3}});
  // a few central columns (these sit inside pond holes, so no floor overlap)
  out.push({t:'column',p:[7,0,7],v:{h:2}},{t:'column',p:[9,0,9],v:{h:2}});
  out.push({t:'spawn',p:[3,0,3]},{t:'goal',p:[11,0,11]});
  return build(out);
}

/* ---- 10. The Steps ---- */
function m10(){
  const out=[];
  // base pad and side walls
  for(let x=3;x<=7;x++) for(let z=0;z<=2;z++) out.push(B(x,0,z));
  // chained stair flights along the centre, each gaining one solid level
  const landings = [[5,1,4],[5,2,6],[5,3,8],[5,4,10],[5,5,12],[5,6,14]];
  const stairs = [[5,1,3],[5,2,5],[5,3,7],[5,4,9],[5,5,11],[5,6,13]];
  for(const [x,y,z] of landings) out.push(B(x,y,z));
  for(const [x,y,z] of stairs) out.push({t:'stairs',p:[x,y,z],r:2});
  // support columns beneath landings and stairs
  for(const [x,y,z] of landings){
    for(let yy=0;yy<y;yy++) out.push(B(x,yy,z));
    // connect landings to the base pad and each other
    for(let zz=Math.max(0,z-2);zz<=z;zz++) out.push(B(x,0,zz));
  }
  for(const [x,y,z] of stairs){
    for(let yy=0;yy<y;yy++) out.push(B(x,yy,z));
  }
  out.push({t:'spawn',p:[5,0,1]},{t:'goal',p:[5,6,15]});
  return build(out);
}

/* ---- 11. The Columns ---- */
function m11(){
  const out=[];
  // left and right canyon floors
  for(let x=0;x<=15;x++) for(let z=0;z<=6;z++){
    if(x===1 && z===5) continue; // spawn cell
    out.push(B(x,0,z));
  }
  for(let x=0;x<=15;x++) for(let z=10;z<=15;z++){
    if(x===15 && z===11) continue; // goal cell
    out.push(B(x,0,z));
  }
  // columns spanning the canyon
  const cols = [[2,7,2],[5,7,3],[8,7,4],[11,7,3],[14,7,2]];
  for(const [x,z,h] of cols) out.push({t:'column',p:[x,0,z],v:{h}});
  // entry slab from left floor
  out.push({t:'slab',p:[2,1,6]});
  // slab bridges between columns
  out.push({t:'slab',p:[3,2,7]},{t:'slab',p:[4,2,7]});   // 2 -> 3
  out.push({t:'slab',p:[6,3,7]},{t:'slab',p:[7,3,7]});   // 3 -> 4
  out.push({t:'slab',p:[9,3,7]},{t:'slab',p:[10,3,7]});  // 4 -> 3
  out.push({t:'slab',p:[12,2,7]},{t:'slab',p:[13,2,7]}); // 3 -> 2
  // exit slabs to right floor
  out.push({t:'slab',p:[14,1,8]},{t:'slab',p:[14,1,9]},{t:'slab',p:[14,1,10]});
  out.push({t:'spawn',p:[1,0,5]},{t:'goal',p:[15,0,11]});
  return build(out);
}

/* ---- 12. The Switchback ---- */
function m12(){
  const out=[];
  // solid stepped ramp with stair cells carved out
  const box = (x1,x2,z1,z2,y,skip=new Set())=>{
    for(let x=x1;x<=x2;x++) for(let z=z1;z<=z2;z++){
      if(skip.has(x+','+z+','+y)) continue;
      out.push(B(x,y,z));
    }
  };
  const stairCells = new Set([
    '7,3,1','8,7,1','7,10,1','8,13,1',
  ]);
  // each level's box covers the ramp; stair cells are carved out and replaced by stairs
  box(6,9,0,4,0);
  box(6,9,0,7,1,stairCells);
  box(6,9,0,10,2,stairCells);
  box(6,9,0,13,3,stairCells);
  box(6,9,0,15,4,stairCells);
  // switchback stairs (carved cells)
  out.push({t:'stairs',p:[7,1,3],r:2});  // y0 -> y1
  out.push({t:'stairs',p:[8,2,7],r:0});  // y1 -> y2
  out.push({t:'stairs',p:[7,3,10],r:2}); // y2 -> y3
  out.push({t:'stairs',p:[8,4,13],r:0}); // y3 -> y4
  out.push({t:'spawn',p:[7,0,1]},{t:'goal',p:[8,4,14]});
  return build(out);
}

/* ---- 13. The Overlook ---- */
function m13(){
  const out=[];
  // lower plaza y=0 x=0..7 z=0..7
  for(let x=0;x<=7;x++) for(let z=0;z<=7;z++) out.push(B(x,0,z));
  // raised deck y=2 x=4..7 z=4..7 (supported by plaza below at y=0,1)
  for(let x=4;x<=7;x++) for(let z=4;z<=7;z++){
    out.push(B(x,2,z));
    out.push(B(x,1,z));
  }
  // stairs to deck
  out.push({t:'stairs',p:[3,1,4],r:1}); // ground (2,0,4) -> deck (4,1,4)
  out.push({t:'stairs',p:[4,2,5],r:2}); // deck y1 -> deck y2
  // tall platform with goal
  out.push({t:'column',p:[10,0,10],v:{h:5}});
  out.push(B(10,5,10),B(10,5,11));
  // goal cell
  out.push({t:'goal',p:[11,5,10]});
  // spawn
  out.push({t:'spawn',p:[1,0,1]});
  return build(out);
}
const m13allow=[{a:'7,3,7', b:'10,6,10', yaw:0}];

/* ---- 14. The Bridge ---- */
function m14(){
  const out=[];
  // lower platform y=1 x=2..6 z=2..6, supported
  for(let x=2;x<=6;x++) for(let z=2;z<=6;z++){
    out.push(B(x,1,z));
    out.push(B(x,0,z));
  }
  // entry/exit ground
  for(let x=2;x<=6;x++){
    if(x===3) continue; // spawn cell
    out.push(B(x,0,0),B(x,0,1));
  }
  // stairs to lower platform
  out.push({t:'stairs',p:[2,1,1],r:2});
  // higher platform y=4 x=8..12 z=8..12, supported
  for(let x=8;x<=12;x++) for(let z=8;z<=12;z++){
    out.push(B(x,4,z));
    for(let y=0;y<=3;y++) out.push(B(x,y,z));
  }
  // goal on higher platform (skip the cell in platform loop by carving after)
  out.push({t:'spawn',p:[3,0,0]},{t:'goal',p:[12,4,12]});
  return build(out);
}
const m14allow=[{a:'5,2,5', b:'8,5,8', yaw:0}];

/* ---- 15. The Labyrinth ---- */
function m15(){
  const out=[];
  // room 1 floor y=0 x=0..4 z=0..4
  for(let x=0;x<=4;x++) for(let z=0;z<=4;z++){
    if(x===1 && z===1) continue; // spawn
    out.push(B(x,0,z));
  }
  // room 2 floor y=0 x=11..15 z=11..15
  for(let x=11;x<=15;x++) for(let z=11;z<=15;z++){
    if(x===14 && z===14) continue; // goal
    out.push(B(x,0,z));
  }
  // upper bridge y=3 x=5..9 z=5..9, fully supported
  for(let x=5;x<=9;x++) for(let z=5;z<=9;z++){
    out.push(B(x,3,z));
    out.push(B(x,0,z),B(x,1,z),B(x,2,z));
  }
  out.push({t:'spawn',p:[1,0,1]},{t:'goal',p:[14,0,14]});
  return build(out);
}
const m15allow=[{a:'4,1,4', b:'7,4,7', yaw:0}, {a:'8,4,8', b:'11,1,11', yaw:2}];

/* ---- 16. The Citadel ---- */
function m16(){
  const out=[];
  // ground floor with central courtyard open and platform footprints open
  for(let x=0;x<=15;x++) for(let z=0;z<=15;z++){
    if(x>=5&&x<=10 && z>=5&&z<=10) continue; // courtyard
    if(x>=0&&x<=4 && z>=0&&z<=4) continue;   // platform A footprint
    if(x>=5&&x<=9 && z>=5&&z<=9) continue;   // platform B footprint
    if(x>=10&&x<=14 && z>=10&&z<=14) continue; // platform C footprint
    out.push(B(x,0,z));
  }
  // Platform A y=1 x=0..4 z=0..4
  for(let x=0;x<=4;x++) for(let z=0;z<=4;z++) out.push(B(x,1,z));
  // Platform B y=3 x=5..9 z=5..9, supported
  for(let x=5;x<=9;x++) for(let z=5;z<=9;z++){
    out.push(B(x,3,z));
    out.push(B(x,0,z),B(x,1,z),B(x,2,z));
  }
  // Platform C y=5 x=10..14 z=10..14, supported (goal cell carved out later)
  for(let x=10;x<=14;x++) for(let z=10;z<=14;z++){
    if(x===13 && z===13) continue; // goal cell
    out.push(B(x,5,z));
    out.push(B(x,0,z),B(x,1,z),B(x,2,z),B(x,3,z),B(x,4,z));
  }
  // stairs to Platform A
  out.push({t:'stairs',p:[3,1,4],r:1});
  out.push({t:'spawn',p:[1,0,1]},{t:'goal',p:[13,5,13]});
  return build(out);
}
const m16allow=[{a:'4,2,4', b:'6,4,6', yaw:0}, {a:'9,4,9', b:'11,6,11', yaw:0}];

export const CURATED = [
  { order:1, slug:'first-steps', name:'First Steps', sub:'arrows to walk · Q / E to turn the world', hint:'Walk to the glowing marker. Step up onto the low dais on the way.', yaw:0, grass:0.9, make:m1, allow:[] },
  { order:2, slug:'the-climb', name:'The Climb', sub:'stairs are the only way up', hint:'Stairs join end to end: in at the low side, out at the high side.', yaw:0, grass:0.7, make:m2, allow:[] },
  { order:3, slug:'split-level', name:'Split Level', sub:'climb to the upper deck', hint:'Take the stair up; the goal sits on the far edge of the deck.', yaw:0, grass:0.6, make:m3, allow:[] },
  { order:4, slug:'the-seam', name:'The Seam', sub:'the camera is lying · the geometry is honest', hint:'The path ends in the air. Look again — two walkways meet at one point.', yaw:0, grass:0.5, make:m4, allow:m4allow },
  { order:5, slug:'turnabout', name:'Turnabout', sub:'turn the world until it lines up', hint:'The seam lives at one camera angle. Q / E until the gap closes.', yaw:1, grass:0.45, make:m5, allow:m5allow },
  { order:6, slug:'twofold', name:'Twofold', sub:'two lies, one path', hint:'Cross one seam to the middle deck, then find the second.', yaw:0, grass:0.4, make:m6, allow:m6allow },
  { order:7, slug:'the-gap', name:'The Gap', sub:'the deck ends — cross anyway', hint:'The stair leads to a dead end. Turn until the far deck touches yours.', yaw:2, grass:0.5, make:m7, allow:m7allow },
  { order:8, slug:'the-ascent', name:'The Ascent', sub:'three impossible steps into the sky', hint:'Each seam lifts you higher than the last. Climb the lie.', yaw:0, grass:0.35, make:m8, allow:m8allow },
  { order:9, slug:'the-gardens', name:'The Gardens', sub:'a sprawling courtyard of ponds and columns', hint:'Wander the garden. The goal waits in the far corner.', yaw:0, grass:0.85, make:m9, allow:[] },
  { order:10, slug:'the-steps', name:'The Steps', sub:'a long climb of chained flights', hint:'Each stair flight lifts you one level. Follow the flights to the top.', yaw:0, grass:0.6, make:m10, allow:[] },
  { order:11, slug:'the-columns', name:'The Columns', sub:'cross the canyon on bridges of slabs', hint:'The ground stops at the canyon. Climb the first column and hop across.', yaw:0, grass:0.5, make:m11, allow:[] },
  { order:12, slug:'the-switchback', name:'The Switchback', sub:'climb the long stairwell to the roof', hint:'The stair doubles back at every landing. Keep climbing.', yaw:0, grass:0.45, make:m12, allow:[] },
  { order:13, slug:'the-overlook', name:'The Overlook', sub:'a dead-end deck and a leap of faith', hint:'The deck ends in thin air. From the right angle, it touches the tower.', yaw:0, grass:0.4, make:m13, allow:m13allow },
  { order:14, slug:'the-bridge', name:'The Bridge', sub:'a seam spans the void between platforms', hint:'Two platforms face each other across empty space. Line them up.', yaw:0, grass:0.35, make:m14, allow:m14allow },
  { order:15, slug:'the-labyrinth', name:'The Labyrinth', sub:'two rooms, one bridge, two seams', hint:'The rooms do not touch. Find the hidden lifts to the bridge above.', yaw:0, grass:0.3, make:m15, allow:m15allow },
  { order:16, slug:'the-citadel', name:'The Citadel', sub:'three terraces and two seams into the sky', hint:'Climb the outer stair, then let the seams carry you from terrace to terrace.', yaw:0, grass:0.25, make:m16, allow:m16allow },
];
