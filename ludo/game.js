/* ===================================================================
   LUDO — game.js
   Pure ES6. Architecture: Board geometry + Token / Player / Dice /
   AIPlayer logic + Game controller + AudioManager + UI/stats.
=================================================================== */
'use strict';

/* ------------------------------------------------------------------
   BOARD GEOMETRY  (15x15 grid, row/col 0..14)
   Main loop = 52 cells, clockwise. Each token travels:
     rel 0..50  -> main track cell  (off+rel)%52
     rel 51..55 -> home stretch (5 coloured cells)
     rel 56     -> finished (centre)
------------------------------------------------------------------ */
const COLORS = ['red', 'green', 'yellow', 'blue'];

const PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],          // 0-4
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],    // 5-10
  [0,7],                                  // 11
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],    // 12-17
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],// 18-23
  [7,14],                                 // 24
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],// 25-30
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],// 31-36
  [14,7],                                 // 37
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],// 38-43
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],    // 44-49
  [7,0],                                  // 50
  [6,0]                                   // 51
];

const START_OFFSET = { red:0, green:13, yellow:26, blue:39 };
const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const HOME_STRETCH = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9]],
  blue:   [[13,7],[12,7],[11,7],[10,7],[9,7]]
};
// finished tokens cluster (near centre, on the player's side)
const CENTER_SLOT = { red:[7,6.1], green:[6.1,7], yellow:[7,7.9], blue:[7.9,7] };

const BASE_SLOTS = {
  red:    [[1.5,1.5],[1.5,3.5],[3.5,1.5],[3.5,3.5]],
  green:  [[1.5,10.5],[1.5,12.5],[3.5,10.5],[3.5,12.5]],
  blue:   [[10.5,1.5],[10.5,3.5],[12.5,1.5],[12.5,3.5]],
  yellow: [[10.5,10.5],[10.5,12.5],[12.5,10.5],[12.5,12.5]]
};

const FINISH_REL = 56;          // reaching this = home
const TRACK_MAX_REL = 50;       // last main-track rel

function absIndex(color, rel){ return (START_OFFSET[color] + rel) % 52; }

/* ------------------------------------------------------------------
   AUDIO MANAGER  (WebAudio synthesis — no external files)
------------------------------------------------------------------ */
class AudioManager {
  constructor(){ this.ctx=null; this.enabled=true; this.volume=0.6; }
  _ensure(){
    if(!this.ctx){ try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ this.enabled=false; } }
    if(this.ctx && this.ctx.state==='suspended') this.ctx.resume();
  }
  _tone(freq, dur, type='sine', vol=1, slideTo=null){
    if(!this.enabled) return; this._ensure(); if(!this.ctx) return;
    const t=this.ctx.currentTime;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t+dur);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001,this.volume*vol), t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+dur+0.02);
  }
  _noise(dur, vol=1){
    if(!this.enabled) return; this._ensure(); if(!this.ctx) return;
    const t=this.ctx.currentTime, n=Math.floor(this.ctx.sampleRate*dur);
    const buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
    const s=this.ctx.createBufferSource(), g=this.ctx.createGain();
    s.buffer=buf; g.gain.value=this.volume*vol*0.5;
    s.connect(g); g.connect(this.ctx.destination); s.start();
  }
  dice(){ this._noise(0.22, 0.7); this._tone(180,0.12,'square',0.4); }
  step(){ this._tone(520,0.06,'sine',0.5); }
  capture(){ this._tone(330,0.18,'sawtooth',0.7,120); this._noise(0.18,0.5); }
  extra(){ this._tone(660,0.1,'sine',0.6); this._tone(880,0.12,'sine',0.6); }
  home(){ this._tone(523,0.12,'sine',0.6); setTimeout(()=>this._tone(784,0.16,'sine',0.6),110); }
  win(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this._tone(f,0.28,'triangle',0.7),i*150)); }
  nomove(){ this._tone(200,0.2,'sine',0.5,140); }
}

/* ------------------------------------------------------------------
   TOKEN / PLAYER / DICE
------------------------------------------------------------------ */
class Token {
  constructor(color, index){
    this.color=color; this.index=index;
    this.state='base';   // base | track | home | finished
    this.rel=-1;         // relative position when on board
    this.el=null;
  }
}
class Player {
  constructor(color, name, type, difficulty){
    this.color=color; this.name=name;
    this.type=type;            // 'human' | 'ai'
    this.difficulty=difficulty;// 'easy'|'medium'|'hard'|null
    this.tokens=[0,1,2,3].map(i=>new Token(color,i));
    this.finished=0;
  }
  get done(){ return this.finished===4; }
  activeTokens(){ return this.tokens.filter(t=>t.state!=='finished'); }
}
class Dice {
  constructor(){ this.value=0; }
  roll(){ this.value=1+Math.floor(Math.random()*6); return this.value; }
}

