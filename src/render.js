'use strict';
import { S, cZoom, keeperZoom, getActiveBuildFloor } from './state.js';
import { getReckoningState, isReckoningActive, getReckoningBriefing, RK_FLOOR_MIN, RK_FLOOR_MAX, getColorPickState, getColorWheelPos, checkColorWheel, RK_COLORS, getIntroBlackout, getBlockFlash, getScorePulse, getSuitClaimProgress } from './reckoning.js';
import { drawKeeper, drawKeeperDesk, drawKeeperGlow, drawKeeperOverlay } from './keeper.js';
import { TW, FH, FT, NF, TL, TR, TB, TT, PG, BPF, UW, ROOF_Y, MOB, PH, CHG_MX, DROP_MX, lerpColor, isWinBlock, isElevBlock, ELEV_X, RK_ACTIVE_T } from './constants.js';
import { FTHEME, FD, STAGES } from './floors.js';
import { updateAmbient } from './sound.js';
import { drawControlRoom, drawCRDetailPanel, crClick, crMouseDown, crMouseMove, crMouseUp } from './control-room.js';

let C,X;
const msgEl=()=>document.getElementById('msg');
const spEl=()=>document.getElementById('sp');

// ── Cached gradients (recomputed only when altitude band changes) ──
let _cachedSkyGrad=null,_cachedSkyAlt=-1;
let _cachedGroundGrad=null,_cachedHazeGrad=null,_gradsCached=false;
// ── Frame timestamp (set once per draw(), used by all animation code) ──
let _now=0;
let _cityCache=null,_treeCache=null;
// ── Pre-computed per-block brightness variation (deterministic, zero per-frame cost) ──
const _blockTint=[];
for(let i=0;i<NF*BPF;i++)_blockTint[i]=Math.sin(i*7.3)*0.03;

export function initCanvas(){
  C=document.getElementById('gameCanvas');
  X=C.getContext('2d');
  // roundRect polyfill
  if(!CanvasRenderingContext2D.prototype.roundRect){CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){if(typeof r==='number')r={tl:r,tr:r,br:r,bl:r};this.beginPath();this.moveTo(x+r.tl,y);this.lineTo(x+w-r.tr,y);this.quadraticCurveTo(x+w,y,x+w,y+r.tr);this.lineTo(x+w,y+h-r.br);this.quadraticCurveTo(x+w,y+h,x+w-r.br,y+h);this.lineTo(x+r.bl,y+h);this.quadraticCurveTo(x,y+h,x,y+h-r.bl);this.lineTo(x,y+r.tl);this.quadraticCurveTo(x,y,x+r.tl,y);this.closePath();return this}}
  function resize(){
    const panel=document.getElementById('build-panel');
    const ph=panel?panel.offsetHeight:Math.ceil(innerHeight*PH);
    C.width=innerWidth;C.height=innerHeight-ph;
    document.documentElement.style.setProperty('--ph',ph+'px');
  }
  addEventListener('resize',resize);resize();
  genCity();
  _buildCityCache();
  _buildTreeCache();

  // Control room click + drag handlers
  C.addEventListener('click',e=>{
    if(!S.cr.active)return;
    const rect=C.getBoundingClientRect();
    const mx=(e.clientX-rect.left)*(C.width/rect.width);
    const my=(e.clientY-rect.top)*(C.height/rect.height);
    crClick(mx,my);
  });
  C.addEventListener('mousedown',e=>{
    if(!S.cr.active)return;
    const rect=C.getBoundingClientRect();
    crMouseDown((e.clientX-rect.left)*(C.width/rect.width),(e.clientY-rect.top)*(C.height/rect.height));
  });
  C.addEventListener('mousemove',e=>{
    if(!S.cr.active)return;
    const rect=C.getBoundingClientRect();
    crMouseMove((e.clientX-rect.left)*(C.width/rect.width),(e.clientY-rect.top)*(C.height/rect.height));
  });
  C.addEventListener('mouseup',()=>{crMouseUp()});
  C.addEventListener('mouseleave',()=>{crMouseUp()});
}

// ═══ MESSAGING ═══
export function showMsg(l,t){const el=msgEl();el.querySelector('.ml').textContent=l;el.querySelector('.mt2').textContent=t;el.style.opacity='1';if(S.msgTmr)clearTimeout(S.msgTmr);S.msgTmr=setTimeout(()=>{el.style.opacity='0'},3500)}
export function floatText(t,c){const el=document.createElement('div');el.className='float-txt';el.textContent=t;el.style.color=c;el.style.left=MOB?'50%':'85px';el.style.bottom='calc(var(--ph) + 40px)';el.style.opacity='1';document.body.appendChild(el);requestAnimationFrame(()=>{el.style.bottom='calc(var(--ph) + 80px)';el.style.opacity='0'});setTimeout(()=>el.remove(),1600)}

// ═══ INTERACTIONS ═══
export function getInter(){const p=S.player;
  // Elevator — accessible on all floors
  if(p.cf>=0&&Math.abs(p.x-ELEV_X)<80)return{t:'elev',v:{floor:p.cf}};
  // Build interaction — only on active build floor
  const abf=getActiveBuildFloor();
  if(abf>=0&&p.cf===abf){
    const stg=S.buildout[abf].stage;
    if(stg<5){const sd=STAGES[abf][stg];if(Math.abs(p.x-sd.x)<90)return{t:'build',v:{floor:abf,stage:stg,def:sd}}}
  }
  // Objects — only at stage >= 4
  for(let o of S.objs){if(S.buildout[o.floor].stage<4)continue;if(Math.abs(p.y-o.y)<20&&Math.abs(p.x-o.x)<50)return{t:'obj',v:o}}
  // NPCs — only at stage >= 5, and only once tower has 3+ floors built
  const _abf=getActiveBuildFloor(),_npcsOn=_abf>=3||_abf===-1;
  if(_npcsOn){for(let n of S.npcs){if(S.buildout[n.floor].stage<5)continue;if(Math.abs(p.x-n.x)<40&&Math.abs(p.y-n.y)<30)return{t:'npc',v:n}}}
  for(let w of S.workers){if(Math.abs(p.x-w.x)<40&&Math.abs(p.y-w.y)<30)return{t:'npc',v:w}}
  // Stairs — only between floors with stage >= 2
  if(p.st!=='climb'){for(let st of S.stairs){if(S.buildout[st.ff].stage<2||S.buildout[st.tf].stage<2)continue;if(Math.abs(p.y-st.by)<12&&Math.abs(p.x-st.bx)<35)return{t:'up',v:st};if(Math.abs(p.y-st.ty)<12&&Math.abs(p.x-st.tx)<35)return{t:'dn',v:st}}}return null}
export function nearSuit(){const p=S.player;for(let s of S.suits){if(!s.taken&&S.buildout[s.floor].stage>=5&&Math.abs(p.y-s.y)<20&&Math.abs(p.x-s.x)<40)return s}return null}

// ═══ DRAW: CHARACTERS (FLAT) ═══
function drawBlob(c,isP,oneEye){
  const bob=Math.abs(Math.sin(c.bob))*4,mov=c.st==='walk'||c.st==='climb';
  X.save();X.translate(c.x,c.y-c.h/2-8-bob);if(!c.fr)X.scale(-1,1);
  // Antenna (aliens only, not player)
  if(oneEye&&!isP){X.strokeStyle=c.color;X.lineWidth=2;X.beginPath();X.moveTo(0,-c.h/2);X.lineTo(-3,-c.h/2-10);X.stroke();X.fillStyle=c.color;X.beginPath();X.arc(-3,-c.h/2-12,3,0,Math.PI*2);X.fill()}
  X.fillStyle=c.color;X.beginPath();X.roundRect(-c.w/2,-c.h/2,c.w,c.h,10);X.fill();
  if(oneEye){X.fillStyle='white';X.beginPath();X.arc(4,-10,6,0,Math.PI*2);X.fill();X.fillStyle='black';X.beginPath();X.arc(6,-10,2.5,0,Math.PI*2);X.fill();X.fillStyle='white';X.beginPath();X.arc(7,-12,1,0,Math.PI*2);X.fill()}
  else{X.fillStyle='white';X.beginPath();X.arc(0,-10,4.5,0,Math.PI*2);X.fill();X.beginPath();X.arc(8,-10,4.5,0,Math.PI*2);X.fill();X.fillStyle='black';X.beginPath();X.arc(2,-10,2,0,Math.PI*2);X.fill();X.beginPath();X.arc(10,-10,2,0,Math.PI*2);X.fill()}
  if(isP&&c.alien&&!c.suit){X.fillStyle='#333';X.beginPath();X.roundRect(-c.w/2-7,-5,8,20,3);X.fill()}
  X.strokeStyle='#222';X.lineWidth=4;X.lineCap='round';
  X.beginPath();X.moveTo(-4,c.h/2-2);X.lineTo(-4+(mov?Math.sin(c.bob)*10:0),c.h/2+8+bob);X.stroke();
  X.beginPath();X.moveTo(4,c.h/2-2);X.lineTo(4-(mov?Math.sin(c.bob)*10:0),c.h/2+8+bob);X.stroke();
  X.restore();
}
function drawBiz(n){
  const pl=n.pal,x=n.x,y=n.y,f=n.fr?1:-1,lp=n.lp||0,mv=n.st==='walk';
  X.save();X.translate(x,y);X.fillStyle='rgba(0,0,0,0.1)';X.beginPath();X.ellipse(0,0,10,3,0,0,Math.PI*2);X.fill();
  X.translate(0,-7);
  const ls=mv?Math.sin(lp)*8:0,as=-ls*0.6;
  X.fillStyle=pl.sh;X.save();X.translate(-3,-6);X.rotate(ls*0.1);X.fillRect(-2.5,-1,5,14);X.restore();
  X.save();X.translate(3,-6);X.rotate(-ls*0.1);X.fillRect(-2.5,-1,5,14);X.restore();
  X.fillStyle=pl.cl;X.fillRect(-6,-24,12,18);
  X.fillStyle=pl.cl;X.save();X.translate(-8,-22);X.rotate(as*0.08);X.fillRect(-2,-1,4,12);X.fillStyle=pl.h;X.beginPath();X.arc(0,12,2.5,0,Math.PI*2);X.fill();X.restore();
  X.save();X.translate(8,-22);X.rotate(-as*0.08);X.fillStyle=pl.cl;X.fillRect(-2,-1,4,12);X.fillStyle=pl.h;X.beginPath();X.arc(0,12,2.5,0,Math.PI*2);X.fill();X.restore();
  X.fillStyle=pl.h;X.beginPath();X.ellipse(0,-28,5.5,6.5,0,0,Math.PI*2);X.fill();
  X.fillStyle=pl.b;X.beginPath();X.ellipse(0,-31.5,5.5,3.5,0,0,Math.PI*2);X.fill();
  X.fillStyle='#1a1a2a';X.beginPath();X.arc(f>0?2:-2,-28,1,0,Math.PI*2);X.fill();X.beginPath();X.arc(f>0?5:-5,-28,1,0,Math.PI*2);X.fill();
  X.restore();
}

// ═══ DRAW: CASUAL HUMAN ═══
function drawCasual(n){
  const x=n.x,y=n.y,f=n.fr?1:-1,mv=n.st==='walk';
  const bob=Math.abs(Math.sin(n.bob))*3;
  const lp=n.bob*1.2,ls=mv?Math.sin(lp)*7:0;
  const a=n.app;
  X.save();X.translate(x,y);
  X.fillStyle='rgba(0,0,0,0.08)';X.beginPath();X.ellipse(0,0,9,2.5,0,0,Math.PI*2);X.fill();
  X.translate(0,-7-bob);
  // Legs
  X.fillStyle=a.bot;
  X.save();X.translate(-3,-5);X.rotate(ls*0.09);X.fillRect(-2.5,0,5,14);X.restore();
  X.save();X.translate(3,-5);X.rotate(-ls*0.09);X.fillRect(-2.5,0,5,14);X.restore();
  // Shoes
  X.fillStyle=a.sho;
  const sy1=mv?Math.sin(lp)*3:0,sy2=mv?-Math.sin(lp)*3:0;
  X.fillRect(-6,8+sy1,5,3);X.fillRect(1,8+sy2,5,3);
  // Torso
  X.fillStyle=a.top;
  const tw2=a.fem?12:14;
  X.fillRect(-tw2/2,-24,tw2,19);
  X.strokeStyle=a.fem?'rgba(0,0,0,0.15)':'rgba(0,0,0,0.1)';X.lineWidth=1;
  X.beginPath();X.moveTo(-3,-24);X.lineTo(0,-21);X.lineTo(3,-24);X.stroke();
  // Arms
  const as2=-ls*0.5;
  X.save();X.translate(-tw2/2-2,-22);X.rotate(as2*0.07);
  X.fillStyle=a.top;X.fillRect(-2,0,4,11);
  X.fillStyle=a.skin;X.beginPath();X.arc(0,12,2.5,0,Math.PI*2);X.fill();X.restore();
  X.save();X.translate(tw2/2+2,-22);X.rotate(-as2*0.07);
  X.fillStyle=a.top;X.fillRect(-2,0,4,11);
  X.fillStyle=a.skin;X.beginPath();X.arc(0,12,2.5,0,Math.PI*2);X.fill();X.restore();
  // Neck + head
  X.fillStyle=a.skin;X.fillRect(-2,-27,4,4);
  X.fillStyle=a.skin;X.beginPath();X.ellipse(0,-30,5.5,6,0,0,Math.PI*2);X.fill();
  // Hair
  X.fillStyle=a.hair;
  if(a.hs==='short'){X.beginPath();X.ellipse(0,-34,6,3,0,0,Math.PI);X.fill();X.fillRect(-6,-35,12,3)}
  else if(a.hs==='buzz'){X.beginPath();X.ellipse(0,-34.5,5.5,2,0,0,Math.PI);X.fill()}
  else if(a.hs==='messy'){X.beginPath();X.ellipse(0,-34,6.5,3.5,0,0,Math.PI);X.fill();X.fillRect(-7,-36,3,3);X.fillRect(2,-37,3,2);X.fillRect(5,-36,3,3)}
  else if(a.hs==='long'){X.beginPath();X.ellipse(0,-34,6.5,3.5,0,0,Math.PI);X.fill();X.fillRect(-6.5,-34,13,3);X.fillRect(-7,-32,3,10);X.fillRect(4,-32,3,10)}
  else if(a.hs==='ponytail'){X.beginPath();X.ellipse(0,-34,6,3,0,0,Math.PI);X.fill();X.fillRect(-6,-35,12,3);
    X.beginPath();X.moveTo(f>0?-5:5,-33);X.quadraticCurveTo(f>0?-10:10,-30,f>0?-8:8,-24);X.lineTo(f>0?-6:6,-24);X.quadraticCurveTo(f>0?-8:8,-30,f>0?-4:4,-33);X.fill()}
  else if(a.hs==='bun'){X.beginPath();X.ellipse(0,-34,6,3,0,0,Math.PI);X.fill();X.fillRect(-6,-35,12,3);X.beginPath();X.arc(0,-38,3.5,0,Math.PI*2);X.fill()}
  else if(a.hs==='bob'){X.beginPath();X.ellipse(0,-34,6.5,3.5,0,0,Math.PI);X.fill();X.fillRect(-6.5,-34,13,3);X.fillRect(-7,-32,3,6);X.fillRect(4,-32,3,6)}
  // Eyes
  X.fillStyle='#1a1a2a';
  X.beginPath();X.arc(f>0?2:-2,-30,1,0,Math.PI*2);X.fill();
  X.beginPath();X.arc(f>0?5:-5,-30,1,0,Math.PI*2);X.fill();
  X.restore();
}

// ═══ DRAW: CONSTRUCTION WORKER ═══
function drawWorker(w){
  const bob=Math.abs(Math.sin(w.bob))*3,mv=w.st==='walk';
  X.save();X.translate(w.x,w.y-26-bob);if(!w.fr)X.scale(-1,1);
  X.fillStyle='#3a5070';X.fillRect(-5,12,4,12);X.fillRect(2,12,4,12);
  X.fillStyle='#5a4030';X.fillRect(-6,22,6,4);X.fillRect(1,22,6,4);
  X.fillStyle='#606060';X.fillRect(-7,-2,14,16);
  X.fillStyle='#FF6600';X.fillRect(-7,-2,14,14);
  X.fillStyle='rgba(255,255,0,0.6)';X.fillRect(-7,4,14,2);
  X.fillRect(-7,8,14,2);
  X.fillStyle='#FF6600';
  if(mv){X.fillRect(-10,-1+Math.sin(w.bob)*4,4,10);X.fillRect(7,-1-Math.sin(w.bob)*4,4,10)}
  else{X.fillRect(-10,0,4,10);X.fillRect(7,0,4,10)}
  X.fillStyle='#d4a878';X.beginPath();X.arc(-8,mv?10+Math.sin(w.bob)*4:10,2.5,0,Math.PI*2);X.fill();
  X.beginPath();X.arc(9,mv?10-Math.sin(w.bob)*4:10,2.5,0,Math.PI*2);X.fill();
  X.fillStyle='#d4a878';X.beginPath();X.ellipse(0,-8,6,7,0,0,Math.PI*2);X.fill();
  X.fillStyle='#FFD700';X.beginPath();X.ellipse(0,-16,8,4,0,0,Math.PI*2);X.fill();
  X.fillRect(-7,-16,14,5);
  X.fillStyle='#E8C020';X.fillRect(-8,-12,16,2);
  X.fillStyle='#1a1a2a';X.beginPath();X.arc(w.fr?2:-2,-8,1.2,0,Math.PI*2);X.fill();X.beginPath();X.arc(w.fr?5:-5,-8,1.2,0,Math.PI*2);X.fill();
  X.restore();
}
// ═══ DRAW: PLAYER (1.25x construction worker, yellow hat, neon green vest) ═══
function drawPlayerWorker(p){
  const bob=Math.abs(Math.sin(p.bob))*3,mv=p.st==='walk'||p.st==='climb';
  X.save();X.translate(p.x,p.y);X.scale(1.25,1.25);X.translate(0,-26-bob);if(!p.fr)X.scale(-1,1);
  if(p.wallSlide){X.translate(0,5);X.rotate(p.wallDir*0.15);X.translate(0,-5)}
  else if(p.flipCommitted&&p.st==='jump'){const ft=(p.flipInitVel-p.vy)/(2*p.flipInitVel),fc=Math.max(0,Math.min(1,ft)),fe=fc<0.5?4*fc*fc*fc:1-Math.pow(-2*fc+2,3)/2;X.translate(0,5);X.rotate(fe*Math.PI*2);X.translate(0,-5)}
  X.fillStyle='#3a5070';X.fillRect(-5,12,4,12);X.fillRect(2,12,4,12);
  X.fillStyle='#5a4030';X.fillRect(-6,22,6,4);X.fillRect(1,22,6,4);
  X.fillStyle='#606060';X.fillRect(-7,-2,14,16);
  X.fillStyle='#CCFF00';X.fillRect(-7,-2,14,14);
  X.fillStyle='rgba(255,255,255,0.5)';X.fillRect(-7,4,14,2);X.fillRect(-7,8,14,2);
  X.fillStyle='#CCFF00';
  if(mv){X.fillRect(-10,-1+Math.sin(p.bob)*4,4,10);X.fillRect(7,-1-Math.sin(p.bob)*4,4,10)}
  else{X.fillRect(-10,0,4,10);X.fillRect(7,0,4,10)}
  X.fillStyle='#d4a878';X.beginPath();X.arc(-8,mv?10+Math.sin(p.bob)*4:10,2.5,0,Math.PI*2);X.fill();
  X.beginPath();X.arc(9,mv?10-Math.sin(p.bob)*4:10,2.5,0,Math.PI*2);X.fill();
  X.fillStyle='#d4a878';X.beginPath();X.ellipse(0,-8,6,7,0,0,Math.PI*2);X.fill();
  X.fillStyle='#FFD700';X.beginPath();X.ellipse(0,-16,8,4,0,0,Math.PI*2);X.fill();
  X.fillRect(-7,-16,14,5);
  X.fillStyle='#E8C020';X.fillRect(-8,-12,16,2);
  X.restore();
}
function drawCrane(cx,cy,angle){
  // Static: base + mast + cab
  X.fillStyle='#8a8580';X.fillRect(cx-16,cy-20,32,20);X.fillStyle='#9a9590';X.fillRect(cx-14,cy-18,28,4);
  const mh=180;X.fillStyle='#e8a020';X.fillRect(cx-4,cy-20-mh,8,mh);
  X.strokeStyle='#c08010';X.lineWidth=1.5;for(let my=0;my<mh;my+=18){const yy=cy-20-my;X.beginPath();X.moveTo(cx-4,yy);X.lineTo(cx+4,yy-18);X.stroke();X.beginPath();X.moveTo(cx+4,yy);X.lineTo(cx-4,yy-18);X.stroke()}
  const topY=cy-20-mh;
  // Static cab (sits at top of mast, doesn't rotate)
  X.fillStyle='#506880';X.fillRect(cx-8,topY+6,16,14);X.fillStyle='rgba(140,200,230,0.5)';X.fillRect(cx-6,topY+8,12,6);
  // Rotating: boom jib, counter-jib, counterweight, hook, rigging, hoist top
  const a=angle||0;
  X.save();X.translate(cx,topY);X.rotate(a);
  const jL=160;
  X.fillStyle='#e8a020';X.fillRect(-20,0,jL,6);X.fillRect(-60,0,44,6);
  X.fillStyle='#606060';X.fillRect(-58,6,18,14);
  const hx=jL-44;X.strokeStyle='#404040';X.lineWidth=1;X.beginPath();X.moveTo(hx,6);X.lineTo(hx,70);X.stroke();
  X.fillStyle='#505050';X.beginPath();X.arc(hx,72,4,0,Math.PI*2);X.fill();X.strokeStyle='#505050';X.lineWidth=2;X.beginPath();X.arc(hx,78,5,0.5,Math.PI-0.5);X.stroke();
  X.strokeStyle='#404040';X.lineWidth=1;X.beginPath();X.moveTo(0,-12);X.lineTo(hx+4,0);X.stroke();X.beginPath();X.moveTo(0,-12);X.lineTo(-56,0);X.stroke();
  X.fillStyle='#e8a020';X.fillRect(-3,-16,6,16);X.fillStyle='#ff3030';X.beginPath();X.arc(0,-18,3,0,Math.PI*2);X.fill();
  X.restore();
}

