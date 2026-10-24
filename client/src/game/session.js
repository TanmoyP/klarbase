// A play session on one isle: input -> engine step -> animation, with undo,
// restart, hints, optional timer and solution replay. All rules come from
// @klar/core; this file only sequences them.
import { initialState, step, solveFrom, seedsTouched } from '@klar/core';
import { sfx } from './audio.js';

export class Session {
  constructor(world, level, meta, hooks = {}){
    this.world = world; this.level = level; this.meta = meta; this.hooks = hooks;
    this.queue = []; this.busy = false; this.replayToken = 0;
    this.restart(true);
  }

  restart(silent = false){
    this.replayToken++;
    this.state = initialState(this.level);
    this.history = []; this.moves = 0; this.won = false; this.queue = [];
    this.t0 = null; this.elapsed = 0; this.hintsUsed = 0; this.replaying = false;
    this.seeds = new Set(); this.seedHistory = [];   // seeds are not rule state: tracked here, undone with the move
    this.world.reset(this.state); this.world.setSeeds(this.seeds);
    this.world.showHint(null);
    if(!silent) sfx.undo();
    this.emit();
  }

  get time(){ return this.t0 == null ? this.elapsed : this.elapsed + (performance.now() - this.t0) / 1000; }
  emit(){ this.hooks.onChange && this.hooks.onChange(this); }

  input(move){
    if(this.won || this.replaying) return;
    if(this.queue.length < 2) this.queue.push(move);
    this.pump();
  }

  async pump(){
    if(this.busy) return;
    this.busy = true;
    while(this.queue.length && !this.won){
      const m = this.queue.shift();
      const r = step(this.level, this.state, m);
      if(!r.ok){ if(r.bonk) this.hooks.onHazard && this.hooks.onHazard(r.bonk); await this.world.bonk(r.bonk); continue; }
      if(this.t0 == null && !this.won) this.t0 = performance.now();
      // effort sensing: only time spent actually moving counts (idle gaps > 20 s are ignored)
      const now = performance.now(), gap = this.lastMove ? (now - this.lastMove) / 1000 : 0;
      this.lastMove = now;
      this.hooks.onEffort && this.hooks.onEffort(gap > 0 && gap < 20 ? gap : 0);
      this.world.showHint(null);
      this.history.push(this.state); this.seedHistory.push(new Set(this.seeds));
      this.state = r.state; this.moves++;
      const picked = seedsTouched(this.level, r).filter(i => !this.seeds.has(i));
      for(const i of picked) this.seeds.add(i);
      this.emit();
      await this.world.play(m, r);
      for(const i of picked) this.world.collectSeed(i);
      if(r.won) await this.finish();
    }
    this.busy = false;
  }

  async finish(){
    this.won = true;
    this.elapsed = this.time; this.t0 = null;
    this.emit();
    await this.world.celebrate();
    this.hooks.onWin && this.hooks.onWin(this);
  }

  undo(){
    if(this.busy || this.replaying || !this.history.length || this.won) return;
    this.state = this.history.pop(); this.moves = this.history.length;   // cozy: experimenting is free; stars judge your final path
    this.seeds = this.seedHistory.pop() || new Set();
    this.world.reset(this.state); this.world.setSeeds(this.seeds); this.world.showHint(null);
    sfx.undo(); this.emit();
  }

  // Best next move from where you stand — or the honest news that you're stuck.
  hint(){
    if(this.busy || this.replaying || this.won) return null;
    const r = solveFrom(this.level, this.state, { maxStates:150000 });
    this.hintsUsed++;
    if(!r.solvable){ this.world.showHint(null); return { stuck:true }; }
    this.world.showHint(r.solution[0], this.state);
    return { move:r.solution[0], left:r.par };
  }

  // Replay a solution from the start. onStep(i) highlights the key strip.
  async replay(solution, onStep){
    const token = ++this.replayToken;
    this.state = initialState(this.level); this.history = []; this.moves = 0; this.won = false; this.queue = [];
    this.t0 = null; this.elapsed = 0; this.seeds = new Set(); this.seedHistory = [];
    this.world.reset(this.state); this.world.setSeeds(this.seeds); this.world.showHint(null);
    this.replaying = true; this.emit();
    await new Promise(r => setTimeout(r, 450));
    for(let i = 0; i < solution.length; i++){
      if(token !== this.replayToken) return;
      onStep && onStep(i);
      const r = step(this.level, this.state, solution[i]);
      if(!r.ok) break;
      this.state = r.state; this.moves++; this.emit();
      await this.world.play(solution[i], r, { fast:true });
      for(const k of seedsTouched(this.level, r)) if(!this.seeds.has(k)){ this.seeds.add(k); this.world.collectSeed(k); }
      await new Promise(res => setTimeout(res, 70));
      if(r.won){ if(token === this.replayToken){ await this.world.celebrate(); } break; }
    }
    if(token !== this.replayToken) return;
    onStep && onStep(-1);
    this.replaying = false;
    this.restart(true);
  }
  stopReplay(){ if(this.replaying){ this.replayToken++; this.replaying = false; this.restart(true); } }
}