/* ------------------------------------------------------------------
   GAME CONTROLLER
------------------------------------------------------------------ */
class Game {
  constructor(){
    this.audio=new AudioManager();
    this.boardEl=document.getElementById('board');
    this.players=[];
    this.order=[];           // active player indices in turn order
    this.current=0;
    this.dice=new Dice();
    this.sixStreak=0;
    this.busy=false;         // animation / awaiting lock
    this.awaitingMove=false;
    this.rankings=[];
    this.paused=false;
    this.stepMs=150;
    this.turns=0;
    this.captures=0;         // captures by human(s) this game
    this.gotCaptured=false;  // any human token captured this game (for "untouchable")
    this.buildBoardBackground();
  }

  /* ---------- board DOM ---------- */
  buildBoardBackground(){
    const b=this.boardEl; b.innerHTML='';
    const startKey={ '6,1':'red','1,8':'green','8,13':'yellow','13,6':'blue' };
    const stretchKey={}; for(const c of COLORS) HOME_STRETCH[c].forEach(([r,cc])=>stretchKey[r+','+cc]=c);
    const safeKeys=new Set([...SAFE_INDICES].map(i=>PATH[i].join(',')));
    const pathKeys=new Set(PATH.map(p=>p.join(',')));

    for(let r=0;r<15;r++) for(let c=0;c<15;c++){
      const cell=document.createElement('div');
      cell.className='cell';
      const k=r+','+c;
      const inRed=r<6&&c<6, inGreen=r<6&&c>8, inBlue=r>8&&c<6, inYellow=r>8&&c>8;
      const inCenter=r>=6&&r<=8&&c>=6&&c<=8;
      if(inRed) cell.classList.add('q','q-red');
      else if(inGreen) cell.classList.add('q','q-green');
      else if(inBlue) cell.classList.add('q','q-blue');
      else if(inYellow) cell.classList.add('q','q-yellow');
      else if(inCenter) cell.classList.add('center');
      else if(stretchKey[k]) cell.classList.add('path','path-'+stretchKey[k]);
      else if(pathKeys.has(k)){
        cell.classList.add('path');
        if(startKey[k]){ cell.classList.add('path-'+startKey[k],'start-'+startKey[k],'safe'); }
        else if(safeKeys.has(k)) cell.classList.add('safe');
      } else cell.classList.add('path');
      cell.style.gridRow=(r+1); cell.style.gridColumn=(c+1);
      b.appendChild(cell);
    }
    // home base white slots
    for(const color of COLORS){
      for(const [r,c] of BASE_SLOTS[color]){
        const s=document.createElement('div');
        s.className='home-slot';
        s.style.left=((c+0.5)/15*100)+'%';
        s.style.top=((r+0.5)/15*100)+'%';
        s.style.width=(1/15*100*0.86)+'%';
        s.style.height=(1/15*100*0.86)+'%';
        b.appendChild(s);
      }
    }
    // centre triangles (decoration)
    this._centerDecor();
  }
  _centerDecor(){
    // coloured triangles forming the central home, each pointing to its column
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 15 15');
    svg.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1';
    const polys={ green:'6,6 9,6 7.5,7.5', red:'6,6 6,9 7.5,7.5',
                  yellow:'9,6 9,9 7.5,7.5', blue:'6,9 9,9 7.5,7.5' };
    for(const c in polys){
      const p=document.createElementNS('http://www.w3.org/2000/svg','polygon');
      p.setAttribute('points',polys[c]);
      p.setAttribute('fill',`var(--${c})`);
      svg.appendChild(p);
    }
    this.boardEl.appendChild(svg);
  }