// ═══ WALL BLOCK TEXTURE (per-block detail by stage) ═══
function drawWallBlock(bx,fy,stage,th,bi,fi){
  const h=FH,tIdx=fi*BPF+bi,tint=_blockTint[tIdx];
  if(stage===0){
    // Raw shell — faint concrete + formwork lines
    X.fillStyle='rgba(120,115,105,0.04)';X.fillRect(bx,fy-h,PG,h);
    X.strokeStyle='rgba(100,95,85,0.06)';X.lineWidth=1;
    X.beginPath();for(let ly=fy-h+40;ly<fy;ly+=40){X.moveTo(bx,ly);X.lineTo(bx+PG,ly)}X.stroke();
  } else if(stage===1){
    // Powered — dark fill + red tint + formwork seams + vertical crack
    X.fillStyle=th.dark;X.fillRect(bx,fy-h,PG,h);
    X.fillStyle='rgba(255,40,20,0.03)';X.fillRect(bx,fy-h,PG,h);
    // Per-block brightness variation
    if(tint>0){X.fillStyle=`rgba(255,255,255,${tint})`;X.fillRect(bx,fy-h,PG,h)}
    else{X.fillStyle=`rgba(0,0,0,${-tint})`;X.fillRect(bx,fy-h,PG,h)}
    // Horizontal formwork seams
    X.strokeStyle='rgba(0,0,0,0.06)';X.lineWidth=1;
    X.beginPath();for(let ly=fy-h+40;ly<fy;ly+=40){X.moveTo(bx,ly);X.lineTo(bx+PG,ly)}X.stroke();
    // Vertical crack at block edge
    X.strokeStyle='rgba(0,0,0,0.05)';X.beginPath();X.moveTo(bx,fy-h);X.lineTo(bx,fy);X.stroke();
  } else if(stage===2){
    // Structure — wall fill + panel seams + baseboard
    X.fillStyle=th.wall;X.fillRect(bx,fy-h,PG,h);
    X.fillStyle=th.accent;X.fillRect(bx,fy-h,PG,h);
    // Per-block brightness variation
    if(tint>0){X.fillStyle=`rgba(255,255,255,${tint})`;X.fillRect(bx,fy-h,PG,h)}
    else{X.fillStyle=`rgba(0,0,0,${-tint})`;X.fillRect(bx,fy-h,PG,h)}
    // Horizontal panel seams
    X.strokeStyle='rgba(0,0,0,0.04)';X.lineWidth=1;
    X.beginPath();for(let ly=fy-h+40;ly<fy;ly+=40){X.moveTo(bx,ly);X.lineTo(bx+PG,ly)}X.stroke();
    // Baseboard
    X.fillStyle='rgba(0,0,0,0.06)';X.fillRect(bx,fy-8,PG,8);
    // Faint vertical seam at block boundary
    X.strokeStyle='rgba(0,0,0,0.03)';X.beginPath();X.moveTo(bx,fy-h);X.lineTo(bx,fy);X.stroke();
  } else {
    // Finished (stage 3+) — wall fill + wainscoting + chair rail + baseboard + crown
    X.fillStyle=th.wall;X.fillRect(bx,fy-h,PG,h);
    X.fillStyle=th.accent;X.fillRect(bx,fy-h,PG,h);
    // Per-block brightness variation
    if(tint>0){X.fillStyle=`rgba(255,255,255,${tint})`;X.fillRect(bx,fy-h,PG,h)}
    else{X.fillStyle=`rgba(0,0,0,${-tint})`;X.fillRect(bx,fy-h,PG,h)}
    // Panel seam lines
    X.strokeStyle='rgba(0,0,0,0.035)';X.lineWidth=1;
    X.beginPath();
    const mid1=fy-h+Math.floor(h*0.35),mid2=fy-h+Math.floor(h*0.7);
    X.moveTo(bx,mid1);X.lineTo(bx+PG,mid1);X.moveTo(bx,mid2);X.lineTo(bx+PG,mid2);
    X.stroke();
    // Wainscoting — lower 35% slightly darker
    const wainTop=fy-Math.floor(h*0.35);
    X.fillStyle='rgba(0,0,0,0.025)';X.fillRect(bx,wainTop,PG,fy-wainTop);
    // Chair rail at wainscoting top
    X.strokeStyle='rgba(0,0,0,0.05)';X.beginPath();X.moveTo(bx,wainTop);X.lineTo(bx+PG,wainTop);X.stroke();
    // Baseboard
    X.fillStyle='rgba(0,0,0,0.08)';X.fillRect(bx,fy-6,PG,6);
    // Crown molding hint at ceiling
    X.fillStyle='rgba(255,255,255,0.04)';X.fillRect(bx,fy-h,PG,4);
  }
}

// ═══ CONSTRUCTION ATMOSPHERE (color temp + dust + tape) ═══
function drawConstructionAtmosphere(i,stage,fy){
  // Color temperature overlay
  if(stage===1){X.fillStyle='rgba(100,120,160,0.03)';X.fillRect(TL,fy-FH,TW,FH)}
  else if(stage===3){X.fillStyle='rgba(200,180,140,0.02)';X.fillRect(TL,fy-FH,TW,FH)}
  else if(stage>=4){X.fillStyle='rgba(240,220,180,0.025)';X.fillRect(TL,fy-FH,TW,FH)}
  // Construction dust particles (stages 1-2 only)
  if(stage>=1&&stage<=2){
    X.fillStyle='rgba(180,170,150,0.08)';
    for(let d=0;d<6;d++){
      const seed=i*6+d;
      const dx=TL+200+((seed*377)%(TW-400))+Math.sin(_now*0.0003+d*2.1)*40;
      const dy=fy-20-((seed*53)%(FH-40))+Math.sin(_now*0.0005+d*1.7)*15;
      const sz=1.5+Math.sin(seed*3.1)*0.5;
      X.beginPath();X.arc(dx,dy,sz,0,Math.PI*2);X.fill();
    }
  }
  // Construction tape marks (stage 1 only)
  if(stage===1){
    X.strokeStyle='rgba(255,120,0,0.08)';X.lineWidth=2;
    for(let m=0;m<3;m++){
      const mx=TL+400+((i*3+m)*431)%(TW-800);
      const my=fy-30-((i*3+m)*67)%(FH-60);
      X.beginPath();X.moveTo(mx-5,my-5);X.lineTo(mx+5,my+5);X.moveTo(mx+5,my-5);X.lineTo(mx-5,my+5);X.stroke();
    }
  }
}

// ═══ MODULE RENDERING ═══
function drawModDetail(mod,mx,my,mw,mh){
  const t=_now*0.001;
  switch(mod.id){
    case 'reception':
      // Desk surface + brass nameplate
      X.fillStyle='rgba(0,0,0,0.12)';X.fillRect(mx+10,my+mh*0.5,mw-20,6);
      X.fillStyle='rgba(200,180,120,0.5)';X.fillRect(mx+mw*0.3,my+mh*0.45,mw*0.4,4);
      break;
    case 'seating':
      // Three chair backs
      X.fillStyle='rgba(0,0,0,0.1)';
      for(let i=0;i<3;i++)X.fillRect(mx+15+i*((mw-30)/3),my+mh*0.35,18,12);
      break;
    case 'kiosk':
      // Screen with scrolling lines
      X.fillStyle='rgba(100,200,255,0.15)';X.fillRect(mx+mw*0.25,my+mh*0.2,mw*0.5,mh*0.4);
      X.fillStyle='rgba(100,200,255,0.3)';
      for(let i=0;i<4;i++){
        const ly=my+mh*0.25+i*8+((t*20)%8);
        if(ly<my+mh*0.55)X.fillRect(mx+mw*0.3,ly,mw*0.4,2);
      }
      break;
    case 'plantcorner':
      // Pot + swaying leaves
      X.fillStyle='#7a5a30';X.fillRect(mx+mw*0.35,my+mh*0.6,mw*0.3,mh*0.25);
      X.fillStyle='rgba(80,160,60,0.6)';
      for(let i=0;i<5;i++){
        const lx=mx+mw*0.5+Math.sin(t+i*1.3)*8,ly=my+mh*0.3+i*6;
        X.beginPath();X.ellipse(lx,ly,6+i,4,Math.sin(t*0.5+i)*0.3,0,Math.PI*2);X.fill();
      }
      break;
    case 'bunk':
      // Two bed frames stacked
      X.fillStyle='rgba(0,0,0,0.1)';X.fillRect(mx+10,my+mh*0.3,mw-20,4);X.fillRect(mx+10,my+mh*0.65,mw-20,4);
      X.fillStyle='rgba(100,130,180,0.2)';X.fillRect(mx+12,my+mh*0.33,mw-24,10);X.fillRect(mx+12,my+mh*0.68,mw-24,10);
      break;
    case 'locker':
      // Locker grid with handles
      X.strokeStyle='rgba(0,0,0,0.12)';X.lineWidth=1;
      for(let r=0;r<2;r++)for(let c=0;c<3;c++){
        X.strokeRect(mx+10+c*25,my+mh*0.2+r*28,22,25);
        X.fillStyle='rgba(200,180,100,0.3)';X.beginPath();X.arc(mx+28+c*25,my+mh*0.2+r*28+12,1.5,0,Math.PI*2);X.fill();
      }
      break;
    case 'shower':
      // Shower head + falling droplets
      X.fillStyle='rgba(160,160,170,0.4)';X.beginPath();X.arc(mx+mw*0.5,my+mh*0.2,6,0,Math.PI*2);X.fill();
      X.fillStyle='rgba(120,180,220,0.25)';
      for(let i=0;i<6;i++){
        const dx=mx+mw*0.4+i*6,dy=my+mh*0.35+((t*30+i*17)%(mh*0.4));
        X.beginPath();X.ellipse(dx,dy,1.5,3,0,0,Math.PI*2);X.fill();
      }
      break;
    case 'readnook':
      // Lamp + open book
      X.fillStyle='rgba(255,220,120,0.15)';X.beginPath();X.arc(mx+mw*0.3,my+mh*0.3,15,0,Math.PI*2);X.fill();
      X.fillStyle='rgba(200,180,140,0.3)';X.fillRect(mx+mw*0.5,my+mh*0.55,18,12);
      X.strokeStyle='rgba(0,0,0,0.1)';X.lineWidth=1;X.beginPath();X.moveTo(mx+mw*0.5+9,my+mh*0.55);X.lineTo(mx+mw*0.5+9,my+mh*0.55+12);X.stroke();
      break;
    case 'planter':
      // Brown soil + green sprouts swaying
      X.fillStyle='rgba(100,70,30,0.4)';X.fillRect(mx+8,my+mh*0.55,mw-16,mh*0.3);
      X.fillStyle='rgba(60,160,40,0.5)';
      for(let i=0;i<6;i++){
        const sx=mx+15+i*((mw-30)/5),sway=Math.sin(t+i*1.7)*3;
        X.fillRect(sx+sway,my+mh*0.35,3,mh*0.22);
        X.beginPath();X.arc(sx+sway+1.5,my+mh*0.33,4,0,Math.PI*2);X.fill();
      }
      break;
    case 'irrigation':
      // Pipes + dripping water
      X.strokeStyle='rgba(80,130,180,0.3)';X.lineWidth=2;
      X.beginPath();X.moveTo(mx+5,my+mh*0.3);X.lineTo(mx+mw-5,my+mh*0.3);X.stroke();
      for(let i=0;i<4;i++){
        const px=mx+20+i*((mw-40)/3);
        X.beginPath();X.moveTo(px,my+mh*0.3);X.lineTo(px,my+mh*0.5);X.stroke();
        const drip=((t*2+i)%1);
        X.fillStyle='rgba(80,160,220,0.3)';X.beginPath();X.arc(px,my+mh*0.5+drip*20,2,0,Math.PI*2);X.fill();
      }
      break;
    case 'compost':
      // Bin with wiggling worm
      X.fillStyle='rgba(90,70,30,0.3)';X.beginPath();X.roundRect(mx+mw*0.2,my+mh*0.3,mw*0.6,mh*0.5,4);X.fill();
      X.strokeStyle='rgba(180,100,80,0.4)';X.lineWidth=2;
      X.beginPath();const wx=mx+mw*0.4;
      for(let s=0;s<8;s++)X.lineTo(wx+s*4+Math.sin(t*3+s)*2,my+mh*0.5+Math.sin(t*2+s*0.8)*3);
      X.stroke();
      break;
    case 'growlight':
      // UV bar + pink glow pulsing
      X.fillStyle='rgba(160,80,200,0.4)';X.fillRect(mx+10,my+mh*0.2,mw-20,5);
      X.fillStyle=`rgba(200,100,255,${0.06+Math.sin(t*2)*0.04})`;X.fillRect(mx+5,my+mh*0.25,mw-10,mh*0.5);
      break;
    case 'workstation':
      // Desk + two monitor rectangles
      X.fillStyle='rgba(0,0,0,0.1)';X.fillRect(mx+8,my+mh*0.55,mw-16,5);
      X.fillStyle='rgba(60,80,120,0.3)';X.fillRect(mx+15,my+mh*0.2,30,22);X.fillRect(mx+mw-45,my+mh*0.2,30,22);
      X.fillStyle=`rgba(100,160,255,${0.1+Math.sin(t)*0.05})`;X.fillRect(mx+17,my+mh*0.22,26,18);
      break;
    case 'serverrack':
      // Dark panel + blinking LEDs
      X.fillStyle='rgba(30,30,40,0.4)';X.fillRect(mx+mw*0.2,my+mh*0.15,mw*0.6,mh*0.65);
      for(let r=0;r<3;r++)for(let c=0;c<2;c++){
        const on=Math.sin(t*3+r*2.1+c*4.3)>0;
        X.fillStyle=on?'rgba(0,255,80,0.6)':'rgba(255,60,30,0.3)';
        X.beginPath();X.arc(mx+mw*0.35+c*mw*0.3,my+mh*0.25+r*mh*0.17,2.5,0,Math.PI*2);X.fill();
      }
      break;
    case 'fumehood':
      // Hood frame + faint vapor
      X.strokeStyle='rgba(120,120,130,0.3)';X.lineWidth=2;X.strokeRect(mx+10,my+mh*0.15,mw-20,mh*0.5);
      X.fillStyle='rgba(180,180,200,0.08)';
      for(let i=0;i<3;i++){
        const vy=my+mh*0.2+((t*8+i*30)%(mh*0.4));
        X.beginPath();X.arc(mx+mw*0.4+i*12,vy,4+Math.sin(t+i)*2,0,Math.PI*2);X.fill();
      }
      break;
    case 'calibench':
      // Bench surface + precision instrument
      X.fillStyle='rgba(0,0,0,0.08)';X.fillRect(mx+8,my+mh*0.55,mw-16,5);
      X.fillStyle='rgba(180,180,190,0.3)';X.beginPath();X.arc(mx+mw*0.5,my+mh*0.4,10,0,Math.PI*2);X.fill();
      // Dial needle
      X.strokeStyle='rgba(200,60,30,0.4)';X.lineWidth=1.5;
      X.beginPath();X.moveTo(mx+mw*0.5,my+mh*0.4);X.lineTo(mx+mw*0.5+Math.cos(t*0.7)*8,my+mh*0.4+Math.sin(t*0.7)*8);X.stroke();
      break;
    case 'kitchen':
      // Range + rising steam wisps
      X.fillStyle='rgba(100,100,100,0.3)';X.fillRect(mx+10,my+mh*0.5,mw-20,mh*0.3);
      X.fillStyle='rgba(255,100,30,0.15)';X.beginPath();X.arc(mx+mw*0.35,my+mh*0.55,5,0,Math.PI*2);X.fill();
      X.beginPath();X.arc(mx+mw*0.65,my+mh*0.55,5,0,Math.PI*2);X.fill();
      X.fillStyle='rgba(255,255,255,0.1)';
      for(let i=0;i<3;i++){
        const sy=my+mh*0.3-((t*15+i*25)%(mh*0.3));
        const sx=mx+mw*0.3+i*mw*0.2+Math.sin(t+i*2)*5;
        X.beginPath();X.arc(sx,sy,3+Math.sin(t*2+i)*1.5,0,Math.PI*2);X.fill();
      }
      break;
    case 'booth':
      // Booth seat + table
      X.fillStyle='rgba(160,40,40,0.25)';X.fillRect(mx+8,my+mh*0.3,10,mh*0.45);
      X.fillStyle='rgba(160,40,40,0.25)';X.fillRect(mx+mw-18,my+mh*0.3,10,mh*0.45);
      X.fillStyle='rgba(0,0,0,0.1)';X.fillRect(mx+20,my+mh*0.5,mw-40,5);
      break;
    case 'bartap':
      // Three tap handles + drip tray
      X.fillStyle='rgba(0,0,0,0.1)';X.fillRect(mx+10,my+mh*0.6,mw-20,4);
      for(let i=0;i<3;i++){
        X.fillStyle=['rgba(200,160,40,0.4)','rgba(160,80,30,0.4)','rgba(40,40,40,0.3)'][i];
        X.fillRect(mx+mw*0.25+i*20,my+mh*0.3,5,mh*0.3);
        X.beginPath();X.arc(mx+mw*0.25+i*20+2.5,my+mh*0.28,4,0,Math.PI*2);X.fill();
      }
      break;
    case 'pantry':
      // Shelves with colored boxes
      X.fillStyle='rgba(0,0,0,0.08)';
      for(let r=0;r<3;r++)X.fillRect(mx+5,my+mh*0.2+r*mh*0.22,mw-10,2);
      const cols=['rgba(200,60,40,0.3)','rgba(40,120,180,0.3)','rgba(200,180,40,0.3)','rgba(60,160,80,0.3)'];
      for(let r=0;r<3;r++)for(let c=0;c<4;c++){
        X.fillStyle=cols[(r+c)%4];X.fillRect(mx+8+c*16,my+mh*0.22+r*mh*0.22-10,12,10);
      }
      break;
    case 'sofa':
      // Sofa shape with cushions
      X.fillStyle='rgba(120,90,60,0.3)';X.beginPath();X.roundRect(mx+8,my+mh*0.45,mw-16,mh*0.3,4);X.fill();
      X.fillStyle='rgba(100,75,50,0.3)';X.fillRect(mx+8,my+mh*0.35,8,mh*0.4);X.fillRect(mx+mw-16,my+mh*0.35,8,mh*0.4);
      break;
    case 'bookshelf':
      // Grid of colored book spines
      const bCols=['rgba(180,40,30,0.3)','rgba(40,80,160,0.3)','rgba(60,120,40,0.3)','rgba(180,140,40,0.3)','rgba(100,40,120,0.3)'];
      for(let r=0;r<3;r++){
        X.fillStyle='rgba(0,0,0,0.06)';X.fillRect(mx+8,my+mh*0.18+r*mh*0.22,mw-16,2);
        for(let c=0;c<8;c++){
          X.fillStyle=bCols[(r*8+c)%5];X.fillRect(mx+10+c*8,my+mh*0.2+r*mh*0.22-14,6,14);
        }
      }
      break;
    case 'musiccorner':
      // Speaker + floating notes
      X.fillStyle='rgba(50,50,60,0.3)';X.beginPath();X.roundRect(mx+mw*0.3,my+mh*0.3,mw*0.4,mh*0.4,4);X.fill();
      X.strokeStyle='rgba(80,80,90,0.3)';X.lineWidth=1;X.beginPath();X.arc(mx+mw*0.5,my+mh*0.5,8,0,Math.PI*2);X.stroke();
      X.font='12px serif';X.fillStyle=`rgba(255,220,160,${0.2+Math.sin(t)*0.1})`;
      X.fillText('\u266A',mx+mw*0.7+Math.sin(t*0.7)*5,my+mh*0.3-((t*8)%20));
      break;
    case 'chess':
      // 4x4 mini checkerboard + piece dots
      const bsz=6;
      for(let r=0;r<4;r++)for(let c=0;c<4;c++){
        X.fillStyle=(r+c)%2===0?'rgba(220,210,190,0.3)':'rgba(80,70,50,0.3)';
        X.fillRect(mx+mw*0.3+c*bsz,my+mh*0.25+r*bsz,bsz,bsz);
      }
      X.fillStyle='rgba(30,30,30,0.5)';X.beginPath();X.arc(mx+mw*0.3+9,my+mh*0.25+9,2.5,0,Math.PI*2);X.fill();
      X.fillStyle='rgba(220,220,220,0.5)';X.beginPath();X.arc(mx+mw*0.3+15,my+mh*0.25+15,2.5,0,Math.PI*2);X.fill();
      break;
    case 'viewbench':
      // Bench with figure silhouette
      X.fillStyle='rgba(0,0,0,0.08)';X.fillRect(mx+10,my+mh*0.6,mw-20,8);
      X.fillStyle='rgba(100,130,160,0.06)';X.fillRect(mx+5,my+mh*0.1,mw-10,mh*0.5);
      break;
    case 'telescope':
      // Scope body + rotating arc + central dot
      X.fillStyle='rgba(80,90,100,0.3)';X.beginPath();X.arc(mx+mw*0.5,my+mh*0.45,14,0,Math.PI*2);X.fill();
      X.strokeStyle='rgba(120,140,160,0.4)';X.lineWidth=2;
      X.beginPath();X.arc(mx+mw*0.5,my+mh*0.45,14,t%Math.PI*2,(t%Math.PI*2)+1.2);X.stroke();
      X.fillStyle='rgba(200,220,255,0.5)';X.beginPath();X.arc(mx+mw*0.5,my+mh*0.45,3,0,Math.PI*2);X.fill();
      break;
    case 'displaywall':
      // LED panel with color blocks
      X.fillStyle='rgba(20,20,30,0.3)';X.fillRect(mx+8,my+mh*0.15,mw-16,mh*0.55);
      for(let r=0;r<3;r++)for(let c=0;c<5;c++){
        const hue=((r*5+c)*40+t*20)%360;
        X.fillStyle=`hsla(${hue},60%,50%,0.2)`;X.fillRect(mx+12+c*12,my+mh*0.2+r*12,10,10);
      }
      break;
    case 'skymap':
      // Dark circle + constellation dots
      X.fillStyle='rgba(10,10,30,0.3)';X.beginPath();X.arc(mx+mw*0.5,my+mh*0.45,mw*0.3,0,Math.PI*2);X.fill();
      X.fillStyle='rgba(200,220,255,0.4)';
      for(let i=0;i<8;i++){
        const a=i*Math.PI*2/8+t*0.1,r2=mw*0.15+Math.sin(i*3.7)*mw*0.08;
        X.beginPath();X.arc(mx+mw*0.5+Math.cos(a)*r2,my+mh*0.45+Math.sin(a)*r2,1.5,0,Math.PI*2);X.fill();
      }
      break;
    case 'cargorack':
      // Steel shelf with boxes
      X.strokeStyle='rgba(100,100,90,0.3)';X.lineWidth=1.5;
      for(let r=0;r<3;r++){
        const ry=my+mh*0.2+r*mh*0.22;
        X.beginPath();X.moveTo(mx+8,ry);X.lineTo(mx+mw-8,ry);X.stroke();
      }
      X.fillStyle='rgba(150,130,100,0.25)';X.fillRect(mx+12,my+mh*0.22-12,18,12);
      X.fillStyle='rgba(130,140,120,0.25)';X.fillRect(mx+35,my+mh*0.44-12,22,12);
      break;
    case 'freezer':
      // Blue-white inner glow + frost particles
      X.fillStyle='rgba(180,210,240,0.1)';X.beginPath();X.roundRect(mx+8,my+mh*0.15,mw-16,mh*0.6,4);X.fill();
      X.fillStyle=`rgba(200,230,255,${0.08+Math.sin(t*1.5)*0.04})`;X.fillRect(mx+10,my+mh*0.18,mw-20,mh*0.54);
      X.fillStyle='rgba(255,255,255,0.3)';
      for(let i=0;i<5;i++){
        const fx=mx+15+((i*37+t*5)%(mw-30)),fy2=my+mh*0.2+((i*23+t*3)%(mh*0.5));
        X.beginPath();X.arc(fx,fy2,1+Math.sin(t+i)*0.5,0,Math.PI*2);X.fill();
      }
      break;
    case 'conveyor':
      // Belt with moving segments
      X.fillStyle='rgba(80,80,70,0.3)';X.fillRect(mx+5,my+mh*0.55,mw-10,8);
      X.fillStyle='rgba(60,60,55,0.3)';
      for(let i=0;i<6;i++){
        const cx2=mx+10+((i*18+t*20)%(mw-20));
        X.fillRect(cx2,my+mh*0.55,3,8);
      }
      // Rollers
      X.fillStyle='rgba(120,120,110,0.3)';
      for(let i=0;i<4;i++)X.beginPath(),X.arc(mx+20+i*((mw-40)/3),my+mh*0.63,3,0,Math.PI*2),X.fill();
      break;
    case 'manifest':
      // Terminal screen + blinking cursor
      X.fillStyle='rgba(40,50,40,0.3)';X.fillRect(mx+mw*0.2,my+mh*0.2,mw*0.6,mh*0.45);
      X.fillStyle='rgba(0,200,80,0.15)';X.fillRect(mx+mw*0.22,my+mh*0.22,mw*0.56,mh*0.41);
      X.fillStyle='rgba(0,200,80,0.3)';
      for(let i=0;i<3;i++)X.fillRect(mx+mw*0.26,my+mh*0.28+i*10,mw*0.4,2);
      if(Math.sin(t*4)>0)X.fillRect(mx+mw*0.26,my+mh*0.28+30,6,8);
      break;
    case 'startracker':
      // Circle + rotating arc + central dot
      X.strokeStyle='rgba(180,200,255,0.3)';X.lineWidth=1.5;X.beginPath();X.arc(mx+mw*0.5,my+mh*0.4,16,0,Math.PI*2);X.stroke();
      X.strokeStyle='rgba(180,200,255,0.5)';X.lineWidth=2;X.beginPath();X.arc(mx+mw*0.5,my+mh*0.4,16,t*0.8,(t*0.8)+0.8);X.stroke();
      X.fillStyle='rgba(255,255,200,0.6)';X.beginPath();X.arc(mx+mw*0.5,my+mh*0.4,3,0,Math.PI*2);X.fill();
      break;
    case 'dataterminal':
      // Screen with data stream
      X.fillStyle='rgba(20,20,35,0.3)';X.fillRect(mx+mw*0.15,my+mh*0.15,mw*0.7,mh*0.5);
      X.fillStyle='rgba(80,160,255,0.2)';
      for(let i=0;i<5;i++){
        const dy=my+mh*0.2+((t*12+i*15)%(mh*0.4));
        X.fillRect(mx+mw*0.2,dy,mw*0.3+Math.sin(i*2.3)*mw*0.15,2);
      }
      break;
    case 'lensarray':
      // Three lens circles
      for(let i=0;i<3;i++){
        const lx=mx+mw*0.25+i*mw*0.2,ly=my+mh*0.4;
        X.strokeStyle='rgba(160,180,200,0.3)';X.lineWidth=1.5;X.beginPath();X.arc(lx,ly,8+i*2,0,Math.PI*2);X.stroke();
        X.fillStyle=`rgba(180,200,255,${0.06+Math.sin(t+i)*0.04})`;X.beginPath();X.arc(lx,ly,6+i*2,0,Math.PI*2);X.fill();
      }
      break;
    case 'chartdesk':
      // Desk surface + star chart paper
      X.fillStyle='rgba(0,0,0,0.08)';X.fillRect(mx+8,my+mh*0.55,mw-16,5);
      X.fillStyle='rgba(220,210,180,0.2)';X.fillRect(mx+12,my+mh*0.25,mw-24,mh*0.3);
      X.fillStyle='rgba(60,80,120,0.3)';
      for(let i=0;i<6;i++){X.beginPath();X.arc(mx+18+i*10,my+mh*0.35+Math.sin(i*2.1)*6,1.5,0,Math.PI*2);X.fill()}
      break;
    case 'commstation':
      // Radio with antenna + signal arcs
      X.fillStyle='rgba(60,60,70,0.3)';X.fillRect(mx+mw*0.3,my+mh*0.35,mw*0.4,mh*0.35);
      X.strokeStyle='rgba(100,100,110,0.3)';X.lineWidth=1.5;X.beginPath();X.moveTo(mx+mw*0.5,my+mh*0.35);X.lineTo(mx+mw*0.5,my+mh*0.12);X.stroke();
      X.strokeStyle=`rgba(100,200,255,${0.15+Math.sin(t*2)*0.1})`;X.lineWidth=1;
      for(let i=1;i<=3;i++){X.beginPath();X.arc(mx+mw*0.5,my+mh*0.12,i*6,-1,-1+Math.PI);X.stroke()}
      break;
    case 'radar':
      // Ring + rotating sweep line + fading wedge
      const rx2=mx+mw*0.5,ry2=my+mh*0.42,rr=Math.min(mw,mh)*0.28;
      X.strokeStyle='rgba(0,255,120,0.2)';X.lineWidth=1;X.beginPath();X.arc(rx2,ry2,rr,0,Math.PI*2);X.stroke();
      const sa=t*1.5;
      X.strokeStyle='rgba(0,255,120,0.5)';X.lineWidth=2;X.beginPath();X.moveTo(rx2,ry2);X.lineTo(rx2+Math.cos(sa)*rr,ry2+Math.sin(sa)*rr);X.stroke();
      X.globalAlpha=0.12;X.fillStyle='rgba(0,255,120,1)';X.beginPath();X.moveTo(rx2,ry2);X.arc(rx2,ry2,rr,sa-0.5,sa);X.closePath();X.fill();X.globalAlpha=1;
      X.fillStyle='rgba(0,255,120,0.4)';X.beginPath();X.arc(rx2,ry2,2,0,Math.PI*2);X.fill();
      break;
    case 'statuswall':
      // Nine small status dots (mirrors command floor life)
      for(let i=0;i<9;i++){
        const fs=S.buildout[i]?S.buildout[i].stage:0;
        X.fillStyle=fs>=5?'rgba(0,200,80,0.5)':fs>=1?'rgba(200,200,0,0.3)':'rgba(80,80,80,0.2)';
        X.beginPath();X.arc(mx+15+i*8,my+mh*0.4,3,0,Math.PI*2);X.fill();
      }
      X.fillStyle='rgba(30,30,40,0.2)';X.fillRect(mx+8,my+mh*0.2,mw-16,mh*0.45);
      break;
    case 'navcomputer':
      // Screen + trajectory arc
      X.fillStyle='rgba(20,25,35,0.3)';X.fillRect(mx+mw*0.15,my+mh*0.15,mw*0.7,mh*0.5);
      X.strokeStyle='rgba(0,200,255,0.3)';X.lineWidth=1.5;
      X.beginPath();
      for(let i=0;i<=20;i++){
        const px=mx+mw*0.2+i*(mw*0.6/20),py=my+mh*0.55-Math.sin(i/20*Math.PI)*mh*0.3;
        i===0?X.moveTo(px,py):X.lineTo(px,py);
      }
      X.stroke();
      X.fillStyle='rgba(0,255,200,0.5)';
      const pos2=((t*0.3)%1)*20;
      const ppx=mx+mw*0.2+pos2*(mw*0.6/20),ppy=my+mh*0.55-Math.sin(pos2/20*Math.PI)*mh*0.3;
      X.beginPath();X.arc(ppx,ppy,3,0,Math.PI*2);X.fill();
      break;
    // ═══ FLOOR 8 MODULES ═══
    case 'f8_workbench':
      X.fillStyle='rgba(0,0,0,0.1)';X.fillRect(mx+8,my+mh*0.55,mw-16,5);
      X.fillStyle='rgba(180,120,40,0.3)';X.fillRect(mx+12,my+mh*0.3,mw-24,mh*0.25);
      X.fillStyle='rgba(100,80,40,0.3)';X.fillRect(mx+mw*0.6,my+mh*0.2,4,mh*0.35);
      break;
    case 'f8_toolrack':
      X.strokeStyle='rgba(120,100,60,0.3)';X.lineWidth=1.5;
      for(let r=0;r<3;r++)X.beginPath(),X.moveTo(mx+10,my+mh*0.2+r*mh*0.2),X.lineTo(mx+mw-10,my+mh*0.2+r*mh*0.2),X.stroke();
      X.fillStyle='rgba(160,120,40,0.3)';for(let i=0;i<5;i++)X.fillRect(mx+14+i*12,my+mh*0.22,3,mh*0.15);
      break;
    case 'f8_lumber':
      X.fillStyle='rgba(160,128,64,0.3)';
      for(let i=0;i<4;i++)X.fillRect(mx+10,my+mh*0.4+i*8,mw-20,5);
      X.fillStyle='rgba(120,96,48,0.2)';X.fillRect(mx+15,my+mh*0.35,mw-30,4);
      break;
    case 'f8_blueprint':
      X.fillStyle='rgba(220,200,140,0.2)';X.fillRect(mx+10,my+mh*0.25,mw-20,mh*0.4);
      X.strokeStyle='rgba(60,100,180,0.2)';X.lineWidth=1;
      for(let i=0;i<3;i++){X.beginPath();X.moveTo(mx+15,my+mh*0.3+i*12);X.lineTo(mx+mw-15,my+mh*0.3+i*12);X.stroke()}
      for(let i=0;i<3;i++){X.beginPath();X.moveTo(mx+20+i*18,my+mh*0.27);X.lineTo(mx+20+i*18,my+mh*0.6);X.stroke()}
      break;
    case 'f8_monitor':
      X.fillStyle='rgba(20,30,50,0.3)';X.fillRect(mx+mw*0.2,my+mh*0.2,mw*0.6,mh*0.4);
      X.fillStyle=`rgba(60,100,180,${0.1+Math.sin(t)*0.05})`;X.fillRect(mx+mw*0.22,my+mh*0.22,mw*0.56,mh*0.36);
      X.fillStyle='rgba(0,0,0,0.1)';X.fillRect(mx+mw*0.4,my+mh*0.6,mw*0.2,mh*0.15);
      break;
    case 'f8_cabinet':
      X.fillStyle='rgba(50,55,70,0.3)';X.beginPath();X.roundRect(mx+mw*0.15,my+mh*0.15,mw*0.7,mh*0.65,3);X.fill();
      X.strokeStyle='rgba(80,85,100,0.3)';X.lineWidth=1;
      for(let r=0;r<3;r++)X.beginPath(),X.moveTo(mx+mw*0.2,my+mh*0.3+r*mh*0.15),X.lineTo(mx+mw*0.8,my+mh*0.3+r*mh*0.15),X.stroke();
      X.fillStyle='rgba(180,160,100,0.3)';for(let r=0;r<3;r++)X.beginPath(),X.arc(mx+mw*0.75,my+mh*0.25+r*mh*0.15,1.5,0,Math.PI*2),X.fill();
      break;
    case 'f8_whiteboard':
      X.fillStyle='rgba(240,240,245,0.15)';X.fillRect(mx+8,my+mh*0.15,mw-16,mh*0.55);
      X.strokeStyle='rgba(200,200,210,0.2)';X.lineWidth=1;X.strokeRect(mx+8,my+mh*0.15,mw-16,mh*0.55);
      X.fillStyle='rgba(60,80,120,0.2)';for(let i=0;i<3;i++)X.fillRect(mx+14,my+mh*0.25+i*12,mw*0.5,2);
      break;
    case 'f8_cooler':
      X.fillStyle='rgba(200,210,220,0.2)';X.beginPath();X.roundRect(mx+mw*0.3,my+mh*0.2,mw*0.4,mh*0.55,4);X.fill();
      X.fillStyle='rgba(80,160,220,0.15)';X.fillRect(mx+mw*0.35,my+mh*0.3,mw*0.3,mh*0.2);
      X.fillStyle='rgba(60,60,70,0.2)';X.beginPath();X.arc(mx+mw*0.5,my+mh*0.55,3,0,Math.PI*2);X.fill();
      break;
  }
}
function drawMod(mod,bx,fy,bi,fi){
  const pad=10,mw=PG-pad*2,mh=FH-pad*2;
  const mx=bx+pad,my=fy-FH+pad;
  // Shadow
  X.fillStyle='rgba(0,0,0,0.08)';X.beginPath();X.roundRect(mx+2,my+2,mw,mh,6);X.fill();
  // Body
  X.fillStyle=mod.col;X.beginPath();X.roundRect(mx,my,mw,mh,6);X.fill();
  // Highlight strip
  X.fillStyle='rgba(255,255,255,0.12)';X.fillRect(mx+2,my+1,mw-4,3);
  // Border
  X.strokeStyle='rgba(0,0,0,0.15)';X.lineWidth=1;X.beginPath();X.roundRect(mx,my,mw,mh,6);X.stroke();
  // Per-module animated detail
  drawModDetail(mod,mx,my,mw,mh);
  // Icon
  X.font='24px sans-serif';X.textAlign='center';X.fillText(mod.ic,mx+mw/2,my+mh*0.4);
  // Label
  X.fillStyle='rgba(0,0,0,0.45)';X.font='bold 9px monospace';X.textAlign='center';X.fillText(mod.nm,mx+mw/2,my+mh*0.78);
}