  /* ---------- setup ---------- */
  setup(configs){
    // configs: [{color,name,type,difficulty}] in COLORS order, only active
    this.players=configs.map(c=>new Player(c.color,c.name,c.type,c.difficulty));
    this.order=this.players.map((_,i)=>i);
    this.current=0; this.sixStreak=0; this.rankings=[];
    this.turns=0; this.captures=0; this.gotCaptured=false;
    this.busy=false; this.awaitingMove=false; this.paused=false;
    // remove old tokens
    this.boardEl.querySelectorAll('.token').forEach(e=>e.remove());
    for(const p of this.players) for(const t of p.tokens){
      const el=document.createElement('div');
      el.className='token '+p.color;
      el.dataset.color=p.color; el.dataset.idx=t.index;
      el.addEventListener('click',()=>this.onTokenClick(t));
      t.el=el; this.boardEl.appendChild(el);
    }
    this.renderTokens();
    this.buildPanels();
    this.updateUI();
    this.startTurn();
  }

  curPlayer(){ return this.players[this.order[this.current]]; }

  /* ---------- token position rendering ---------- */
  cellOf(token){
    if(token.state==='base') return BASE_SLOTS[token.color][token.index];
    if(token.state==='finished') return CENTER_SLOT[token.color];
    if(token.rel<=TRACK_MAX_REL) return PATH[absIndex(token.color,token.rel)];
    if(token.rel<FINISH_REL) return HOME_STRETCH[token.color][token.rel-51];
    return CENTER_SLOT[token.color];
  }
  renderTokens(){
    // group on-board tokens by cell for stacking offset
    const groups={};
    const all=[];
    for(const p of this.players) for(const t of p.tokens) all.push(t);
    for(const t of all){
      if(t.state==='track'||t.state==='home'){
        const [r,c]=this.cellOf(t); const k=r+','+c;
        (groups[k]=groups[k]||[]).push(t);
      }
    }
    for(const t of all){
      const [r,c]=this.cellOf(t);
      let or=r, oc=c;
      if(t.state==='track'||t.state==='home'){
        const k=r+','+c, g=groups[k];
        if(g.length>1){
          const i=g.indexOf(t), n=g.length;
          const ang=(i/n)*Math.PI*2;
          or=r+Math.sin(ang)*0.22; oc=c+Math.cos(ang)*0.22;
        }
      }
      const size = (t.state==='track'||t.state==='home') ? 0.74 : 0.62;
      t.el.style.width=(1/15*100*size)+'%';
      t.el.style.height=(1/15*100*size)+'%';
      t.el.style.left=((oc+0.5)/15*100)+'%';
      t.el.style.top=((or+0.5)/15*100)+'%';
    }
  }

  /* ---------- turn flow ---------- */
  startTurn(){
    if(this.paused) return;
    this.sixStreak=0;
    this.awaitingMove=false;
    this.clearSelectable();
    this.updateUI();
    const p=this.curPlayer();
    setDiceMsg('');
    if(p.type==='ai'){
      this.busy=true; setRollEnabled(false);
      setTimeout(()=>this.doRoll(), 650);
    } else {
      this.busy=false; setRollEnabled(true);
    }
  }

  requestRoll(){ // from Roll button (human)
    if(this.busy||this.paused||this.awaitingMove) return;
    const p=this.curPlayer();
    if(p.type!=='human') return;
    this.doRoll();
  }

  async doRoll(){
    this.busy=true; setRollEnabled(false);
    const dice=document.getElementById('dice');
    dice.classList.remove('rolling'); void dice.offsetWidth; dice.classList.add('rolling');
    this.audio.dice();
    // quick visual spin
    let spins=8;
    await new Promise(res=>{
      const iv=setInterval(()=>{ renderDie(1+Math.floor(Math.random()*6)); if(--spins<=0){ clearInterval(iv); res(); } },55);
    });
    const v=this.dice.roll();
    renderDie(v);
    setDiceMsg('Rolled '+v);
    if(v===6) this.sixStreak++;
    await this.afterRoll(v);
  }

  async afterRoll(v){
    const p=this.curPlayer();
    if(v===6 && this.sixStreak===3){
      toast('Three 6s — turn forfeited!');
      this.audio.nomove();
      await wait(700);
      this.endTurn(false);
      return;
    }
    const moves=this.validMoves(p,v);
    if(moves.length===0){
      setDiceMsg(v===6?'6 — but no move':'No valid move');
      this.audio.nomove();
      await wait(750);
      // a 6 with no move still ends the turn
      this.endTurn(false);
      return;
    }
    if(p.type==='ai'){
      const tk=this.aiChoose(p,moves,v);
      await this.executeMove(tk,v);
    } else {
      if(moves.length===1){
        await wait(150);
        await this.executeMove(moves[0],v);
      } else {
        this.awaitingMove=true; this.busy=false;
        this.pendingValue=v; this.pendingMoves=moves;
        this.markSelectable(moves);
        setDiceMsg('Pick a token');
      }
    }
  }