// ═══ FLOOR-SPECIFIC AMBIENT LIFE (no gradients — all simple fills) ═══
function drawFloorLife(i,stage,fy){
  if(stage<2)return;
  const t=_now*0.001;
  switch(i){
    case 0: // LOBBY — vestibules, reception divider, glass doors, warm glow, clock
      // Entry vestibules — dark industrial corridors at both ends
      if(stage>=1){
        const _vw=180;
        // Left vestibule
        X.fillStyle='#08080e';X.fillRect(TL,fy-FH+FT,_vw,FH-FT);
        // Right vestibule
        X.fillStyle='#08080e';X.fillRect(TR-_vw,fy-FH+FT,_vw,FH-FT);
        // Industrial overhead lights (both sides)
        for(let side=0;side<2;side++){
          const baseX=side===0?TL:TR-_vw;
          for(let li=0;li<4;li++){
            const lx=baseX+25+li*42,ly=fy-FH+FT+8;
            // Wire
            X.strokeStyle='#252530';X.lineWidth=1;X.beginPath();X.moveTo(lx,fy-FH+FT);X.lineTo(lx,ly);X.stroke();
            // Fixture housing
            X.fillStyle='#303038';X.fillRect(lx-7,ly,14,3);
            // Light cone
            const gc=X.createLinearGradient(lx,ly+3,lx,fy);
            gc.addColorStop(0,'rgba(255,210,120,0.10)');gc.addColorStop(1,'rgba(255,210,120,0)');
            X.fillStyle=gc;X.beginPath();X.moveTo(lx-3,ly+3);X.lineTo(lx-22,fy);X.lineTo(lx+22,fy);X.lineTo(lx+3,ly+3);X.closePath();X.fill();
            // Bulb
            X.fillStyle='rgba(255,210,120,0.5)';X.beginPath();X.arc(lx,ly+2,1.5,0,Math.PI*2);X.fill();
          }
        }
        // Caution stripes on floor (both sides)
        for(let side=0;side<2;side++){
          const baseX=side===0?TL:TR-_vw;
          for(let sx=0;sx<_vw;sx+=12){
            X.fillStyle=(Math.floor(sx/12)%2)?'rgba(255,180,0,0.06)':'rgba(20,20,20,0.04)';
            X.fillRect(baseX+sx,fy-3,6,3);
          }
        }
      }
      if(stage>=2){
        // Reception divider wall
        X.fillStyle='#b8b0a0';X.fillRect(TL+TW*0.35,fy-70,8,70);
        // Glass entrance doors
        X.fillStyle='rgba(160,200,220,0.15)';X.fillRect(TL+TW*0.45,fy-90,50,90);X.fillRect(TL+TW*0.45+60,fy-90,50,90);
        // Door handles
        X.fillStyle='rgba(180,160,120,0.4)';X.beginPath();X.arc(TL+TW*0.45+44,fy-45,3,0,Math.PI*2);X.fill();X.beginPath();X.arc(TL+TW*0.45+66,fy-45,3,0,Math.PI*2);X.fill();
      }
      if(stage>=3){X.globalAlpha=0.06;X.fillStyle='#ffd880';X.beginPath();X.arc(TL+TW*0.4,fy-20,60,0,Math.PI*2);X.fill();X.globalAlpha=1}
      if(stage>=4){
        const cx=TL+TW*0.65,cy=fy-FH+30;
        X.strokeStyle='rgba(180,160,120,0.3)';X.lineWidth=1.5;X.beginPath();X.arc(cx,cy,12,0,Math.PI*2);X.stroke();
        X.strokeStyle='rgba(180,160,120,0.4)';X.lineWidth=1;
        X.beginPath();X.moveTo(cx,cy);X.lineTo(cx+Math.cos(t*0.5)*8,cy+Math.sin(t*0.5)*8);X.stroke();
        X.beginPath();X.moveTo(cx,cy);X.lineTo(cx+Math.cos(t*6)*5,cy+Math.sin(t*6)*5);X.stroke();
      }
      if(stage>=5){X.globalAlpha=0.08;X.fillStyle='#ffe8b0';X.fillRect(TL+TW*0.45,fy-90,110,90);X.globalAlpha=1}
      break;
    case 1: // QUARTERS — partition walls, plumbing, lamp dots, photo frames
      if(stage>=2){
        // Partition walls with door gaps
        X.fillStyle='#c4b8a8';for(let px=TL+500;px<TR-300;px+=600){X.fillRect(px,fy-FH+FT,6,FH-FT-40);X.fillRect(px,fy-30,6,30)}
      }
      if(stage>=3){
        // Plumbing — horizontal ceiling pipe + vertical drops
        X.fillStyle='#909090';X.fillRect(TL+200,fy-FH+FT+4,TW-400,4);for(let dx=TL+400;dx<TR-200;dx+=500){X.fillRect(dx,fy-FH+FT+4,3,20)}
        // Warm lamp dots
        X.globalAlpha=0.08;X.fillStyle='#ffc870';for(let lx=TL+400;lx<TR-200;lx+=500){X.beginPath();X.arc(lx,fy-30,30,0,Math.PI*2);X.fill()}X.globalAlpha=1;
      }
      if(stage>=4){X.fillStyle='rgba(200,180,140,0.12)';X.strokeStyle='rgba(160,140,100,0.2)';X.lineWidth=1;for(let px=TL+600;px<TR-300;px+=700){X.fillRect(px,fy-FH+20,22,18);X.strokeRect(px,fy-FH+20,22,18)}}
      break;
    case 2: // GARDEN — planter beds, irrigation, water recycler, UV strip, pollen, vines, tomato
      if(stage>=2){
        // Raised planter beds
        X.fillStyle='#8a6a3a';for(let bx=TL+300;bx<TR-200;bx+=500){X.fillRect(bx,fy-28,80,28)}
        // Irrigation channels
        X.strokeStyle='rgba(100,140,180,0.2)';X.lineWidth=1;for(let ix=TL+200;ix<TR-100;ix+=300){X.beginPath();X.moveTo(ix,fy-2);X.lineTo(ix+180,fy-2);X.stroke()}
      }
      if(stage>=3){
        // Water recycler — wall-mounted box with water display
        X.fillStyle='#808888';X.fillRect(TL+150,fy-FH+20,30,24);X.fillStyle='rgba(80,160,200,0.3)';X.fillRect(TL+154,fy-FH+26,22,12);
        // UV ceiling strip
        X.fillStyle='rgba(200,100,255,0.06)';X.fillRect(TL+100,fy-FH+2,TW-200,6);X.globalAlpha=0.04;X.fillStyle='#c864ff';X.fillRect(TL,fy-FH,TW,FH*0.3);X.globalAlpha=1;
      }
      if(stage>=4){X.fillStyle='rgba(140,220,100,0.25)';for(let mi=0;mi<8;mi++){const mx=TL+200+((mi*457+Math.sin(t+mi*2.1)*80)%(TW-400)),my=fy-20-((t*8+mi*37)%120);X.beginPath();X.arc(mx,my,1.5+Math.sin(t*2+mi)*0.5,0,Math.PI*2);X.fill()}}
      if(stage>=5){
        // Vines
        X.strokeStyle='rgba(80,160,60,0.2)';X.lineWidth=2;for(let px=TL+PG;px<TR;px+=PG*3){X.beginPath();for(let vy=0;vy<FH*0.6;vy+=8)X.lineTo(px+Math.sin(vy*0.08+t*0.5)*6,fy-vy);X.stroke()}
        // Red tomato on vine + green stem
        const tvx=TL+PG+Math.sin(FH*0.3*0.08+t*0.5)*6;X.fillStyle='rgba(200,40,20,0.6)';X.beginPath();X.arc(tvx,fy-FH*0.3,4,0,Math.PI*2);X.fill();
        X.strokeStyle='rgba(60,140,40,0.4)';X.lineWidth=1;X.beginPath();X.moveTo(tvx,fy-FH*0.3-4);X.lineTo(tvx+3,fy-FH*0.3-8);X.stroke();
      }
      break;
    case 3: // RESEARCH — lab benches, safety glass, fume hood, server rack, screen glow, LEDs
      if(stage>=2){
        // Lab benches
        X.fillStyle='#a0a0a0';X.fillRect(TL+300,fy-36,120,8);X.fillRect(TL+300,fy-36,4,36);X.fillRect(TL+416,fy-36,4,36);
        // Safety glass partition
        X.fillStyle='rgba(180,200,210,0.1)';X.fillRect(TL+TW*0.55,fy-FH+FT,4,FH-FT);
        // Fume hood frame
        X.strokeStyle='rgba(120,120,130,0.3)';X.lineWidth=2;X.strokeRect(TL+800,fy-FH+FT+2,80,40);X.beginPath();X.moveTo(TL+800,fy-FH+FT+2);X.lineTo(TL+840,fy-FH+FT-8);X.lineTo(TL+880,fy-FH+FT+2);X.stroke();
      }
      if(stage>=3){
        // Server rack body + face panel
        X.fillStyle='#505560';X.fillRect(TL+1100,fy-80,28,80);X.fillStyle='#606870';X.fillRect(TL+1103,fy-76,22,72);
        // Blue screen glow
        X.globalAlpha=0.06;X.fillStyle='#6090ff';for(let sx=TL+600;sx<TR-200;sx+=700){X.beginPath();X.arc(sx,fy-FH*0.5,35,0,Math.PI*2);X.fill()}X.globalAlpha=1;
      }
      if(stage>=4){for(let li=0;li<12;li++){const lx=TL+800+li*18,ly=fy-FH*0.3+Math.sin(li*1.7)*10;X.fillStyle=Math.sin(t*3+li*0.8)>0?'rgba(0,255,80,0.5)':'rgba(255,60,30,0.3)';X.beginPath();X.arc(lx,ly,2,0,Math.PI*2);X.fill()}}
      break;
    case 4: // RESTAURANT — bar counter, stools, kitchen equipment, glow, steam, pendant lights
      if(stage>=2){
        // Bar counter
        X.fillStyle='#7a6a58';X.fillRect(TL+TW*0.6,fy-40,160,8);X.fillRect(TL+TW*0.6,fy-40,6,40);X.fillRect(TL+TW*0.6+154,fy-40,6,40);
        // Bar stools
        X.fillStyle='#606060';for(let sx=TL+TW*0.62;sx<TL+TW*0.6+140;sx+=40){X.fillRect(sx+8,fy-22,2,22);X.beginPath();X.arc(sx+9,fy-24,6,0,Math.PI*2);X.fill()}
      }
      if(stage>=3){
        // Range hood + stove body
        X.fillStyle='#808080';X.fillRect(TL+250,fy-FH+FT+2,70,12);X.fillStyle='#707070';X.fillRect(TL+260,fy-36,50,36);
        // Kitchen glow
        X.globalAlpha=0.05;X.fillStyle='#ffb050';X.beginPath();X.arc(TL+300,fy-FH*0.4,80,0,Math.PI*2);X.fill();X.globalAlpha=1;
      }
      if(stage>=4){X.fillStyle='rgba(255,255,255,0.1)';for(let si=0;si<6;si++){const sx=TL+250+si*40+Math.sin(t+si)*15,sy=fy-FH*0.6-((t*15+si*23)%60);X.beginPath();X.arc(sx,sy,2+Math.sin(t+si),0,Math.PI*2);X.fill()}}
      if(stage>=5){
        for(let pl=TL+500;pl<TR-200;pl+=350){const sw2=Math.sin(t*0.7+pl*0.01)*3;X.strokeStyle='rgba(60,50,40,0.3)';X.lineWidth=1;X.beginPath();X.moveTo(pl,fy-FH);X.lineTo(pl+sw2,fy-FH+25);X.stroke();X.globalAlpha=0.08;X.fillStyle='#ffd070';X.beginPath();X.arc(pl+sw2,fy-FH+30,20,0,Math.PI*2);X.fill();X.globalAlpha=1}
        drawRGBDoor(fy,_now);
      }
      break;
    case 5: // LOUNGE — alcoves, speakers, warm mood spots, floating music notes
      if(stage>=2){
        // Reading nook alcove
        X.fillStyle='#b8b0a4';X.fillRect(TL+250,fy-FH+FT,6,80);X.fillRect(TL+400,fy-FH+FT,6,80);
        // Conversation alcove
        X.fillRect(TL+TW*0.65,fy-FH+FT,6,60);X.fillRect(TL+TW*0.65+150,fy-FH+FT,6,60);
      }
      if(stage>=3){
        // Speaker mounts
        for(const spx of[TL+180,TR-200]){X.fillStyle='#605850';X.fillRect(spx,fy-FH+30,16,12);X.strokeStyle='rgba(100,90,80,0.3)';X.lineWidth=1;X.beginPath();X.arc(spx+8,fy-FH+36,4,0,Math.PI*2);X.stroke()}
        // Warm mood spots
        X.globalAlpha=0.04;X.fillStyle='#ffb050';for(let ml=TL+350;ml<TR-200;ml+=600){X.beginPath();X.arc(ml,fy-FH*0.6,50,0,Math.PI*2);X.fill()}X.globalAlpha=1;
      }
      if(stage>=5){X.font='14px serif';for(let ni=0;ni<3;ni++){const nx=TL+500+ni*400+Math.sin(t*0.5+ni*2)*30,ny=fy-40-((t*10+ni*50)%100);X.globalAlpha=0.12+Math.sin(t+ni)*0.08;X.fillStyle='rgba(255,220,160,1)';X.fillText('\u266A',nx,ny)}X.globalAlpha=1}
      break;
    case 6: // OBSERVATION — panoramic glass frames, viewing alcove, display panels, blue tint, sparkles
      if(stage>=2){
        // Panoramic glass frames with cross-mullions
        X.strokeStyle='rgba(140,170,200,0.25)';X.lineWidth=2;
        for(let gx=TL+200;gx<TR-100;gx+=400){X.strokeRect(gx,fy-FH+FT+4,120,FH-FT-12);X.beginPath();X.moveTo(gx+60,fy-FH+FT+4);X.lineTo(gx+60,fy-8);X.stroke();X.beginPath();X.moveTo(gx,fy-FH*0.5);X.lineTo(gx+120,fy-FH*0.5);X.stroke()}
        // Viewing alcove
        X.fillStyle='rgba(140,170,200,0.06)';X.fillRect(TL+TW*0.4,fy-12,100,12);
      }
      if(stage>=3){
        // Display panels — wall-mounted screens with glow
        for(const dx of[TL+TW*0.2,TL+TW*0.75]){X.fillStyle='#404850';X.fillRect(dx,fy-FH+24,36,24);X.globalAlpha=0.06;X.fillStyle='#78b4f0';X.beginPath();X.arc(dx+18,fy-FH+36,20,0,Math.PI*2);X.fill();X.globalAlpha=1}
        // Blue tint
        X.globalAlpha=0.03;X.fillStyle='#78b4f0';X.fillRect(TL,fy-FH,TW,FH*0.5);X.globalAlpha=1;
      }
      if(stage>=5){for(let si=0;si<4;si++){const sp=Math.sin(t*2+si*1.5);if(sp>0.7){X.fillStyle=`rgba(255,255,255,${(sp-0.7)*1.5})`;X.beginPath();X.arc(TL+400+si*500,fy-FH*0.7,3,0,Math.PI*2);X.fill()}}}
      break;
    case 7: // STORAGE — steel racks, loading dock, inventory terminal, yellow strip, LEDs
      if(stage>=2){
        // Steel rack uprights + shelf crossbars
        X.strokeStyle='rgba(120,120,110,0.3)';X.lineWidth=2;
        for(let rx=TL+300;rx<TR-200;rx+=400){X.beginPath();X.moveTo(rx,fy);X.lineTo(rx,fy-FH+FT+5);X.stroke();X.beginPath();X.moveTo(rx+60,fy);X.lineTo(rx+60,fy-FH+FT+5);X.stroke();for(let sy2=fy-30;sy2>fy-FH+FT+10;sy2-=35){X.beginPath();X.moveTo(rx,sy2);X.lineTo(rx+60,sy2);X.stroke()}}
        // Loading dock frame
        X.strokeStyle='rgba(140,130,100,0.25)';X.lineWidth=3;X.strokeRect(TL+100,fy-90,100,90);
      }
      if(stage>=3){
        // Inventory terminal — wall box with green screen
        X.fillStyle='#606860';X.fillRect(TR-250,fy-FH+22,26,20);X.fillStyle='rgba(0,200,80,0.15)';X.fillRect(TR-247,fy-FH+25,20,14);
        // Yellow ceiling strip
        X.fillStyle='rgba(255,220,60,0.05)';X.fillRect(TL+50,fy-FH+2,TW-100,6);X.globalAlpha=0.03;X.fillStyle='#ffdc3c';X.fillRect(TL,fy-FH,TW,40);X.globalAlpha=1;
      }
      if(stage>=4){for(let li=0;li<20;li++){const lx=TL+200+li*130;X.fillStyle=Math.floor(t*2+li*0.3)%3===0?'rgba(0,200,80,0.4)':'rgba(200,80,0,0.2)';X.beginPath();X.arc(lx,fy-FH*0.7,1.5,0,Math.PI*2);X.fill()}}
      break;
    case 8: // OBSERVATORY — telescope housing, ceiling aperture, starlight beam, star map, sky
      if(stage>=2){
        // Telescope housing (rect + dome arc)
        const thx=TL+TW*0.55-30;X.fillStyle='#606878';X.fillRect(thx,fy-70,60,70);X.beginPath();X.arc(thx+30,fy-70,30,Math.PI,0);X.fill();
        // Ceiling aperture
        X.fillStyle='rgba(20,20,40,0.15)';X.fillRect(TL+TW*0.55-20,fy-FH,40,FT+4);
      }
      if(stage>=3){const bx2=TL+TW*0.55;X.globalAlpha=0.06+Math.sin(t*0.5)*0.02;X.fillStyle='#c8dcff';X.beginPath();X.moveTo(bx2-15,fy-FH);X.lineTo(bx2+15,fy-FH);X.lineTo(bx2+20,fy);X.lineTo(bx2-20,fy);X.closePath();X.fill();X.globalAlpha=1}
      if(stage>=5){
        // Star map dots
        X.fillStyle='rgba(180,200,255,0.15)';for(let si=0;si<15;si++){const sx=TL+300+((si*277)%(TW-600));X.beginPath();X.arc(sx,fy-10-Math.sin(si*1.3)*8,1+Math.sin(t+si)*0.5,0,Math.PI*2);X.fill()}
        // Sky through ceiling aperture
        const ax=TL+TW*0.55-18;X.fillStyle='#0a0a20';X.fillRect(ax,fy-FH+1,36,FT+2);
        X.fillStyle='rgba(255,255,255,0.6)';for(let si2=0;si2<5;si2++){X.beginPath();X.arc(ax+6+si2*7,fy-FH+4+Math.sin(si2*2.3)*4,1,0,Math.PI*2);X.fill()}
      }
      break;
    case 9: // COMMAND — console, situation table, antenna, main screen, glows, radar, LEDs
      if(stage>=2){
        // Command console (C-shaped desk) — placed at x=-720 to clear stage 2 point at x=-450
        const cx9=TL+TW*0.3;X.fillStyle='#505058';X.fillRect(cx9,fy-34,100,6);X.fillRect(cx9,fy-34,6,34);X.fillRect(cx9+94,fy-34,6,34);
        // Situation table (ellipse)
        X.fillStyle='rgba(80,80,90,0.4)';X.beginPath();X.ellipse(TL+TW*0.5,fy-6,60,4,0,0,Math.PI*2);X.fill();
        // Comms antenna on ceiling
        X.strokeStyle='rgba(100,100,110,0.3)';X.lineWidth=2;const anx=TR-300;X.beginPath();X.moveTo(anx,fy-FH+FT);X.lineTo(anx,fy-FH+FT+25);X.stroke();X.beginPath();X.moveTo(anx-8,fy-FH+FT+10);X.lineTo(anx+8,fy-FH+FT+10);X.stroke();
      }
      if(stage>=3){
        // Main screen above desk
        const sx9=TL+TW*0.3+20;X.fillStyle='#303038';X.fillRect(sx9,fy-FH+20,60,30);X.globalAlpha=0.06;X.fillStyle='#00c8ff';X.beginPath();X.arc(sx9+30,fy-FH+35,25,0,Math.PI*2);X.fill();X.globalAlpha=1;
        // Screen glows
        X.globalAlpha=0.04;const cc=['#00c8ff','#00ff78','#ffc800'];for(let si=0;si<3;si++){X.fillStyle=cc[si];X.beginPath();X.arc(TL+400+si*600,fy-FH*0.5,35,0,Math.PI*2);X.fill()}X.globalAlpha=1;
      }
      if(stage>=4){const rx=TL+TW*0.7,ry=fy-FH*0.5,rr=30,sa=t*1.5;X.strokeStyle='rgba(0,255,120,0.15)';X.lineWidth=1;X.beginPath();X.arc(rx,ry,rr,0,Math.PI*2);X.stroke();X.strokeStyle='rgba(0,255,120,0.35)';X.lineWidth=2;X.beginPath();X.moveTo(rx,ry);X.lineTo(rx+Math.cos(sa)*rr,ry+Math.sin(sa)*rr);X.stroke();X.globalAlpha=0.1;X.fillStyle='rgba(0,255,120,1)';X.beginPath();X.moveTo(rx,ry);X.arc(rx,ry,rr,sa-0.5,sa);X.closePath();X.fill();X.globalAlpha=1}
      if(stage>=5){
        for(let fi=0;fi<9;fi++){const fs=S.buildout[fi].stage;X.fillStyle=fs>=5?'rgba(0,200,80,0.5)':fs>=1?'rgba(200,200,0,0.3)':'rgba(80,80,80,0.2)';X.beginPath();X.arc(TL+500+fi*22,fy-FH+20,3,0,Math.PI*2);X.fill()}
        drawKeeperDesk(X,_now,fy);
      }
      break;
  }
}