  onTokenClick(token){
    if(!this.awaitingMove||this.paused) return;
    if(token.color!==this.curPlayer().color) return;
    if(!this.pendingMoves.includes(token)) return;
    this.awaitingMove=false; this.clearSelectable();
    this.executeMove(token,this.pendingValue);
  }

  /* ---------- move execution + animation ---------- */
  async executeMove(token, v){
    this.busy=true; setRollEnabled(false); this.clearSelectable();
    token.el.classList.add('movingz');

    if(token.state==='base'){
      token.state='track'; token.rel=0;
      this.renderTokens(); this.audio.step(); await wait(this.stepMs);
    } else {
      for(let i=0;i<v;i++){
        token.rel++;
        if(token.rel>TRACK_MAX_REL && token.rel<FINISH_REL) token.state='home';
        this.renderTokens(); this.audio.step(); await wait(this.stepMs);
      }
    }

    let extra=false;
    // finished?
    if(token.rel>=FINISH_REL){
      token.state='finished'; token.rel=FINISH_REL;
      this.curPlayer().finished++;
      this.renderTokens();
      this.audio.home(); toast('🏠 Token home!'); extra=true;
    } else {
      // capture check (only on main track & non-safe)
      const captured=this.checkCapture(token);
      if(captured){ extra=true; }
    }

    token.el.classList.remove('movingz');
    if(v===6) extra=true;

    // win check
    const p=this.curPlayer();
    if(p.done && !this.rankings.includes(p)){
      this.rankings.push(p);
      toast(`🎉 ${p.name} finished all tokens!`);
    }
    this.updateUI();

    if(this.checkGameOver()) return;

    await wait(250);
    if(extra && this.sixStreak<3){
      // same player rolls again
      this.awaitingMove=false;
      if(v===6) this.audio.extra(); else this.audio.extra();
      setDiceMsg(v===6?'Rolled 6 — roll again!':'Bonus roll!');
      if(p.type==='ai'){ this.busy=true; setTimeout(()=>this.doRoll(),600); }
      else { this.busy=false; setRollEnabled(true); }
    } else {
      this.endTurn(false);
    }
  }

  checkCapture(token){
    if(token.state!=='track'||token.rel>TRACK_MAX_REL) return false;
    const ai=absIndex(token.color,token.rel);
    if(SAFE_INDICES.has(ai)) return false;
    let captured=false;
    for(const p of this.players){
      if(p.color===token.color) continue;
      for(const t of p.tokens){
        if(t.state==='track' && t.rel<=TRACK_MAX_REL && absIndex(t.color,t.rel)===ai){
          // send home
          t.el.classList.add('captured');
          setTimeout(()=>t.el.classList.remove('captured'),400);
          t.state='base'; t.rel=-1;
          captured=true;
          if(p.type==='human') this.gotCaptured=true;
          if(this.curPlayer().type==='human') this.captures++;
        }
      }
    }
    if(captured){ this.renderTokens(); this.audio.capture(); toast('💥 Capture!'); }
    return captured;
  }

  endTurn(){
    this.busy=true; this.awaitingMove=false; this.clearSelectable();
    this.turns++;
    // advance to next active (not-done) player
    let guard=0;
    do{
      this.current=(this.current+1)%this.order.length;
      guard++;
    } while(this.curPlayer().done && guard<=this.order.length);
    this.startTurn();
  }

  checkGameOver(){
    const remaining=this.players.filter(p=>!p.done);
    if(remaining.length<=1){
      if(remaining.length===1 && !this.rankings.includes(remaining[0]))
        this.rankings.push(remaining[0]);
      this.audio.win();
      this.gameOver();
      return true;
    }
    return false;
  }

  gameOver(){
    this.busy=true;
    recordGameStats(this);
    showVictory(this.rankings, this);
  }

  /* ---------- valid moves ---------- */
  validMoves(player, v){
    const moves=[];
    for(const t of player.tokens){
      if(t.state==='finished') continue;
      if(t.state==='base'){ if(v===6) moves.push(t); }
      else { if(t.rel+v<=FINISH_REL) moves.push(t); }
    }
    return moves;
  }

  /* ---------- AI ---------- */
  aiChoose(player, moves, v){
    const diff=player.difficulty;
    if(diff==='easy') return moves[Math.floor(Math.random()*moves.length)];
    // score each move
    let best=null, bestScore=-1e9;
    for(const t of moves){
      const s=this.scoreMove(player,t,v,diff);
      if(s>bestScore){ bestScore=s; best=t; }
    }
    return best||moves[0];
  }
  scoreMove(player, token, v, diff){
    let s=0;
    // simulate target rel/state
    let newRel, willFinish=false, fromBase=false;
    if(token.state==='base'){ newRel=0; fromBase=true; }
    else { newRel=token.rel+v; if(newRel>=FINISH_REL) willFinish=true; }

    if(willFinish){ s+=120; }
    if(fromBase){ s+=55; }                       // get tokens out

    // capture potential
    if(!willFinish && newRel<=TRACK_MAX_REL){
      const ai=absIndex(token.color,newRel);
      if(!SAFE_INDICES.has(ai)){
        for(const p of this.players){
          if(p.color===player.color) continue;
          for(const t of p.tokens){
            if(t.state==='track'&&t.rel<=TRACK_MAX_REL&&absIndex(t.color,t.rel)===ai){
              s+=80 + t.rel; // capturing an advanced token is better
            }
          }
        }
      }
    }
    // progress
    if(!fromBase) s+=newRel*0.4;

    if(diff==='medium'){
      if(!willFinish && newRel<=TRACK_MAX_REL && SAFE_INDICES.has(absIndex(token.color,newRel))) s+=20;
      return s + Math.random()*3;
    }
    // hard: consider danger
    if(diff==='hard'){
      // landing on safe cell good
      if(!willFinish && (newRel>TRACK_MAX_REL || SAFE_INDICES.has(absIndex(token.color,newRel)))) s+=30;
      // landing in danger bad
      if(!willFinish && newRel<=TRACK_MAX_REL && this.isThreatened(token.color,newRel)) s-=45;
      // moving a currently-threatened token to safety good
      if(token.state!=='base' && token.rel<=TRACK_MAX_REL && this.isThreatened(token.color,token.rel)){
        if(willFinish || newRel>TRACK_MAX_REL || !this.isThreatened(token.color,newRel)) s+=35;
      }
      // prefer pushing leading token home in late game
      s+=newRel*0.2;
      return s + Math.random()*2;
    }
    return s + Math.random()*3;
  }
  isThreatened(color, rel){
    if(rel>TRACK_MAX_REL) return false;
    const ai=absIndex(color,rel);
    if(SAFE_INDICES.has(ai)) return false;
    for(const p of this.players){
      if(p.color===color) continue;
      for(const t of p.tokens){
        if(t.state==='track'&&t.rel<=TRACK_MAX_REL){
          const oa=absIndex(t.color,t.rel);
          const d=(ai-oa+52)%52;
          if(d>=1&&d<=6) return true;
        }
      }
    }
    return false;
  }

  /* ---------- selectable highlighting ---------- */
  markSelectable(moves){ for(const t of moves) t.el.classList.add('selectable'); }
  clearSelectable(){ this.boardEl.querySelectorAll('.token.selectable').forEach(e=>e.classList.remove('selectable')); }

  /* ---------- panels / UI ---------- */
  buildPanels(){
    const left=document.getElementById('panel-left');
    left.innerHTML='';
    this.panelCards={};
    for(const p of this.players){
      const card=document.createElement('div');
      card.className='pcard';
      card.innerHTML=`
        <div class="pcard-head">
          <span class="dot ${p.color}"></span>
          <span class="pcard-name">${escapeHtml(p.name)}</span>
          <span class="pcard-tag">${p.type==='ai'?('AI·'+p.difficulty):'Human'}</span>
        </div>
        <div class="mini-tokens">${[0,1,2,3].map(()=>`<span class="mini-tok ${p.color}"></span>`).join('')}</div>
        <div class="pcard-stats"><span class="home-count">Home 0/4</span><span class="prog">On board 0</span></div>`;
      left.appendChild(card);
      this.panelCards[p.color]=card;
    }
  }
  updateUI(){
    const p=this.curPlayer();
    const banner=document.getElementById('turn-banner');
    banner.textContent=`${p.name}'s turn`;
    banner.className='turn-banner t-'+p.color;
    for(const pl of this.players){
      const card=this.panelCards[pl.color];
      card.classList.toggle('active', pl===p && !pl.done);
      card.classList.toggle('done', pl.done);
      const onBoard=pl.tokens.filter(t=>t.state==='track'||t.state==='home').length;
      card.querySelector('.home-count').textContent=`Home ${pl.finished}/4`;
      card.querySelector('.prog').textContent=`On board ${onBoard}`;
      const minis=card.querySelectorAll('.mini-tok');
      pl.tokens.forEach((t,i)=>{ minis[i].classList.toggle('home', t.state==='finished'); });
    }
  }
}