// ═══ DRAW: SCAFFOLDING ═══
function drawScaffold(sx,sy,sw,sh){
  X.strokeStyle='#707880';X.lineWidth=3;
  for(let vx=sx;vx<=sx+sw;vx+=60){X.beginPath();X.moveTo(vx,sy);X.lineTo(vx,sy+sh);X.stroke()}
  for(let hy=sy;hy<=sy+sh;hy+=FH){X.beginPath();X.moveTo(sx,hy);X.lineTo(sx+sw,hy);X.stroke()}
  X.strokeStyle='#606870';X.lineWidth=2;
  for(let hy=sy;hy<sy+sh;hy+=FH){
    for(let vx=sx;vx<sx+sw-30;vx+=60){
      X.beginPath();X.moveTo(vx,hy);X.lineTo(vx+60,hy+FH);X.stroke();
    }
  }
}

// ═══ CITY GENERATION ═══
function genCity(){
  const ir=(mn,mx)=>Math.floor(mn+Math.random()*(mx-mn+1));
  const WGX=14,WGY=16,WMG=9;
  const blds=[];
  let cx=-3000;
  while(cx<3000&&blds.length<100){
    const w=ir(40,140);
    const tall=Math.random()<0.08;
    const h=tall?ir(250,450):ir(60,260);
    const rv=ir(72,135),gv=ir(70,125),bv=ir(76,140);
    const col=`rgb(${rv},${gv},${bv})`;
    const cols=Math.max(1,Math.floor((w-WMG*2)/WGX));
    const rows=Math.max(1,Math.floor((h-18)/WGY));
    const wins=[];
    for(let wr=0;wr<rows;wr++)
      for(let wc=0;wc<cols;wc++)
        wins.push({wx:WMG+wc*WGX,wy:10+wr*WGY,lit:Math.random()<0.45,warm:Math.random()<0.6});
    blds.push({x:cx,w,h,col,wins,tall});
    cx+=w+ir(4,28);
  }
  S.cityBuildings=blds;
}

// ═══ OFFSCREEN CACHES (static layers drawn once, blitted per frame) ═══
function _buildCityCache(){
  if(!S.cityBuildings)return;
  const ox=-3200,oy=TB-480,w=6400,h=TB+25-oy;
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const cx=c.getContext('2d');cx.translate(-ox,-oy);
  const hg=cx.createLinearGradient(0,TB-180,0,TB);
  hg.addColorStop(0,'rgba(170,135,95,0)');hg.addColorStop(1,'rgba(170,135,95,0.22)');
  cx.fillStyle=hg;cx.fillRect(-3200,TB-180,6400,180);
  cx.fillStyle='#3a3a42';cx.fillRect(-3200,TB,6400,22);cx.fillStyle='#2e2e36';cx.fillRect(-3200,TB,6400,3);
  S.cityBuildings.forEach(b=>{
    const bx=b.x,by=TB-b.h;
    cx.fillStyle=b.col;cx.fillRect(bx,by,b.w,b.h);
    cx.fillStyle='rgba(0,0,0,0.2)';cx.fillRect(bx,by,b.w,4);
    cx.fillStyle='rgba(255,255,255,0.04)';cx.fillRect(bx,by,b.w,1);
    b.wins.forEach(wn=>{
      cx.fillStyle=wn.lit?(wn.warm?'rgba(255,215,120,0.72)':'rgba(150,195,255,0.58)'):'rgba(28,32,42,0.7)';
      cx.fillRect(bx+wn.wx,by+wn.wy,6,8);
    });
    if(b.tall){
      cx.fillStyle='rgba(68,70,80,0.9)';cx.fillRect(bx+b.w*0.12,by-15,b.w*0.32,15);cx.fillRect(bx+b.w*0.52,by-9,b.w*0.22,9);
      cx.strokeStyle='rgba(110,112,122,0.72)';cx.lineWidth=1.5;
      cx.beginPath();cx.moveTo(bx+b.w*0.74,by);cx.lineTo(bx+b.w*0.74,by-24);cx.stroke();
    }
  });
  _cityCache={c,ox,oy};
}

function _buildTreeCache(){
  const ox=TL-300,oy=TB-160,w=(TR+300)-ox,h=TB-oy+10;
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const cx=c.getContext('2d');cx.translate(-ox,-oy);
  const treeBase=TB;
  const cols=['#4a8a45','#3d7a3a','#5a9a50','#3a7030','#5a9855','#4a8540'];
  for(let tx=TL-200;tx<TR+200;tx+=28+Math.sin(tx*0.1)*12){
    const tH=80+Math.sin(tx*0.23)*40+Math.cos(tx*0.17)*20;
    const tW=30+Math.sin(tx*0.31)*12;
    const tc=cols[Math.abs(Math.floor(tx*0.1))%cols.length];
    cx.fillStyle='#6a5a40';cx.fillRect(tx-3,treeBase-tH*0.4,6,tH*0.4);
    cx.fillStyle=tc;cx.beginPath();cx.ellipse(tx,treeBase-tH*0.5,tW*0.6,tH*0.35,0,0,Math.PI*2);cx.fill();
    cx.fillStyle=tc+'cc';cx.beginPath();cx.ellipse(tx-4,treeBase-tH*0.65,tW*0.45,tH*0.22,0,0,Math.PI*2);cx.fill();
    cx.beginPath();cx.ellipse(tx+6,treeBase-tH*0.58,tW*0.35,tH*0.2,0,0,Math.PI*2);cx.fill();
  }
  cx.globalAlpha=0.4;
  for(let tx=TL-300;tx<TR+300;tx+=40+Math.sin(tx*0.07)*15){
    const tH=60+Math.sin(tx*0.19)*25;
    const tc=cols[Math.abs(Math.floor(tx*0.07))%cols.length];
    cx.fillStyle=tc;cx.beginPath();cx.ellipse(tx,treeBase-tH*0.3,22,tH*0.3,0,0,Math.PI*2);cx.fill();
  }
  _treeCache={c,ox,oy};
}

// ═══ DRAW: CARS ═══
function drawCar(cx,cy,col){
  X.fillStyle=col;X.beginPath();X.roundRect(cx-20,cy-16,40,12,3);X.fill();
  X.fillStyle=col;X.beginPath();X.roundRect(cx-12,cy-24,24,10,3);X.fill();
  X.fillStyle='rgba(140,200,230,0.6)';X.fillRect(cx-10,cy-22,9,7);X.fillRect(cx+1,cy-22,9,7);
  X.fillStyle='#222';X.beginPath();X.arc(cx-12,cy-3,5,0,Math.PI*2);X.fill();X.beginPath();X.arc(cx+12,cy-3,5,0,Math.PI*2);X.fill();
  X.fillStyle='#444';X.beginPath();X.arc(cx-12,cy-3,3,0,Math.PI*2);X.fill();X.beginPath();X.arc(cx+12,cy-3,3,0,Math.PI*2);X.fill();
}

// ═══ PARTICLES ═══
export function spawnParticles(wx,wy,count,color,opts={}){
  const spd=opts.speed||2,life=opts.life||60,sz=opts.size||3,spread=opts.spread||Math.PI*2,dir=opts.dir||-Math.PI/2,grav=opts.gravity||0;
  for(let i=0;i<count;i++){
    const a=dir-spread/2+Math.random()*spread,v=spd*(0.4+Math.random()*0.6);
    S.particles.push({x:wx+(Math.random()-0.5)*20,y:wy+(Math.random()-0.5)*20,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life,maxLife:life,color,size:sz*(0.6+Math.random()*0.8),gravity:grav});
  }
}
function updateAndDrawParticles(){
  for(let i=S.particles.length-1;i>=0;i--){
    const pt=S.particles[i];
    pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=pt.gravity||0;pt.vx*=0.98;pt.life--;
    if(pt.life<=0){S.particles.splice(i,1);continue}
    const a=pt.life/pt.maxLife;
    X.globalAlpha=a*0.8;X.fillStyle=pt.color;
    X.beginPath();X.arc(pt.x,pt.y,pt.size*a,0,Math.PI*2);X.fill();
  }
  X.globalAlpha=1;
}

// ═══ SCREEN FX ═══
export function triggerShake(intensity){S.fx.shake=Math.max(S.fx.shake,intensity)}
export function triggerFlash(color,intensity){S.fx.flash=Math.max(S.fx.flash,intensity||1);S.fx.flashColor=color||'#fff'}

// ═══ RGB DOOR (Floor 5, block 2) ═══
function drawRGBDoor(fy,_now2){
  const t=_now2*0.001;
  const doorX=TL+2*PG+PG*0.15,doorW=PG*0.7,doorH=FH*0.75;
  const doorY=fy-doorH;
  const cx=doorX+doorW/2,cy=doorY+doorH/2;
  // Glow from crack
  const pulse=Math.sin(t*Math.PI*0.5)*0.5+0.5;
  for(let i=4;i>=1;i--){
    const r=i*20+10;
    const a=(0.02+pulse*0.02)*(5-i)/4;
    X.fillStyle=`rgba(255,180,60,${a})`;
    X.beginPath();X.arc(cx,cy,r,0,Math.PI*2);X.fill();
  }
  // Light rectangle on floor (trapezoid)
  X.fillStyle=`rgba(255,200,80,${0.04+pulse*0.02})`;
  X.beginPath();X.moveTo(doorX+doorW*0.2,fy);X.lineTo(doorX+doorW*0.8,fy);X.lineTo(doorX+doorW*1.2,fy+4);X.lineTo(doorX-doorW*0.2,fy+4);X.closePath();X.fill();
  // Door surface
  X.fillStyle='#1A1015';
  X.beginPath();X.roundRect(doorX,doorY,doorW/2-1,doorH,2);X.fill();
  X.beginPath();X.roundRect(doorX+doorW/2+1,doorY,doorW/2-1,doorH,2);X.fill();
  // Center crack with glow
  X.fillStyle=`rgba(255,200,80,${0.3+pulse*0.3})`;
  X.fillRect(cx-1,doorY+4,2,doorH-8);
  // Gap underneath
  X.fillStyle=`rgba(255,200,80,${0.2+pulse*0.1})`;
  X.fillRect(doorX+4,fy-3,doorW-8,3);
  // Door frame
  X.strokeStyle='rgba(80,60,40,0.3)';X.lineWidth=2;
  X.strokeRect(doorX-2,doorY-2,doorW+4,doorH+4);
  // Floating particles
  const pts=S.rgbDoor.particles;
  while(pts.length<6)pts.push({x:cx+(Math.random()-0.5)*doorW*0.6,y:fy,life:Math.random()*120+60,maxLife:120+Math.random()*60,vx:(Math.random()-0.5)*0.3,vy:-0.3-Math.random()*0.5,col:Math.random()<0.5?'rgba(255,200,80,':'rgba(255,160,40,'});
  for(let i=pts.length-1;i>=0;i--){
    const p=pts[i];
    p.x+=p.vx;p.y+=p.vy;p.life--;
    if(p.life<=0){pts.splice(i,1);continue}
    const a=p.life/p.maxLife;
    X.fillStyle=p.col+`${a*0.5})`;
    X.beginPath();X.arc(p.x,p.y,1.5+a,0,Math.PI*2);X.fill();
  }
}
function drawRGBDoorText(cx,cy,_now2){
  const t=_now2*0.001;
  const lines=['The warmth is real. The door is not ready.','Something on the other side knows you\'re here.','You smell bread. And something else.','Not yet.','The door remembers everyone who stood here.'];
  const idx=Math.floor(t/4)%lines.length;
  const frac=(t/4)%1;
  let alpha=0;
  if(frac<0.15)alpha=frac/0.15;
  else if(frac<0.5)alpha=1;
  else if(frac<0.65)alpha=1-(frac-0.5)/0.15;
  alpha*=0.7;
  if(alpha<=0)return;
  X.save();
  X.globalAlpha=alpha;
  X.fillStyle='#FFD700';
  X.font='italic 11px monospace';X.textAlign='center';
  X.fillText(lines[idx],cx,cy);
  X.restore();
}