/* ------------------------------------------------------------------
   small helpers
------------------------------------------------------------------ */
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

const DIE_PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function renderDie(v){
  const pips=document.querySelectorAll('#dice .pip');
  pips.forEach((p,i)=>{ p.style.opacity=DIE_PIPS[v].includes(i)?'1':'0'; });
}
function setDiceMsg(t){ document.getElementById('dice-msg').textContent=t; }
function setRollEnabled(on){ document.getElementById('btn-roll').disabled=!on; }
let toastTimer=null;
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),1600);
}
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ------------------------------------------------------------------
   STATS + ACHIEVEMENTS  (localStorage)
------------------------------------------------------------------ */
const STATS_KEY='ludo_stats_v1';
const ACH_KEY='ludo_ach_v1';
const ACHIEVEMENTS=[
  {id:'first_win', ico:'🥇', name:'First Victory', desc:'Win your first game.'},
  {id:'lucky_six', ico:'🎲', name:'Lucky Six', desc:'Roll three 6s in one game.'},
  {id:'capture_master', ico:'💥', name:'Capture Master', desc:'Capture 3+ tokens in a game.'},
  {id:'untouchable', ico:'🛡️', name:'Untouchable', desc:'Win without losing a token.'},
  {id:'grand_champion', ico:'👑', name:'Grand Champion', desc:'Win 10 games.'}
];
function loadStats(){
  try{ return JSON.parse(localStorage.getItem(STATS_KEY))||{}; }catch(e){ return {}; }
}
function saveStats(s){ try{ localStorage.setItem(STATS_KEY,JSON.stringify(s)); }catch(e){} }
function loadAch(){ try{ return JSON.parse(localStorage.getItem(ACH_KEY))||{}; }catch(e){ return {}; } }
function saveAch(a){ try{ localStorage.setItem(ACH_KEY,JSON.stringify(a)); }catch(e){} }

function recordGameStats(game){
  const s=loadStats();
  s.games=(s.games||0)+1;
  s.totalTurns=(s.totalTurns||0)+game.turns;
  const humanWon = game.rankings.length && game.rankings[0].type==='human';
  if(humanWon){
    s.wins=(s.wins||0)+1;
    if(!s.fastestWin || game.turns<s.fastestWin) s.fastestWin=game.turns;
  }
  saveStats(s);
  // achievements
  const a=loadAch();
  const newly=[];
  function unlock(id){ if(!a[id]){ a[id]=Date.now(); newly.push(id);} }
  if(humanWon) unlock('first_win');
  if(game.maxSixStreakSeen>=3) unlock('lucky_six');
  if(game.captures>=3) unlock('capture_master');
  if(humanWon && !game.gotCaptured) unlock('untouchable');
  if((s.wins||0)>=10) unlock('grand_champion');
  saveAch(a);
  if(newly.length){
    const names=newly.map(id=>ACHIEVEMENTS.find(x=>x.id===id).name).join(', ');
    setTimeout(()=>toast('🏅 Achievement: '+names),1800);
  }
}

function renderStatsModal(){
  const s=loadStats(), a=loadAch();
  const winRate=s.games?Math.round((s.wins||0)/s.games*100):0;
  const avgTurns=s.games?Math.round((s.totalTurns||0)/s.games):0;
  document.getElementById('stats-body').innerHTML=`
    <div class="stat-tile"><b>${s.games||0}</b><span>Games</span></div>
    <div class="stat-tile"><b>${s.wins||0}</b><span>Wins</span></div>
    <div class="stat-tile"><b>${winRate}%</b><span>Win rate</span></div>
    <div class="stat-tile"><b>${avgTurns}</b><span>Avg turns</span></div>
    <div class="stat-tile"><b>${s.fastestWin||'—'}</b><span>Fastest win (turns)</span></div>`;
  document.getElementById('achievements-body').innerHTML=ACHIEVEMENTS.map(ac=>`
    <div class="ach ${a[ac.id]?'':'locked'}">
      <span class="ico">${ac.ico}</span>
      <div><b>${ac.name}</b><small>${ac.desc}</small></div>
    </div>`).join('');
}

/* ------------------------------------------------------------------
   VICTORY SCREEN
------------------------------------------------------------------ */
function showVictory(rankings, game){
  const medals=['🥇','🥈','🥉','4️⃣'];
  const title=document.getElementById('victory-title');
  title.textContent = rankings.length ? `🏆 ${rankings[0].name} wins!` : 'Game Over';
  document.getElementById('rankings').innerHTML=rankings.map((p,i)=>`
    <div class="rank-row">
      <span class="rank-pos">${medals[i]||(i+1)}</span>
      <span class="dot ${p.color}"></span>
      <span class="rank-name">${escapeHtml(p.name)}</span>
      <span>${p.type==='ai'?'AI':'Human'}</span>
    </div>`).join('');
  launchConfetti();
  showScreen('screen-victory');
}
function launchConfetti(){
  const box=document.getElementById('confetti'); box.innerHTML='';
  const cols=['#e7382f','#1f9d4b','#f2c014','#1f6fe7','#ffd34e'];
  for(let i=0;i<70;i++){
    const c=document.createElement('i');
    c.style.left=Math.random()*100+'%';
    c.style.background=cols[i%cols.length];
    c.style.animationDuration=(1.6+Math.random()*1.8)+'s';
    c.style.animationDelay=(Math.random()*0.6)+'s';
    c.style.transform=`rotate(${Math.random()*360}deg)`;
    box.appendChild(c);
  }
  setTimeout(()=>box.innerHTML='',4000);
}

/* ------------------------------------------------------------------
   BOOTSTRAP / WIRING
------------------------------------------------------------------ */
let game=new Game();
// track max six streak across a game for achievement
const _origAfterRoll=Game.prototype.afterRoll;
Game.prototype.afterRoll=function(v){
  this.maxSixStreakSeen=Math.max(this.maxSixStreakSeen||0,this.sixStreak);
  return _origAfterRoll.call(this,v);
};

function gatherConfig(){
  const rows=document.querySelectorAll('#player-config .config-row');
  const cfg=[];
  rows.forEach(row=>{
    const color=row.dataset.color;
    const type=row.querySelector('.ptype').value;
    if(type==='off') return;
    const name=(row.querySelector('.pname').value||color).trim()||color;
    if(type==='human') cfg.push({color,name,type:'human',difficulty:null});
    else cfg.push({color,name,type:'ai',difficulty:type.split('-')[1]});
  });
  return cfg;
}

function applyPreset(preset){
  const rows={}; document.querySelectorAll('#player-config .config-row').forEach(r=>rows[r.dataset.color]=r);
  const set=(c,type,name)=>{ rows[c].querySelector('.ptype').value=type; rows[c].querySelector('.pname').value=name; };
  if(preset==='single'){
    set('red','human','You'); set('green','ai-medium','Green Bot');
    set('yellow','ai-medium','Yellow Bot'); set('blue','ai-hard','Blue Bot');
  } else if(preset==='local'){
    set('red','human','Player 1'); set('green','human','Player 2');
    set('yellow','off','Yellow'); set('blue','off','Blue');
  } else { // custom — leave as-is, default red human + others medium
    set('red','human','Red'); set('green','ai-medium','Green');
    set('yellow','ai-medium','Yellow'); set('blue','ai-medium','Blue');
  }
  document.querySelectorAll('.preset-btn').forEach(b=>b.classList.toggle('sel',b.dataset.preset===preset));
}

function startGame(){
  const cfg=gatherConfig();
  if(cfg.length<2){ toast('Need at least 2 players'); return; }
  // ensure red present or reorder so turn order follows board (red,green,yellow,blue)
  game.maxSixStreakSeen=0;
  showScreen('screen-game');
  // resume audio on user gesture
  game.audio._ensure();
  game.setup(cfg);
}