// ═══ RECKONING OVERLAY ═══
function drawReckoningOverlay(W,H,_now2){
  const rk=getReckoningState();
  if(rk.phase==='IDLE'||rk.phase==='DONE')return;
  const t=_now2*0.001;
  switch(rk.phase){
    case 'INTRO':{
      if(getIntroBlackout()>0){X.fillStyle='#000';X.fillRect(0,0,W,H);break}
      X.fillStyle='rgba(0,0,0,0.7)';X.fillRect(0,0,W,H);
      // Title
      X.fillStyle='#FF6600';X.font='bold 36px monospace';X.textAlign='center';
      X.fillText('THE RECKONING',W/2,H*0.18);
      // Typewriter briefing
      const br=getReckoningBriefing();
      const visText=br.text.substring(0,br.idx);
      X.fillStyle='rgba(255,255,255,0.7)';X.font='13px monospace';X.textAlign='left';
      const boxX=W*0.15,boxW=W*0.7;
      const words=visText.split(' ');
      let line='',ly=H*0.32;
      for(const w of words){
        const test=line+w+' ';
        if(X.measureText(test).width>boxW&&line){X.fillText(line.trim(),boxX,ly);ly+=20;line=w+' ';}
        else line=test;
      }
      if(line)X.fillText(line.trim(),boxX,ly);
      // Blinking cursor while typing
      if(!br.done){
        const blink=Math.sin(_now2*0.008)>0;
        if(blink){X.fillStyle='rgba(255,255,255,0.6)';X.fillText('\u2588',boxX+X.measureText(line).width,ly)}
        // Skip hint
        X.fillStyle='rgba(255,255,255,0.2)';X.font='10px monospace';X.textAlign='center';
        X.fillText('[E] skip',W/2,H*0.85);
      } else {
        // BEGIN prompt
        const pulse=0.5+Math.sin(_now2*0.005)*0.3;
        X.fillStyle=`rgba(255,102,0,${pulse})`;X.font='bold 18px monospace';X.textAlign='center';
        X.fillText('[E] BEGIN',W/2,H*0.82);
      }
      break;
    }
    case 'COUNTDOWN':{
      X.fillStyle='rgba(0,0,0,0.4)';X.fillRect(0,0,W,H);
      const sec=Math.ceil(rk.timer/60);
      const pulse=1+Math.sin(rk.timer*0.3)*0.1;
      X.save();X.translate(W/2,H/2);X.scale(pulse,pulse);
      X.fillStyle='#FFD700';X.font='bold 120px monospace';X.textAlign='center';X.textBaseline='middle';
      X.fillText(String(sec),0,0);
      X.restore();
      break;
    }
    case 'ACTIVE':{
      // Timer bar
      const barW=300,barH=12,barX=(W-barW)/2,barY=20;
      const frac=rk.timer/RK_ACTIVE_T;
      const urgent15=rk.timer<900,urgent5=rk.timer<300;
      X.fillStyle='rgba(0,0,0,0.4)';X.beginPath();X.roundRect(barX-2,barY-2,barW+4,barH+4,4);X.fill();
      const barCol=urgent5?'#ff0000':urgent15?'#ff3030':frac>0.25?'#FF6600':'#ff3030';
      X.fillStyle=barCol;X.beginPath();X.roundRect(barX,barY,barW*frac,barH,3);X.fill();
      // Time text — red + pulse in last 15s
      const secLeft=Math.ceil(rk.timer/60);
      if(urgent15){
        const tp=urgent5?0.6+Math.sin(t*8)*0.4:0.8+Math.sin(t*4)*0.2;
        X.fillStyle=`rgba(255,${urgent5?'50':'120'},${urgent5?'50':'80'},${tp})`;
        X.font=urgent5?'bold 13px monospace':'bold 11px monospace';
      } else {
        X.fillStyle='#fff';X.font='bold 10px monospace';
      }
      X.textAlign='center';
      X.fillText(`${secLeft}s`,W/2,barY+barH+14);
      // Scores — pulsing on change
      const total=3*BPF;
      const open=total-rk.bScore-rk.sScore;
      const sp=getScorePulse();
      const bScale=1+(sp.b/15)*0.3,sScale=1+(sp.s/15)*0.3;
      // Builder score
      X.save();
      X.translate(barX-80,barY+barH);X.scale(bScale,bScale);
      X.fillStyle=rk.builderColor||'#FF6600';X.font='bold 16px monospace';X.textAlign='center';
      X.fillText(`BUILDERS: ${rk.bScore}`,0,0);
      X.restore();
      // Suit score
      X.save();
      X.translate(barX+barW+80,barY+barH);X.scale(sScale,sScale);
      X.fillStyle='#3355cc';X.font='bold 16px monospace';X.textAlign='center';
      X.fillText(`SUITS: ${rk.sScore}`,0,0);
      X.restore();
      // Open blocks counter — prominent
      const openPulse=open<6?0.7+Math.sin(t*5)*0.3:0.5;
      X.fillStyle=`rgba(255,255,255,${openPulse})`;X.font=open<6?'bold 14px monospace':'bold 14px monospace';X.textAlign='center';
      X.fillText(`${open} OPEN`,W/2,barY+barH+30);
      break;
    }
    case 'FLOOD':{
      const pulse=0.15+Math.sin(t*3)*0.08;
      X.fillStyle=`rgba(255,170,40,${pulse})`;X.fillRect(0,0,W,H);
      X.fillStyle='#FFD700';X.font='bold 36px monospace';X.textAlign='center';
      X.fillText('THE TOWER FILLS',W/2,H/2);
      X.fillStyle='rgba(255,255,255,0.3)';X.font='14px monospace';
      X.fillText(`${getReckoningState().floodNpcs.length} new residents arriving...`,W/2,H/2+35);
      break;
    }
    case 'RESULT':{
      X.fillStyle='rgba(0,0,0,0.5)';X.fillRect(0,0,W,H);
      const winner=rk.outcome==='builders';
      X.fillStyle=winner?'#FF6600':'#3355cc';X.font='bold 42px monospace';X.textAlign='center';
      X.fillText(winner?'BUILDERS WIN!':'SUITS WIN!',W/2,H/2-10);
      X.fillStyle='rgba(255,255,255,0.5)';X.font='16px monospace';
      X.fillText(`${rk.bScore} - ${rk.sScore}`,W/2,H/2+30);
      break;
    }
    case 'COLOR_PICK':{
      X.fillStyle='rgba(0,0,0,0.6)';X.fillRect(0,0,W,H);
      X.fillStyle='#fff';X.font='bold 22px monospace';X.textAlign='center';
      X.fillText('CHOOSE YOUR COLOR',W/2,H*0.28);
      X.fillStyle='rgba(255,255,255,0.4)';X.font='13px monospace';
      X.fillText('This is how your territory looks on the tower.',W/2,H*0.34);
      // Color swatches
      const cp=getColorPickState();
      const swSize=36,swGap=12,totalW=cp.colors.length*(swSize+swGap)-swGap;
      const swStartX=(W-totalW)/2;
      for(let ci=0;ci<cp.colors.length;ci++){
        const sx=swStartX+ci*(swSize+swGap),sy=H*0.44;
        const sel=ci===cp.idx;
        if(sel){X.fillStyle='#fff';X.beginPath();X.roundRect(sx-4,sy-4,swSize+8,swSize+8,6);X.fill()}
        X.fillStyle=cp.colors[ci];X.beginPath();X.roundRect(sx,sy,swSize,swSize,4);X.fill();
        if(sel){X.strokeStyle='#000';X.lineWidth=2;X.beginPath();X.roundRect(sx,sy,swSize,swSize,4);X.stroke()}
      }
      // Navigation hint
      const pulse2=0.5+Math.sin(_now2*0.005)*0.3;
      X.fillStyle=`rgba(255,255,255,${pulse2})`;X.font='bold 14px monospace';X.textAlign='center';
      X.fillText('\u25C0 A/D \u25B6       [E] CONFIRM',W/2,H*0.62);
      break;
    }
  }
}

// ═══ REMATCH BELL (world space) ═══
function drawRematchBell(f8){
  if(f8.phase!=='DONE'||!f8.played||!f8.bellX)return;
  const bx=f8.bellX,by=TB-7*FH; // floor 8 slab Y
  const t=_now*0.001;
  // Post
  X.fillStyle='#606060';X.fillRect(bx-2,by-50,4,50);
  // Bell
  const swing=Math.sin(t*2)*0.15;
  X.save();X.translate(bx,by-50);X.rotate(swing);
  X.fillStyle='#c8a030';
  X.beginPath();X.moveTo(-8,0);X.quadraticCurveTo(-10,16,-12,20);X.lineTo(12,20);X.quadraticCurveTo(10,16,8,0);X.closePath();X.fill();
  // Clapper
  X.fillStyle='#806020';X.beginPath();X.arc(0,18,3,0,Math.PI*2);X.fill();
  X.restore();
}

// ═══ COLOR WHEEL STATION (world space) ═══
function drawColorWheel(){
  const rk=getReckoningState();
  if(!rk.played||rk.phase!=='DONE')return;
  const cw=getColorWheelPos();
  const wx=cw.x,wy=TB-cw.fi*FH;
  const t=_now*0.001;
  // Easel/stand
  X.fillStyle='#505050';X.fillRect(wx-1,wy-42,2,42);
  X.fillStyle='#505050';X.fillRect(wx-8,wy-2,16,2);
  // Color wheel disc (rotating)
  const r=14,cx=wx,cy=wy-42;
  X.save();X.translate(cx,cy);X.rotate(t*0.4);
  for(let ci=0;ci<RK_COLORS.length;ci++){
    const a0=(ci/RK_COLORS.length)*Math.PI*2,a1=((ci+1)/RK_COLORS.length)*Math.PI*2;
    X.fillStyle=RK_COLORS[ci];X.beginPath();X.moveTo(0,0);X.arc(0,0,r,a0,a1);X.closePath();X.fill();
  }
  // Center dot (current color)
  X.fillStyle=rk.builderColor||'#FF6600';X.beginPath();X.arc(0,0,5,0,Math.PI*2);X.fill();
  X.strokeStyle='rgba(0,0,0,0.3)';X.lineWidth=1;X.beginPath();X.arc(0,0,r,0,Math.PI*2);X.stroke();
  X.restore();
}