/* ----- settings persistence ----- */
function loadSettings(){
  let st={}; try{ st=JSON.parse(localStorage.getItem('ludo_settings'))||{}; }catch(e){}
  const theme=st.theme||'classic';
  document.body.dataset.theme=theme;
  document.getElementById('theme-select').value=theme;
  game.audio.enabled = st.sound!==false;
  game.audio.volume = (st.volume!=null?st.volume:60)/100;
  game.stepMs = st.speed||150;
  document.getElementById('sound-toggle').checked=game.audio.enabled;
  document.getElementById('volume-range').value=(st.volume!=null?st.volume:60);
  document.getElementById('speed-select').value=String(game.stepMs);
  updateSoundIcon();
}
function saveSettings(){
  const st={
    theme:document.getElementById('theme-select').value,
    sound:document.getElementById('sound-toggle').checked,
    volume:+document.getElementById('volume-range').value,
    speed:+document.getElementById('speed-select').value
  };
  try{ localStorage.setItem('ludo_settings',JSON.stringify(st)); }catch(e){}
}
function updateSoundIcon(){ document.getElementById('btn-sound').textContent=game.audio.enabled?'🔊':'🔇'; }

/* ----- modal helpers ----- */
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

/* ----- event wiring ----- */
document.addEventListener('DOMContentLoaded',()=>{
  loadSettings();

  document.querySelectorAll('.preset-btn').forEach(b=>
    b.addEventListener('click',()=>applyPreset(b.dataset.preset)));

  document.getElementById('start-game').addEventListener('click',startGame);
  document.getElementById('btn-roll').addEventListener('click',()=>game.requestRoll());

  // settings
  document.getElementById('open-settings').addEventListener('click',()=>openModal('modal-settings'));
  document.getElementById('open-stats').addEventListener('click',()=>{ renderStatsModal(); openModal('modal-stats'); });
  document.getElementById('reset-stats').addEventListener('click',()=>{
    if(confirm('Reset all statistics and achievements?')){ saveStats({}); saveAch({}); renderStatsModal(); }
  });
  document.querySelectorAll('[data-close-modal]').forEach(b=>
    b.addEventListener('click',e=>e.target.closest('.modal').classList.remove('open')));
  document.querySelectorAll('.modal').forEach(m=>
    m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); }));

  document.getElementById('theme-select').addEventListener('change',e=>{ document.body.dataset.theme=e.target.value; saveSettings(); });
  document.getElementById('sound-toggle').addEventListener('change',e=>{ game.audio.enabled=e.target.checked; updateSoundIcon(); saveSettings(); });
  document.getElementById('volume-range').addEventListener('input',e=>{ game.audio.volume=+e.target.value/100; saveSettings(); });
  document.getElementById('speed-select').addEventListener('change',e=>{ game.stepMs=+e.target.value; saveSettings(); });

  // top bar
  document.getElementById('btn-sound').addEventListener('click',()=>{
    game.audio.enabled=!game.audio.enabled;
    document.getElementById('sound-toggle').checked=game.audio.enabled;
    updateSoundIcon(); saveSettings();
  });
  document.getElementById('btn-menu').addEventListener('click',()=>{ if(confirm('Return to main menu? Current game will be lost.')){ showScreen('screen-menu'); }});
  document.getElementById('btn-restart').addEventListener('click',()=>{ if(confirm('Restart this game?')) restartGame(); });
  document.getElementById('btn-pause').addEventListener('click',()=>{ game.paused=true; openModal('modal-pause'); });

  // pause modal
  document.getElementById('resume-game').addEventListener('click',()=>{
    closeModal('modal-pause'); game.paused=false;
    // re-trigger AI turn if needed
    const p=game.curPlayer();
    if(p && p.type==='ai' && !game.busy && !game.awaitingMove) game.startTurn();
    else if(p && p.type==='human' && !game.awaitingMove) setRollEnabled(true);
  });
  document.getElementById('pause-restart').addEventListener('click',()=>{ closeModal('modal-pause'); game.paused=false; restartGame(); });
  document.getElementById('pause-menu').addEventListener('click',()=>{ closeModal('modal-pause'); game.paused=false; showScreen('screen-menu'); });

  // victory screen
  document.getElementById('play-again').addEventListener('click',()=>{ showScreen('screen-game'); restartGame(); });
  document.getElementById('back-to-menu').addEventListener('click',()=>showScreen('screen-menu'));

  // prevent scroll/zoom gestures on the board
  const board=document.getElementById('board');
  board.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});

  applyPreset('single');
});

let lastConfig=null;
function restartGame(){
  game.maxSixStreakSeen=0;
  game.audio._ensure();
  if(game.players.length>=2){
    const cfg=game.players.map(p=>({color:p.color,name:p.name,type:p.type,difficulty:p.difficulty}));
    game.setup(cfg);
  } else {
    startGame();
  }
}