// ═══ DRAW ═══
export function draw(){
  const W=C.width,H=C.height;
  _now=performance.now();

  // Control room — completely replace the world render
  if(S.cr.active){
    X.save();
    drawControlRoom(X,W,H);
    drawCRDetailPanel(X,W,H);
    X.restore();
    return;
  }

  const eZoom=cZoom*(1+keeperZoom);
  const altFrac=Math.max(0,Math.min(1,(TB-S.cam.y)/(TB-TT)));
  updateAmbient(altFrac);

  // Sky gradient — recompute only when altitude changes meaningfully
  const altBand=Math.round(altFrac*100);
  if(!_cachedSkyGrad||altBand!==_cachedSkyAlt){
    _cachedSkyAlt=altBand;
    const sg=X.createLinearGradient(0,0,0,H);
    if(altFrac<0.5){
      const t=altFrac*2;
      sg.addColorStop(0,lerpColor('#A7C7E7','#6080B0',t));
      sg.addColorStop(0.3,lerpColor('#BDD4F0','#8090C0',t));
      sg.addColorStop(0.5,lerpColor('#DDD0EC','#9088B0',t));
      sg.addColorStop(0.7,lerpColor('#F0D2CE','#A090A8',t));
      sg.addColorStop(1,lerpColor('#FDF0D5','#C0B0A0',t));
    } else {
      const t=(altFrac-0.5)*2;
      sg.addColorStop(0,lerpColor('#6080B0','#1a1a3a',t));
      sg.addColorStop(0.2,lerpColor('#8090C0','#2a2050',t));
      sg.addColorStop(0.4,lerpColor('#9088B0','#3a2858',t));
      sg.addColorStop(0.6,lerpColor('#A090A8','#483060',t));
      sg.addColorStop(1,lerpColor('#C0B0A0','#201838',t));
    }
    _cachedSkyGrad=sg;
  }
  X.fillStyle=_cachedSkyGrad;X.fillRect(0,0,W,H);

  // Stars — batched into a single path
  if(altFrac>0.35){
    const starAlpha=Math.min(1,(altFrac-0.35)/0.4);
    X.fillStyle=`rgba(255,255,255,${starAlpha*0.7})`;
    X.beginPath();
    for(let si=0;si<80;si++){
      const sx2=(Math.sin(si*127.1+si*si*0.3)*0.5+0.5)*W;
      const sy2=(Math.cos(si*311.7+si*0.7)*0.5+0.5)*H*0.7;
      const sz=0.5+Math.sin(si*73.3)*1.2+Math.sin(_now*0.001+si)*0.3;
      X.moveTo(sx2+Math.max(0.3,sz),sy2);
      X.arc(sx2,sy2,Math.max(0.3,sz),0,Math.PI*2);
    }
    X.fill();
  }
  // Moon
  if(altFrac>0.3){
    const moonA=Math.min(1,(altFrac-0.3)/0.3);
    const mx2=W*0.82,my2=H*0.12;
    X.globalAlpha=moonA;
    const mg2=X.createRadialGradient(mx2,my2,0,mx2,my2,60);
    mg2.addColorStop(0,'rgba(220,220,255,0.15)');mg2.addColorStop(1,'rgba(220,220,255,0)');
    X.fillStyle=mg2;X.fillRect(mx2-60,my2-60,120,120);
    X.fillStyle='#e8e4e0';X.beginPath();X.arc(mx2,my2,22,0,Math.PI*2);X.fill();
    X.fillStyle=lerpColor('#1a1a3a','#201838',altFrac>0.7?1:0);
    X.beginPath();X.arc(mx2+10,my2-3,20,0,Math.PI*2);X.fill();
    X.fillStyle='rgba(180,175,170,0.2)';X.beginPath();X.arc(mx2-6,my2-4,4,0,Math.PI*2);X.fill();
    X.beginPath();X.arc(mx2-10,my2+6,3,0,Math.PI*2);X.fill();
    X.globalAlpha=1;
  }
  // Clouds
  if(altFrac>0.15&&altFrac<0.8){
    const cloudA=Math.min(0.35,(altFrac<0.5?altFrac-0.15:0.8-altFrac)*1.2);
    X.globalAlpha=cloudA;X.fillStyle='#fff';
    const cdrift=_now*0.003;
    for(let ci2=0;ci2<5;ci2++){
      const cx2=((ci2*W*0.28+cdrift*20+ci2*137)%((W+400)))-200;
      const cy2=H*0.15+ci2*H*0.08+Math.sin(ci2*2.3)*20;
      X.beginPath();X.ellipse(cx2,cy2,60+ci2*12,14+ci2*3,0,0,Math.PI*2);X.fill();
      X.beginPath();X.ellipse(cx2+30,cy2-5,40+ci2*8,10+ci2*2,0,0,Math.PI*2);X.fill();
      X.beginPath();X.ellipse(cx2-25,cy2+3,35+ci2*6,12+ci2*2,0,0,Math.PI*2);X.fill();
    }
    X.globalAlpha=1;
  }

  // Screen shake offset
  const shk=S.fx.shake;
  const shkX=shk>0?(Math.random()-0.5)*shk*2:0;
  const shkY=shk>0?(Math.random()-0.5)*shk*2:0;
  if(shk>0)S.fx.shake*=0.88;if(S.fx.shake<0.3)S.fx.shake=0;

  X.save();X.translate(W/2-S.cam.x*eZoom+shkX,H/2-S.cam.y*eZoom+shkY);X.scale(eZoom,eZoom);

  // Ground (cached — never changes)
  if(!_cachedGroundGrad){_cachedGroundGrad=X.createLinearGradient(0,TB,0,TB+100);_cachedGroundGrad.addColorStop(0,'#8AB880');_cachedGroundGrad.addColorStop(0.4,'#6AA070');_cachedGroundGrad.addColorStop(1,'#4A7858')}
  X.fillStyle=_cachedGroundGrad;X.fillRect(TL-UW,TB,TW+UW*2,800);

  // City layer — parallax 0.35×
  X.restore();
  X.save();
  X.translate(W/2-S.cam.x*eZoom*0.35+shkX,H/2-S.cam.y*eZoom+shkY);X.scale(eZoom,eZoom);
  // City skyline — cached offscreen, only blink LEDs drawn live
  if(_cityCache)X.drawImage(_cityCache.c,_cityCache.ox,_cityCache.oy);
  if(S.cityBuildings)S.cityBuildings.forEach(b=>{if(!b.tall)return;const bx=b.x,by=TB-b.h;const blink=Math.floor(_now/900+b.x*0.013)%2===0;X.fillStyle=blink?'rgba(255,50,50,0.9)':'rgba(255,50,50,0.15)';X.beginPath();X.arc(bx+b.w*0.74,by-26,2.5,0,Math.PI*2);X.fill()});
  X.restore();
  // Re-enter main camera so treeline's X.restore() exits correctly
  X.save();X.translate(W/2-S.cam.x*eZoom+shkX,H/2-S.cam.y*eZoom+shkY);X.scale(eZoom,eZoom);

  // Parallax treeline — cached offscreen
  X.restore();
  X.save();
  const pxFactor=0.6;
  X.translate(W/2-S.cam.x*eZoom*pxFactor+shkX,H/2-S.cam.y*eZoom+shkY);X.scale(eZoom,eZoom);
  if(_treeCache)X.drawImage(_treeCache.c,_treeCache.ox,_treeCache.oy);
  X.restore();
  // Re-apply main camera
  X.save();X.translate(W/2-S.cam.x*eZoom+shkX,H/2-S.cam.y*eZoom+shkY);X.scale(eZoom,eZoom);

  // Parking lots
  const pkW=300,pkY=TB;
  X.fillStyle='#808080';X.fillRect(TL-UW,pkY,pkW,FT);X.fillStyle='#707070';X.fillRect(TL-UW,pkY,pkW,2);
  X.strokeStyle='rgba(255,255,255,0.4)';X.lineWidth=1;X.setLineDash([]);
  for(let lx=TL-UW+30;lx<TL-UW+pkW;lx+=50){X.beginPath();X.moveTo(lx,pkY-30);X.lineTo(lx,pkY);X.stroke()}
  drawCar(TL-UW+55,pkY,'#c03030');drawCar(TL-UW+155,pkY,'#3050a0');drawCar(TL-UW+255,pkY,'#e0e0e0');
  X.fillStyle='#808080';X.fillRect(TR+UW-pkW,pkY,pkW,FT);X.fillStyle='#707070';X.fillRect(TR+UW-pkW,pkY,pkW,2);
  for(let lx=TR+UW-pkW+30;lx<TR+UW;lx+=50){X.strokeStyle='rgba(255,255,255,0.4)';X.beginPath();X.moveTo(lx,pkY-30);X.lineTo(lx,pkY);X.stroke()}
  drawCar(TR+UW-245,pkY,'#d0a020');drawCar(TR+UW-145,pkY,'#404040');

  // ═══ DYNAMIC ROOFTOP — follows build progress ═══
  const abf=getActiveBuildFloor();
  const dynRoofY=TB-(abf>=0?abf+1:NF)*FH;
  // Keep cranes and workers on the dynamic rooftop
  S.cranes.forEach(c=>{c.y=dynRoofY});
  S.workers.forEach(w=>{w.y=dynRoofY});

  // Scaffolding
  drawScaffold(TL-80,dynRoofY,80,TB-dynRoofY);
  drawScaffold(TR,dynRoofY,80,TB-dynRoofY);
  // Viewport culling bounds (world Y, with generous margin for slabs/ambient)
  const _vTop=S.cam.y-H/(2*eZoom)-FH*2,_vBot=S.cam.y+H/(2*eZoom)+FH*2;
  S.floors.forEach((f)=>{
    if(f.level<0)return;
    const i=f.level,stage=S.buildout[i].stage,fy=f.y;
    if(fy-FH>_vBot||fy<_vTop)return; // off-screen — skip entirely
    const th=FTHEME[i]||FTHEME[0];
    // Exterior ledge lines (steel) — only on built floors
    if(stage>=1){X.strokeStyle='rgba(100,110,130,0.35)';X.lineWidth=4;X.beginPath();X.moveTo(TL-UW,fy);X.lineTo(TL,fy);X.stroke();X.beginPath();X.moveTo(TR,fy);X.lineTo(TR+UW,fy);X.stroke()}

    for(let bi=0;bi<BPF;bi++){
      const bx=TL+bi*PG,isWin=isWinBlock(bi),isElev=isElevBlock(bi);
      // Build reveal animation — blocks ease in left-to-right, 10 frames apart
      const _rT=S.buildout[i].revealT,_bT=_rT-bi*10;
      // During stage 2+ upgrades, unswept blocks render at previous stage
      const _sweeping=_rT<BPF*10+40;
      const _stg=(stage>=2&&_sweeping&&_bT<0)?stage-1:stage;
      if(stage<=1){
        if(_bT<0){if(!(i===0&&isElev))continue}
        if(_bT<40&&_bT>=0){const _t=_bT/40;X.globalAlpha=1-Math.pow(1-_t,3)}
      }
      if(isElev){
        if(_stg>=1||i===0){
        // Elevator shaft — always on floor 1 (lobby), elsewhere on built floors
        const elevW=PG*0.5,elevX=bx+PG*0.25;
        const doorH=FH*0.65,doorY=fy-doorH;
        // Flanking walls
        const wallCol=_stg>=2?th.wall:th.dark;
        X.fillStyle=wallCol;X.fillRect(bx,fy-FH,PG*0.25,FH);X.fillRect(elevX+elevW,fy-FH,PG*0.25,FH);
        if(_stg>=2){X.fillStyle=th.accent;X.fillRect(bx,fy-FH,PG*0.25,FH);X.fillRect(elevX+elevW,fy-FH,PG*0.25,FH)}
        else{X.fillStyle='rgba(0,0,0,0.12)';X.fillRect(bx,fy-FH,PG*0.25,FH);X.fillRect(elevX+elevW,fy-FH,PG*0.25,FH)}
        // Shaft interior
        X.fillStyle='#0a0a12';X.fillRect(elevX,fy-FH-4,elevW,FH+8);
        // Guide rails
        X.strokeStyle='#686870';X.lineWidth=3;
        X.beginPath();X.moveTo(elevX+10,fy-FH-4);X.lineTo(elevX+10,fy+4);X.stroke();
        X.beginPath();X.moveTo(elevX+elevW-10,fy-FH-4);X.lineTo(elevX+elevW-10,fy+4);X.stroke();
        // Center cable
        X.strokeStyle='#606068';X.lineWidth=2;
        X.beginPath();X.moveTo(elevX+elevW/2,fy-FH-4);X.lineTo(elevX+elevW/2,fy+4);X.stroke();
        // Door frame
        X.strokeStyle='#808088';X.lineWidth=5;X.strokeRect(elevX+2,doorY-4,elevW-4,doorH+4);
        // Per-floor door state
        const isPlayerFloor=(i===S.player.cf);
        const isAnimFloor=(S.elevAnim!=='idle')&&(i===S.elevFrom||i===S.elevTo);
        const doorOpenAmount=(isPlayerFloor||isAnimFloor)?S.elevDoors:0;
        // Sliding doors (clipped to shaft)
        X.save();X.beginPath();X.rect(elevX,doorY,elevW,doorH);X.clip();
        const doorSlide=doorOpenAmount*(elevW/2-2);
        const doorCol=_stg>=2?'#909098':'#606068';
        X.fillStyle=doorCol;X.fillRect(elevX-doorSlide,doorY,elevW/2,doorH);
        X.fillStyle='#808088';X.fillRect(elevX-doorSlide+elevW/2-1,doorY,2,doorH);
        X.fillStyle=doorCol;X.fillRect(elevX+elevW/2+doorSlide,doorY,elevW/2,doorH);
        X.restore();
        // Interior detail when doors open
        if(doorOpenAmount>0.3){X.fillStyle='#14141e';X.fillRect(elevX+4,doorY+2,elevW-8,doorH-4);X.strokeStyle='#505058';X.lineWidth=2;X.beginPath();X.moveTo(elevX+8,doorY+doorH*0.55);X.lineTo(elevX+elevW-8,doorY+doorH*0.55);X.stroke()}
        // Floor indicator
        X.fillStyle=_stg>=3?'rgba(60,50,20,0.8)':'rgba(20,20,25,0.8)';
        X.beginPath();X.roundRect(elevX+elevW/2-18,fy-FH+4,36,14,2);X.fill();
        if(_stg>=3){X.fillStyle='rgba(255,200,80,0.7)';X.font='bold 9px monospace';X.textAlign='center';X.fillText(`F${i+1}`,elevX+elevW/2,fy-FH+14)}
        else{X.fillStyle='rgba(80,80,90,0.5)';X.font='bold 9px monospace';X.textAlign='center';X.fillText(`F${i+1}`,elevX+elevW/2,fy-FH+14)}
        // Call button
        if(_stg>=3){X.fillStyle='#404048';X.beginPath();X.arc(elevX+elevW+12,fy-FH*0.45,5,0,Math.PI*2);X.fill();if(doorOpenAmount>0.5){X.fillStyle='rgba(255,215,0,0.15)';X.beginPath();X.arc(elevX+elevW+12,fy-FH*0.45,10,0,Math.PI*2);X.fill()}X.fillStyle=doorOpenAmount>0.5?'#ffd700':'#606068';X.beginPath();X.arc(elevX+elevW+12,fy-FH*0.45,3.5,0,Math.PI*2);X.fill()}
        } // end stage>=1 elevator gate
      } else if(isWin){
        // Windows — progressive visibility
        if(_stg>=2){
          X.fillStyle='rgba(160,205,235,0.1)';X.fillRect(bx,fy-FH,PG,FH);
          X.strokeStyle='rgba(80,120,150,0.4)';X.lineWidth=3;
          X.strokeRect(bx+4,fy-FH+4,PG-8,FH-8);
          X.lineWidth=2.5;X.beginPath();X.moveTo(bx+PG/2,fy-FH+4);X.lineTo(bx+PG/2,fy-4);X.stroke();
          X.beginPath();X.moveTo(bx+4,fy-FH/2);X.lineTo(bx+PG-4,fy-FH/2);X.stroke();
          if(_stg>=3){X.fillStyle='rgba(200,230,255,0.05)';X.fillRect(bx+6,fy-FH+6,PG*0.35,FH*0.4)}
        } else if(_stg===1){
          X.globalAlpha=0.3;
          X.fillStyle='rgba(60,80,100,0.06)';X.fillRect(bx,fy-FH,PG,FH);
          X.strokeStyle='rgba(60,80,100,0.15)';X.lineWidth=3;X.strokeRect(bx+4,fy-FH+4,PG-8,FH-8);
          X.globalAlpha=1;
        } else {
          // Empty — no windows on unbuilt floors
        }
      } else {
        // Solid wall blocks — staged texture
        drawWallBlock(bx,fy,_stg,th,bi,i);
      }
      // Upgrade highlight sweep — marks the moment each block upgrades
      if(stage>=2 && _bT>=0 && _bT<20){
        const _ht=1-_bT/20;
        X.fillStyle=`rgba(255,255,255,${_ht*0.15})`;
        X.fillRect(bx,fy-FH,PG,FH);
      }
      X.globalAlpha=1;
      // Reckoning block ownership tint
      const _rkState=getReckoningState();
      if(_rkState.played||isReckoningActive()){
        const _claim=_rkState.map[i]?.[bi];
        const _rkDuring=isReckoningActive();
        const _bCol=_rkState.builderColor||'#FF6600';
        if(_claim===1){
          // Builder claim — use custom color if set
          const _r=parseInt(_bCol.slice(1,3),16),_g=parseInt(_bCol.slice(3,5),16),_b=parseInt(_bCol.slice(5,7),16);
          X.fillStyle=`rgba(${_r},${_g},${_b},${_rkDuring?0.35:0.25})`;X.fillRect(bx,fy-FH,PG,FH);
          // Border accent on claimed blocks
          X.fillStyle=`rgba(${_r},${_g},${_b},${_rkDuring?0.5:0.35})`;X.fillRect(bx,fy-FH,PG,2);X.fillRect(bx,fy-2,PG,2);
        } else if(_claim===2){
          X.fillStyle=`rgba(51,85,204,${_rkDuring?0.4:0.3})`;X.fillRect(bx,fy-FH,PG,FH);
          X.fillStyle=`rgba(51,85,204,${_rkDuring?0.55:0.4})`;X.fillRect(bx,fy-FH,PG,2);X.fillRect(bx,fy-2,PG,2);
        }
        // Block flash on claim (white slam → team color)
        if(_rkDuring){
          const _fl=getBlockFlash(i,bi);
          if(_fl){
            const _ft=_fl.t/15; // 1→0
            if(_ft>0.6){X.fillStyle=`rgba(255,255,255,${(_ft-0.6)*1.5})`;X.fillRect(bx,fy-FH,PG,FH)}
            else{
              const _fc=_fl.team===1?_bCol:'#3355cc';
              const _fr2=parseInt(_fc.slice(1,3),16),_fg2=parseInt(_fc.slice(3,5),16),_fb2=parseInt(_fc.slice(5,7),16);
              X.fillStyle=`rgba(${_fr2},${_fg2},${_fb2},${_ft*0.5})`;X.fillRect(bx,fy-FH,PG,FH);
            }
          }
          // Suit claim warning — pulse blue border when >50% claimed
          if(_claim===0){
            const _scp=getSuitClaimProgress(i,bi);
            if(_scp>0.5){
              const _wp=0.2+Math.sin(_now*0.01)*0.15;
              X.strokeStyle=`rgba(51,85,204,${_wp})`;X.lineWidth=2;X.strokeRect(bx+1,fy-FH+1,PG-2,FH-2);
            }
          }
        }
      }
    }
    // Ceiling & edge depth — makes floors feel enclosed
    if(stage>=1){
      X.fillStyle='rgba(0,0,0,0.06)';X.fillRect(TL,fy-FH,TW,6);
      if(stage>=3){X.fillStyle='rgba(0,0,0,0.03)';X.fillRect(TL,fy-FH+6,TW,10)}
      X.fillStyle='rgba(0,0,0,0.04)';X.fillRect(TL,fy-12,TW,12);
    }
    // Cascade helper: is the sweep active and has it reached this x-position?
    const _rTL=S.buildout[i].revealT,_swL=_rTL<BPF*10+40;
    function _swept(lx){if(!_swL)return true;const _bi=Math.max(0,Math.min(BPF-1,Math.floor((lx-TL)/PG)));return _rTL-_bi*10>=0}
    // Window light shafts — appear at stage 2, cascade only when stage 2 is the new stage
    if(stage>=2){
      const shaftA=stage>=3?0.04:0.025;
      for(let bi2=0;bi2<BPF;bi2++){
        if(!isWinBlock(bi2))continue;
        if(stage===2&&!_swept(TL+bi2*PG))continue; // cascade on first appearance only
        const wx=TL+bi2*PG+PG/2;
        X.fillStyle=`rgba(220,235,255,${shaftA})`;
        X.beginPath();
        X.moveTo(wx-10,fy-FH*0.5);X.lineTo(wx+10,fy-FH*0.5);
        X.lineTo(wx+30,fy);X.lineTo(wx-30,fy);
        X.closePath();X.fill();
      }
    }
    // Wall sconces — fixtures appear dark at stage 2 (Structure), light up at stage 3 (Systems)
    if(stage>=2){for(let lx=TL+180;lx<TR;lx+=280){
      const isNew2=stage===2,isNew3=stage===3;
      if(isNew2&&!_swept(lx))continue; // fixture cascades in at stage 2
      // Fixture hardware (always drawn once stage 2+)
      X.fillStyle='#333';X.fillRect(lx,fy-FH,2,38);X.fillStyle=stage>=3?'#b08d5c':'#555';X.beginPath();X.arc(lx+1,fy-FH+38,7,Math.PI,0);X.fill();
      // Glow — only at stage 3+, cascaded when stage 3 is new
      if(stage>=3){
        if(isNew3&&!_swept(lx))continue;
        X.fillStyle='rgba(255,235,160,0.08)';X.beginPath();X.arc(lx+1,fy-FH+55,50,0,Math.PI*2);X.fill();
        X.fillStyle='rgba(255,235,160,0.12)';X.beginPath();X.arc(lx+1,fy-FH+50,30,0,Math.PI*2);X.fill();
        X.fillStyle='rgba(255,235,160,0.2)';X.beginPath();X.arc(lx+1,fy-FH+44,12,0,Math.PI*2);X.fill();
      }
    }}
    // Emergency lights — appear at stage 1, stay through stage 2, cascade only at stage 1
    if(stage>=1&&stage<3){for(let lx=TL+300;lx<TR;lx+=400){
      if(stage===1&&!_swept(lx))continue; // cascade on first appearance only
      X.fillStyle='rgba(255,60,30,0.04)';X.beginPath();X.arc(lx,fy-FH+10,25,0,Math.PI*2);X.fill();X.fillStyle='rgba(255,60,30,0.08)';X.beginPath();X.arc(lx,fy-FH+10,12,0,Math.PI*2);X.fill();X.fillStyle='rgba(255,60,30,0.15)';X.beginPath();X.arc(lx,fy-FH+10,4,0,Math.PI*2);X.fill()}}
    // Floor slab — stage 0 ghostly, stage 1 dim, stage 2+ full
    if(stage>=1){
      const slabA=stage===1?0.6:1;
      X.globalAlpha=slabA;
      X.fillStyle='#8f8c85';X.fillRect(TL,fy,TW,FT);X.fillStyle='#a09e98';X.fillRect(TL,fy,TW,2);
      // Theme tinting on slab
      X.fillStyle=th.accent;X.fillRect(TL,fy,TW,FT);
      // Construction joints — vertical lines at pillar spacing
      X.strokeStyle='rgba(0,0,0,0.08)';X.lineWidth=1;
      X.beginPath();for(let jx=TL+PG;jx<TR;jx+=PG){X.moveTo(jx,fy);X.lineTo(jx,fy+FT)}X.stroke();
      X.globalAlpha=1;
    } else {
      // Stage 0 — faint slab outline + sparse joints
      X.globalAlpha=0.12;X.fillStyle='#8f8c85';X.fillRect(TL,fy,TW,FT);
      X.strokeStyle='rgba(0,0,0,0.06)';X.lineWidth=1;
      X.beginPath();for(let jx=TL+PG*2;jx<TR;jx+=PG*2){X.moveTo(jx,fy);X.lineTo(jx,fy+FT)}X.stroke();
      X.globalAlpha=1;
    }
    // Pillars — stage 1+
    if(stage>=1){X.globalAlpha=stage===1?0.4:1;X.fillStyle='#7a766f';for(let px=TL+PG;px<TR;px+=PG)X.fillRect(px-5,fy-FH,10,FH);X.globalAlpha=1}
    // Floor label + dot — stage 1+ only
    if(stage>=1){
      const lblA=stage>=5?0.55:0.35;
      X.fillStyle=`rgba(60,50,40,${lblA})`;X.font='11px monospace';X.textAlign='left';X.fillText(`F${i+1} ${FD[i].name}`,TL+36,fy-FH/2+4);
      const dotCol=stage>=5?'rgba(0,180,80,0.55)':'rgba(180,160,40,0.45)';
      X.fillStyle=dotCol;X.beginPath();X.arc(TL+25,fy-FH/2,5,0,Math.PI*2);X.fill();
      if(stage<5){X.fillStyle='rgba(180,160,40,0.35)';X.font='8px monospace';X.fillText(`${stage}/5`,TL+36,fy-FH/2+14)}
    }
    // Floor-specific ambient life
    drawFloorLife(i,stage,fy);
    // Construction atmosphere (color temp, dust, tape)
    drawConstructionAtmosphere(i,stage,fy);
    // Placed modules — stage 5 only
    if(stage>=5){
      for(let bi=0;bi<BPF;bi++){
        if(isWinBlock(bi)||isElevBlock(bi))continue;
        const mod=S.modules[i]?S.modules[i][bi]:null;
        if(mod)drawMod(mod,TL+bi*PG,fy,bi,i);
      }
    }
    // Reckoning: darken non-contested floors to spotlight the action
    if(isReckoningActive()&&(i<RK_FLOOR_MIN||i>RK_FLOOR_MAX)&&stage>=1){
      X.fillStyle='rgba(0,0,0,0.55)';X.fillRect(TL,fy-FH,TW,FH);
    }
  });

  // Side walls — per-floor, stage 1+ only (steel finish)
  for(let si=0;si<NF;si++){
    if(S.buildout[si].stage<1)continue;
    const sfy=TB-(si*FH);
    if(sfy-FH>_vBot||sfy<_vTop)continue;
    if(si===0){
      // Floor 0 — industrial doors on both sides
      const doorH=75,doorFW=20;
      const doorYL=sfy-doorH,doorYR=sfy-doorH;
      // Wall above each door
      const wallAboveH=FH-doorH;
      // Left wall above door
      X.fillStyle='rgba(130,140,155,0.25)';X.fillRect(TL-FT,sfy-FH,FT,wallAboveH);
      X.fillStyle='rgba(90,100,120,0.45)';X.fillRect(TL-3,sfy-FH,3,wallAboveH);
      // Right wall above door
      X.fillStyle='rgba(130,140,155,0.25)';X.fillRect(TR,sfy-FH,FT,wallAboveH);
      X.fillStyle='rgba(90,100,120,0.45)';X.fillRect(TR,sfy-FH,3,wallAboveH);
      // ── Left door ──
      const openL=S.door.open*doorH;
      // Frame
      X.fillStyle='#505860';X.fillRect(TL-doorFW/2-1,doorYL-3,doorFW+2,doorH+3);
      // Panel (slides up)
      const panelHL=doorH-openL;
      if(panelHL>1){
        X.fillStyle='#404850';X.fillRect(TL-doorFW/2,doorYL,doorFW,panelHL);
        // Center seam (double-door look)
        X.fillStyle='#353d45';X.fillRect(TL-1,doorYL,2,panelHL);
        // Warning stripe at bottom
        const stripeY=doorYL+panelHL-6;
        if(panelHL>10){for(let sx=0;sx<doorFW;sx+=6){X.fillStyle=(Math.floor(sx/6)%2)?'rgba(255,180,0,0.25)':'rgba(0,0,0,0.15)';X.fillRect(TL-doorFW/2+sx,stripeY,3,4)}}
        // Handle
        if(panelHL>20){X.fillStyle='#808890';X.fillRect(TL+doorFW/2-4,doorYL+panelHL-18,3,10)}
      }
      // ── Right door ──
      const openR=S.door.openR*doorH;
      X.fillStyle='#505860';X.fillRect(TR-doorFW/2-1,doorYR-3,doorFW+2,doorH+3);
      const panelHR=doorH-openR;
      if(panelHR>1){
        X.fillStyle='#404850';X.fillRect(TR-doorFW/2,doorYR,doorFW,panelHR);
        X.fillStyle='#353d45';X.fillRect(TR-1,doorYR,2,panelHR);
        const stripeYR=doorYR+panelHR-6;
        if(panelHR>10){for(let sx=0;sx<doorFW;sx+=6){X.fillStyle=(Math.floor(sx/6)%2)?'rgba(255,180,0,0.25)':'rgba(0,0,0,0.15)';X.fillRect(TR-doorFW/2+sx,stripeYR,3,4)}}
        if(panelHR>20){X.fillStyle='#808890';X.fillRect(TR-doorFW/2-1,doorYR+panelHR-18,3,10)}
      }
    } else {
      X.fillStyle='rgba(130,140,155,0.25)';X.fillRect(TL-FT,sfy-FH,FT,FH);X.fillStyle='rgba(90,100,120,0.45)';X.fillRect(TL-3,sfy-FH,3,FH);
      X.fillStyle='rgba(130,140,155,0.25)';X.fillRect(TR,sfy-FH,FT,FH);X.fillStyle='rgba(90,100,120,0.45)';X.fillRect(TR,sfy-FH,3,FH);
    }
  }

  // Rooftop — rendered at dynamic height
  X.fillStyle='#8f8c85';X.fillRect(TL,dynRoofY,TW,FT);X.fillStyle='#a09e98';X.fillRect(TL,dynRoofY,TW,2);
  X.strokeStyle='rgba(200,180,80,0.5)';X.lineWidth=3;X.beginPath();X.moveTo(TL,dynRoofY-30);X.lineTo(TR,dynRoofY-30);X.stroke();
  X.strokeStyle='rgba(200,180,80,0.3)';X.lineWidth=2;X.beginPath();X.moveTo(TL,dynRoofY-15);X.lineTo(TR,dynRoofY-15);X.stroke();
  for(let rx=TL;rx<=TR;rx+=120){X.fillStyle='rgba(180,160,60,0.4)';X.fillRect(rx-2,dynRoofY-30,4,30)}
  X.fillStyle='#a09880';X.fillRect(TL+80,dynRoofY-12,50,12);X.fillStyle='#708090';X.fillRect(TL+160,dynRoofY-18,30,18);
  S.cranes.forEach(c=>drawCrane(c.x,c.y,c.angle||0));
  X.fillStyle='rgba(255,200,40,0.7)';X.beginPath();X.roundRect(TL+TW/2-80,dynRoofY-50,160,28,4);X.fill();
  X.fillStyle='#2a2010';X.font='bold 11px monospace';X.textAlign='center';X.fillText('\u26A0 UNDER CONSTRUCTION \u26A0',TL+TW/2,dynRoofY-32);
  X.fillStyle='#2c2e33';X.fillRect(TL-FT,dynRoofY-FT,TW+FT*2,FT);

  // Boundary
  const bOp=0.2+Math.sin(_now*0.003)*0.12;X.strokeStyle=`rgba(180,160,80,${bOp})`;X.lineWidth=4;X.setLineDash([24,16]);
  X.beginPath();X.moveTo(TL-UW,dynRoofY-400);X.lineTo(TL-UW,TB+100);X.moveTo(TR+UW,dynRoofY-400);X.lineTo(TR+UW,TB+100);X.stroke();X.setLineDash([]);

  // Stairs — only between floors with stage >= 2
  S.stairs.forEach(st=>{if(S.buildout[st.ff].stage<2||S.buildout[st.tf].stage<2)return;X.strokeStyle='rgba(96,125,139,0.5)';X.lineWidth=4;X.beginPath();X.moveTo(st.bx,st.by);X.lineTo(st.tx,st.ty);X.stroke();
    X.fillStyle='#455a64';for(let i=0;i<=14;i++){const px=st.bx+(st.tx-st.bx)*(i/14),py=st.by+(st.ty-st.by)*(i/14);X.fillRect(px-12,py-4,24,5)}
    X.strokeStyle='rgba(80,90,100,0.4)';X.lineWidth=2;X.beginPath();X.moveTo(st.bx-14,st.by-30);X.lineTo(st.tx-14,st.ty-30);X.stroke();X.beginPath();X.moveTo(st.bx+14,st.by-30);X.lineTo(st.tx+14,st.ty-30);X.stroke()});

  // ═══ BUILD INTERACTION POINT (blue ↔ yellow oscillation) ═══
  if(abf>=0){
    const stg=S.buildout[abf].stage;
    if(stg<5){
      const sd=STAGES[abf][stg];
      const ipx=sd.x;
      const ipy=TB-(abf*FH); // floor slab y
      const cy=ipy-FH/2; // center y of floor
      const pulse=Math.sin(_now*0.004)*0.3+0.7;
      const pulse2=Math.sin(_now*0.003)*0.5+0.5;
      // Oscillating color: blue (60,140,255) ↔ yellow (255,215,0)
      const osc=Math.sin(_now*0.003)*0.5+0.5;
      const cR=Math.round(60+195*osc),cG=Math.round(140+75*osc),cB=Math.round(255-255*osc);

      // Vertical beam — floor to ceiling
      const beamW=8+pulse2*6;
      const beamGrad=X.createLinearGradient(ipx,ipy-FH,ipx,ipy);
      beamGrad.addColorStop(0,`rgba(${cR},${cG},${cB},0)`);
      beamGrad.addColorStop(0.3,`rgba(${cR},${cG},${cB},${0.35*pulse})`);
      beamGrad.addColorStop(0.5,`rgba(${cR},${cG},${cB},${0.55*pulse})`);
      beamGrad.addColorStop(0.7,`rgba(${cR},${cG},${cB},${0.35*pulse})`);
      beamGrad.addColorStop(1,`rgba(${cR},${cG},${cB},0)`);
      X.fillStyle=beamGrad;X.fillRect(ipx-beamW/2,ipy-FH,beamW,FH);

      // Large radial glow
      const glow=X.createRadialGradient(ipx,cy,0,ipx,cy,100);
      glow.addColorStop(0,`rgba(${cR},${cG},${cB},${0.8*pulse})`);
      glow.addColorStop(0.4,`rgba(${cR},${cG},${cB},${0.4*pulse})`);
      glow.addColorStop(1,`rgba(${cR},${cG},${cB},0)`);
      X.fillStyle=glow;X.fillRect(ipx-100,cy-100,200,200);

      // Pulsing ring at center
      X.strokeStyle=`rgba(${cR},${cG},${cB},${0.8*pulse})`;X.lineWidth=3;
      X.beginPath();X.arc(ipx,cy,20+pulse2*10,0,Math.PI*2);X.stroke();

      // Diamond marker
      X.fillStyle=`rgba(${cR},${cG},${cB},${1.0})`;
      X.beginPath();X.moveTo(ipx,cy-16);X.lineTo(ipx+10,cy);X.lineTo(ipx,cy+16);X.lineTo(ipx-10,cy);X.closePath();X.fill();

      // Label
      X.fillStyle=`rgba(${cR},${cG},${cB},${1.0})`;X.font='bold 12px monospace';X.textAlign='center';
      X.fillText(sd.label,ipx,cy+32);

      // Directional arrow — show when player is on the active floor but far from point
      const p2=S.player;
      if(p2.cf===abf&&Math.abs(p2.x-ipx)>120){
        const dir=ipx>p2.x?1:-1;
        const ax=p2.x+dir*50;
        const ay=p2.y-p2.h-30;
        const aw=14,ah=10;
        X.fillStyle=`rgba(${cR},${cG},${cB},${0.9})`;
        X.beginPath();
        if(dir>0){X.moveTo(ax+aw,ay);X.lineTo(ax,ay-ah/2);X.lineTo(ax,ay+ah/2)}
        else{X.moveTo(ax-aw,ay);X.lineTo(ax,ay-ah/2);X.lineTo(ax,ay+ah/2)}
        X.closePath();X.fill();
        X.font='bold 10px monospace';X.textAlign='center';
        X.fillText(sd.label,ax+(dir>0?-5:5),ay-12);
      }
    }
  }

  // Objects — stage 4+
  S.objs.forEach(o=>{if(S.buildout[o.floor].stage<4)return;X.fillStyle='rgba(0,0,0,0.04)';X.beginPath();X.ellipse(o.x+o.width/2,o.y,o.width/2+3,3,0,0,Math.PI*2);X.fill();X.fillStyle=o.c;X.beginPath();X.roundRect(o.x,o.y-o.height,o.width,o.height,4);X.fill();X.fillStyle='rgba(255,255,255,0.12)';X.fillRect(o.x+1,o.y-o.height+1,o.width-2,3)});
  // Suits — stage 5+
  S.suits.forEach(s=>{if(s.taken||S.buildout[s.floor].stage<5)return;const bob=Math.sin(_now*0.002+s.x)*2;X.fillStyle='rgba(80,70,100,0.45)';X.beginPath();X.roundRect(s.x-10,s.y-44+bob,20,32,6);X.fill()});

  // Keeper glow (behind all characters)
  drawKeeperGlow(X,_now);

  // NPCs — arrived or in transit, and only once tower has 3+ floors built
  const npcsOn=abf>=3||abf===-1;
  const al=[],ca=[],bz=[],cw=[];
  S.npcs.forEach(n=>{
    if(n._hidden)return; // Gene hidden during reckoning
    if(n.arrState==='queue'||n.arrState==='riding')return; // invisible
    if(n.arrived&&S.buildout[n.floor].stage<5)return;       // normal gate
    if(!npcsOn)return;
    if(n.type==='a')al.push(n);
    else if(n.type==='c')ca.push(n);
    else if(n.type==='w')cw.push(n);
    else bz.push(n);
  });
  al.forEach(n=>drawBlob(n,false,true));
  ca.forEach(n=>drawCasual(n));
  bz.forEach(n=>drawBiz(n));
  cw.forEach(n=>drawWorker(n));
  S.workers.forEach(w=>drawWorker(w));

  // Reckoning NPCs — visible during INTRO (silhouettes through overlay) and ACTIVE+
  const _rk=getReckoningState();
  const _rkShow=isReckoningActive()||_rk.phase==='INTRO';
  if(_rkShow){
    _rk.builders.forEach(n=>{if(!n.travelTimer)drawWorker(n)});
    _rk.suits.forEach(n=>{if(!n.travelTimer)drawBiz(n)});
    // Floor leaders — workers with gold star
    _rk.floorLeaders.forEach(n=>{
      drawWorker(n);
      X.fillStyle='#FFD700';X.font='bold 10px monospace';X.textAlign='center';
      X.fillText('\u2605',n.x,n.y-56);
    });
    // Suit targeting lines (ACTIVE only)
    if(_rk.phase==='ACTIVE'){
      X.save();X.setLineDash([4,6]);X.lineWidth=1;X.strokeStyle='rgba(51,85,204,0.15)';
      _rk.suits.forEach(s=>{
        if(s.travelTimer>0||s.targetBi<0)return;
        const tx=TL+s.targetBi*PG+PG/2,ty=TB-(s.fi*FH)-FH/2;
        const bob=Math.sin(s.bob)*2;
        X.beginPath();X.moveTo(s.x,s.y-24+bob);X.lineTo(tx,ty);X.stroke();
      });
      X.setLineDash([]);X.restore();
    }
    // Flood NPCs (fade-in)
    _rk.floodNpcs.forEach(n=>{
      X.save();X.globalAlpha=n.alpha||0;
      if(n.type==='b')drawBiz(n);else drawWorker(n);
      X.restore();
    });
  }

  // Keeper character
  drawKeeper(X,_now);

  // Rematch bell + color wheel
  drawRematchBell(_rk);
  drawColorWheel();

  // Player (fade during elevator door animation)
  const p=S.player;if(S.elevAnim!=='idle')X.globalAlpha=Math.max(0,S.elevDoors);
  if(p.suit)drawBlob({...p,color:p.suitC},true,true);else drawPlayerWorker(p);
  X.globalAlpha=1;
  // Wall slide dust (use player position to find nearest wall)
  if(p.wallSlide){
    const wx=p.x<0?TL:TR,wside=p.x<0?-1:1;
    for(let di=0;di<3;di++){
      const dy=p.y-Math.random()*40,dx=wx+wside*(Math.random()*6);
      const da=0.15+Math.random()*0.15;
      X.fillStyle=`rgba(180,170,150,${da})`;X.beginPath();X.arc(dx,dy,1.5+Math.random()*2,0,Math.PI*2);X.fill();
    }
  }

  // Player claiming ring + progress bar (reckoning)
  if(_rk.phase==='ACTIVE'&&_rk.claimTimer>0&&_rk.claimBi>=0){
    const _cx=TL+_rk.claimBi*PG,_cy=TB-(_rk.claimFi*FH);
    const _prog=_rk.claimTimer/150;
    const _ringCol=_rk.builderColor||'#FF6600';
    const _rr=parseInt(_ringCol.slice(1,3),16),_rg=parseInt(_ringCol.slice(3,5),16),_rb=parseInt(_ringCol.slice(5,7),16);
    // Thinner ring around player
    X.strokeStyle=`rgba(${_rr},${_rg},${_rb},0.8)`;X.lineWidth=3;
    X.beginPath();X.arc(p.x,p.y-24,22,-Math.PI/2,-Math.PI/2+_prog*Math.PI*2);X.stroke();
    // Progress bar at block bottom
    X.save();
    X.shadowColor=`rgba(${_rr},${_rg},${_rb},0.5)`;X.shadowBlur=6;
    X.fillStyle=`rgba(${_rr},${_rg},${_rb},0.7)`;
    X.fillRect(_cx,_cy-4,PG*_prog,4);
    X.restore();
  }

  // Charge bars
  if(p.isChg&&p.chgT>0){const t=p.chgT/CHG_MX,bh=40,bw=6,bx2=p.x+18,by2=p.y-60;X.fillStyle='rgba(0,0,0,0.35)';X.beginPath();X.roundRect(bx2-1,by2-1,bw+2,bh+2,3);X.fill();X.fillStyle=`rgb(255,${Math.round(255-t*100)},${Math.round(Math.max(0,255-t*200))})`;X.beginPath();X.roundRect(bx2,by2+bh-bh*t,bw,bh*t,2);X.fill();X.fillStyle='#fff';X.font='bold 10px monospace';X.textAlign='center';X.fillText(`${1+Math.floor(t*2)}F\u25B2`,bx2+bw/2,by2-6)}
  if(p.isDrp&&p.drpT>0){const t=p.drpT/DROP_MX,bh=35,bw=6,bx2=p.x+18,by2=p.y+8;X.fillStyle='rgba(0,0,0,0.35)';X.beginPath();X.roundRect(bx2-1,by2-1,bw+2,bh+2,3);X.fill();X.fillStyle=`rgb(${Math.round(100+t*155)},${Math.round(180-t*130)},255)`;X.beginPath();X.roundRect(bx2,by2,bw,bh*t,2);X.fill();X.fillStyle='#fff';X.font='bold 10px monospace';X.textAlign='center';X.fillText(`${1+Math.floor(t*3)}F\u25BC`,bx2+bw/2,by2+bh+12)}

  // Crane prompt — on cab but not driving
  if(p.crane<0&&p.onF){
    for(let ci=0;ci<S.cranes.length;ci++){
      const c=S.cranes[ci];const cabY=c.y-200;
      if(Math.abs(p.y-cabY)<10&&Math.abs(p.x-c.x)<60){
        const ctxt='[E] Drive Crane';
        X.font='bold 13px Segoe UI,sans-serif';X.textAlign='center';
        const cw2=X.measureText(ctxt).width;
        X.fillStyle='rgba(0,0,0,0.55)';X.beginPath();X.roundRect(c.x-cw2/2-8,cabY-p.h-32,cw2+16,20,4);X.fill();
        X.fillStyle='#ffee88';X.fillText(ctxt,c.x,cabY-p.h-18);
        break;
      }
    }
  }

  // Interaction prompts
  const inter=getInter();
  if(inter&&S.elevAnim==='idle'){let pt='',px2=p.x,py2=p.y-p.h-20;
    if(inter.t==='elev')pt='[E] Elevator';else if(inter.t==='build'){pt='[E] '+inter.v.def.label;px2=inter.v.def.x;py2=TB-(inter.v.floor*FH)-FH/2-30}
    else if(inter.t==='up')pt='\u25B2 Climb';else if(inter.t==='dn')pt='\u25BC Descend';
    else if(inter.t==='obj'){pt=`[E] ${inter.v.nm}`;px2=inter.v.x+inter.v.width/2;py2=inter.v.y-inter.v.height-18}
    else if(inter.t==='npc'){pt=`[E] ${inter.v.name}`;px2=inter.v.x;py2=inter.v.y-inter.v.h-18}
    if(pt){X.font='bold 13px Segoe UI,sans-serif';X.textAlign='center';const tw=X.measureText(pt).width;
    X.fillStyle='rgba(0,0,0,0.55)';X.beginPath();X.roundRect(px2-tw/2-8,py2-12,tw+16,20,4);X.fill();X.fillStyle='#ffee88';X.fillText(pt,px2,py2+2)}}
  const ns=nearSuit();if(ns&&!p.suit){X.font='bold 12px Segoe UI,sans-serif';X.textAlign='center';X.fillStyle='rgba(0,0,0,0.5)';const stxt='[F] Suit',stw=X.measureText(stxt).width;X.beginPath();X.roundRect(ns.x-stw/2-6,ns.y-66,stw+12,18,4);X.fill();X.fillStyle='#ffd870';X.fillText(stxt,ns.x,ns.y-54)}

  // [E] Go Outside prompt — ground floor doors or frame edges
  if(!isReckoningActive()){
    const _xMin2=TL-UW+p.w/2+50,_xMax2=TR+UW-p.w/2-50;
    const _atDoorL=p.y>=TB-100&&p.x<TL+50;
    const _atDoorR=p.y>=TB-100&&p.x>TR-50;
    const _atEdge=p.x<=_xMin2||p.x>=_xMax2;
    if(_atDoorL||_atDoorR||_atEdge){
      const dtxt='[E] Go Outside';
      const dx=_atEdge?p.x:(_atDoorL?TL+20:TR-20),dy=p.y-70;
      X.font='bold 13px Segoe UI,sans-serif';X.textAlign='center';
      const dw=X.measureText(dtxt).width;
      X.fillStyle='rgba(0,0,0,0.55)';X.beginPath();X.roundRect(dx-dw/2-8,dy-12,dw+16,20,4);X.fill();
      X.fillStyle='#ffee88';X.fillText(dtxt,dx,dy+2);
    }
  }

  // RGB door proximity text (world space)
  if(p.cf===4&&S.buildout[4].stage>=5){
    const doorCX=TL+2*PG+PG/2;
    if(Math.abs(p.x-doorCX)<150)drawRGBDoorText(doorCX,TB-4*FH-FH*0.3,_now);
  }

  // Rematch bell interaction prompt
  if(_rk.phase==='DONE'&&_rk.played&&_rk.bellX&&p.cf===7&&Math.abs(p.x-_rk.bellX)<60){
    const btxt='[E] Rematch';
    X.font='bold 12px Segoe UI,sans-serif';X.textAlign='center';
    const btw=X.measureText(btxt).width;
    X.fillStyle='rgba(0,0,0,0.5)';X.beginPath();X.roundRect(_rk.bellX-btw/2-6,TB-7*FH-68,btw+12,18,4);X.fill();
    X.fillStyle='#ffd870';X.fillText(btxt,_rk.bellX,TB-7*FH-56);
  }

  // Color wheel interaction prompt
  if(checkColorWheel()){
    const cwp=getColorWheelPos();
    const ctxt='[E] Change Color';
    X.font='bold 12px Segoe UI,sans-serif';X.textAlign='center';
    const ctw=X.measureText(ctxt).width;
    const cwy=TB-cwp.fi*FH-68;
    X.fillStyle='rgba(0,0,0,0.5)';X.beginPath();X.roundRect(cwp.x-ctw/2-6,cwy,ctw+12,18,4);X.fill();
    X.fillStyle='#ffd870';X.fillText(ctxt,cwp.x,cwy+12);
  }

  // Particles (world space)
  updateAndDrawParticles();

  X.restore();

  // Reckoning overlay (screen space)
  drawReckoningOverlay(W,H,_now);

  // Free-roam color picker overlay (screen space, same UI as post-reckoning)
  if(_rk.phase==='DONE'&&_rk.colorPick){
    const cp=getColorPickState();
    X.fillStyle='rgba(0,0,0,0.5)';X.fillRect(0,0,W,H);
    X.fillStyle='#fff';X.font='bold 22px monospace';X.textAlign='center';
    X.fillText('CHOOSE YOUR COLOR',W/2,H*0.28);
    X.fillStyle='rgba(255,255,255,0.4)';X.font='13px monospace';
    X.fillText('A/D to browse, E to confirm, Esc to cancel',W/2,H*0.34);
    const swSize=36,swGap=12,totalSW=cp.colors.length*(swSize+swGap)-swGap;
    const swStart=(W-totalSW)/2;
    for(let ci=0;ci<cp.colors.length;ci++){
      const sx=swStart+ci*(swSize+swGap),sy=H*0.44;
      const sel=ci===cp.idx;
      if(sel){X.fillStyle='#fff';X.beginPath();X.roundRect(sx-4,sy-4,swSize+8,swSize+8,6);X.fill()}
      X.fillStyle=cp.colors[ci];X.beginPath();X.roundRect(sx,sy,swSize,swSize,4);X.fill();
      if(sel){X.strokeStyle='#000';X.lineWidth=2;X.beginPath();X.roundRect(sx,sy,swSize,swSize,4);X.stroke()}
    }
    const pulse3=0.5+Math.sin(_now*0.005)*0.3;
    X.fillStyle=`rgba(255,255,255,${pulse3})`;X.font='bold 14px monospace';X.textAlign='center';
    X.fillText('\u25C0 A/D \u25B6       [E] CONFIRM',W/2,H*0.62);
  }

  // Keeper overlay (screen space)
  drawKeeperOverlay(X,W,H,_now);

  // Screen flash overlay (screen space)
  if(S.fx.flash>0){
    X.globalAlpha=Math.min(S.fx.flash,1);
    X.fillStyle=S.fx.flashColor;
    X.fillRect(0,0,W,H);
    X.globalAlpha=1;
    S.fx.flash*=0.9;if(S.fx.flash<0.02)S.fx.flash=0;
  }
}
