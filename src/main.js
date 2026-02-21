'use strict';
import { S, recalc, cZoom, tZoom, setCZoom, setTZoom } from './state.js';
import { TB, FH, FT, TL, TR, UW, GRAV, JUMP_F, JUMP_MX, CHG_MX, DROP_MX, MOB, pk } from './constants.js';
import { FD } from './floors.js';
import { HC } from './npcs.js';
import { initCanvas, draw, showMsg, floatText, getInter, nearSuit } from './render.js';
import { setupInput } from './input.js';
import { setupPanel, renderPanel } from './panel.js';
import { genWorld } from './world.js';
import { loadGame, autoSave } from './save.js';
import { ensureAudio, sndStep, sndTalk, sndWarn, sndElev, soundOn, toggleSound } from './sound.js';
import { ELEV_X, NF } from './constants.js';

// Wire up sound button (was inline onclick in HTML)
document.getElementById('snd-btn').addEventListener('click',()=>toggleSound());
document.getElementById('snd-btn').textContent=soundOn?'🔊':'🔇';

// ═══ ELEVATOR PANEL ═══
const elevPanel=document.getElementById('elev-panel');
const elevFloors=document.getElementById('elev-floors');

function openElev(){
  ensureAudio();
  S.elevOpen=true;
  S.elevSelected=S.player.cf;
  elevFloors.innerHTML='';
  for(let fi=NF-1;fi>=0;fi--){
    const fd=FD[fi],lit=S.litFloors.has(fi),cur=S.player.cf===fi;
    const div=document.createElement('div');
    div.className='elev-floor'+(cur?' current':lit?'':' locked')+(fi===S.elevSelected?' selected':'');
    div.innerHTML=`<span>${fd.name}</span><span class="ef-num">${lit?`F${fi+1}`:'🔒'}</span>`;
    div.dataset.fi=fi;
    if(lit&&!cur){div.addEventListener('click',()=>rideElev(fi))}
    elevFloors.appendChild(div);
  }
  elevPanel.classList.add('open');
}
function closeElev(){
  S.elevOpen=false;
  elevPanel.classList.remove('open');
}
function updateElevHighlight(){
  document.querySelectorAll('.elev-floor').forEach(el=>{el.classList.toggle('selected',parseInt(el.dataset.fi)===S.elevSelected)});
}
function rideElev(targetFloor){
  S.elevTo=targetFloor;
  S.elevFrom=S.player.cf;
  S.elevAnim='closing';
  S.elevDoorTarget=0;
  closeElev();
}
addEventListener('keydown',e=>{if(e.code==='Escape'&&S.elevOpen)closeElev()});

// Initialize
initCanvas();
setupInput();
setupPanel();

// Set initial zoom slider
const zSl=document.getElementById('zoom-sl'),zLb=document.getElementById('zoom-lbl');
zSl.value=cZoom;zLb.textContent=Math.round(cZoom*100)+'%';

// ═══ UPDATE ═══
function update(){
  const p=S.player,k=S.keys,inter=getInter();
  S.frame++;
  // Note: we need to read the current cZoom/tZoom values via the module exports
  // Since they're live bindings, we import them at the top and they update automatically
  const zLerp=(p.isChg||p.isDrp)?0.04:0.15;
  setCZoom(cZoom+(tZoom-cZoom)*zLerp);
  // Elevator door target (proximity-driven, only when idle)
  if(S.elevAnim==='idle'){S.elevDoorTarget=(inter&&inter.t==='elev')?1:(S.elevOpen?1:0)}
  S.elevDoors+=(S.elevDoorTarget-S.elevDoors)*0.08;
  // Elevator animation state machine
  if(S.elevAnim==='closing'){if(S.elevDoors<0.02){S.elevAnim='traveling';S.elevAnimT=30}}
  else if(S.elevAnim==='traveling'){S.elevAnimT--;if(S.elevAnimT<=0){p.x=ELEV_X;p.y=TB-(S.elevTo*FH);p.vy=0;p.vx=0;p.onF=true;p.st='idle';p.cf=S.elevTo;S.cam.x=p.x;S.cam.y=p.y-60;S.elevAnim='opening';S.elevDoorTarget=1;sndElev()}}
  else if(S.elevAnim==='opening'){if(S.elevDoors>0.95)S.elevAnim='idle'}

  S.incomeTk++;if(S.incomeTk>=120){S.incomeTk=0;let cg=5+S.crRate;S.res.credits+=cg;floatText(`+${cg} 💰`,cg>5?'#00ff88':'#ffd700');S.panelDirty=true}
  S.decayTk++;if(S.decayTk>=180){S.decayTk=0;const nLit=S.litFloors.size;const decay=0.3+nLit*0.15;S.sat=Math.max(0,S.sat-decay);S.panelDirty=true;if(S.sat<20&&S.frame%600<2){floatText('⚠ Morale critical','#ff6b35');sndWarn()}}
  if(S.jp['KeyF']){const spEl=document.getElementById('sp');if(p.suit){p.suit=false;spEl.style.display='none'}else{const s=nearSuit();if(s){s.taken=true;p.suit=true;p.suitC=pk(HC);spEl.style.display='block'}}}
  S.saveTk++;if(S.saveTk>=3600){S.saveTk=0;autoSave()}
  if(!S.elevOpen&&S.elevAnim==='idle'){
  const jk=k['ArrowUp']||k['KeyW'],dk=k['ArrowDown']||k['KeyS'];
  const stUp=inter&&inter.t==='up',stDn=inter&&inter.t==='dn';
  if(p.st!=='climb'){
    p.vx=0;
    if(k['ArrowLeft']||k['KeyA']){p.vx=-p.spd;p.fr=false;if(p.onF)p.st='walk'}
    if(k['ArrowRight']||k['KeyD']){p.vx=p.spd;p.fr=true;if(p.onF)p.st='walk'}
    if(p.vx===0&&p.onF&&!p.isChg&&!p.isDrp)p.st='idle';
    if(jk){
      if(stUp){p.st='climb';p.clT=inter.v;p.clP=0;p.x=inter.v.bx;p.vx=0;p.isChg=false;p.chgT=0;setTZoom(p.baseZoom||tZoom)}
      else if(p.onF){if(!p.isChg)p.baseZoom=tZoom;p.isChg=true;p.chgT=Math.min(p.chgT+1,CHG_MX);setTZoom(p.baseZoom-p.chgT/CHG_MX*0.2)}
    } else {if(p.isChg&&p.onF){const t=p.chgT/CHG_MX;p.vy=JUMP_F+(JUMP_MX-JUMP_F)*t;p.onF=false;p.st='jump'}if(p.isChg)setTZoom(p.baseZoom);p.isChg=false;p.chgT=0}
    if(dk&&p.onF&&!stDn){if(!p.isDrp)p.baseZoom=p.baseZoom||tZoom;p.isDrp=true;p.drpT=Math.min(p.drpT+1,DROP_MX);setTZoom(p.baseZoom-p.drpT/DROP_MX*0.25)}
    else if(dk&&stDn){p.st='climb';p.clT=inter.v;p.clP=1;p.x=inter.v.tx;p.vx=0;p.isDrp=false;p.drpT=0;setTZoom(p.baseZoom||tZoom)}
    else{if(p.isDrp&&p.drpT>3&&p.onF){p.drpPhase=Math.floor(p.drpT/DROP_MX*3);p.y+=FT+4;p.vy=4;p.onF=false;p.st='jump'}if(p.isDrp)setTZoom(p.baseZoom||tZoom);p.isDrp=false;p.drpT=0}
    if(k['KeyE']&&inter){if(!S.iLock){if(inter.t==='elev'){openElev()}else if(inter.t==='obj')showMsg(inter.v.nm,inter.v.m[Math.floor(Math.random()*inter.v.m.length)]);
      else if(inter.t==='npc'){const n=inter.v;if(n.convo){const line=n.convo[Math.min(n.ci,n.convo.length-1)];showMsg(n.name,line(n.name));sndTalk();if(n.ci<n.convo.length-1)n.ci++}
      }S.iLock=true}}else S.iLock=false;
  } else {
    const st=p.clT;if(jk){p.clP+=0.018;p.fr=st.tx>st.bx}else if(dk){p.clP-=0.018;p.fr=st.bx>st.tx}
    if(p.clP>=1){p.clP=1;p.st='idle';p.clT=null;p.x=st.tx;p.y=st.ty;p.vy=0}
    else if(p.clP<=0){p.clP=0;p.st='idle';p.clT=null;p.x=st.bx;p.y=st.by;p.vy=0}
    else{p.x=st.bx+(st.tx-st.bx)*p.clP;p.y=st.by+(st.ty-st.by)*p.clP}
  }
  if(p.st!=='climb'){
    p.x+=p.vx;p.y+=p.vy;p.vy+=GRAV;
    const xMin=TL-UW+p.w/2,xMax=TR+UW-p.w/2;
    if(p.x<xMin)p.x=xMin;if(p.x>xMax)p.x=xMax;
    p.onF=false;
    for(let f of S.floors){if(p.vy>=0&&p.y<=f.y&&p.y+p.vy>=f.y){if(f.level<0&&(p.x<TL||p.x>TR))continue;if(p.drpPhase>0&&f.level>=0){p.drpPhase--;continue}p.y=f.y;p.vy=0;p.cf=f.level;p.onF=true;if(p.st==='jump')p.st=p.vx===0?'idle':'walk';break}}
    if(p.y>TB){p.y=TB;p.vy=0;p.onF=true;p.drpPhase=0;p.cf=0}
  }
  } // end movement guard
  if(S.elevOpen){
    if(S.jp['ArrowUp']||S.jp['KeyW']){S.elevSelected=Math.min(S.elevSelected+1,NF-1);updateElevHighlight()}
    if(S.jp['ArrowDown']||S.jp['KeyS']){S.elevSelected=Math.max(S.elevSelected-1,0);updateElevHighlight()}
    if(S.jp['Enter']||S.jp['KeyE']){if(S.litFloors.has(S.elevSelected)&&S.elevSelected!==p.cf)rideElev(S.elevSelected)}
  }
  S.npcs.forEach(n=>{n.at--;if(n.at<=0){n.at=60+Math.random()*140;const r=Math.random();if(r<0.4){n.st='idle';n.vx=0}else if(r<0.7){n.st='walk';n.vx=n.spd;n.fr=true}else{n.st='walk';n.vx=-n.spd;n.fr=false}}
    if(n.type==='b'){n.jt--;if(n.jt<=0&&n.onF){n.vy=-6;n.onF=false;n.jt=180+Math.floor(Math.random()*180)}if(n.st==='walk')n.lp+=0.18}
    n.x+=n.vx;n.y+=n.vy;n.vy+=GRAV;if(n.x<TL+30){n.x=TL+30;n.vx=Math.abs(n.vx);n.fr=true}if(n.x>TR-30){n.x=TR-30;n.vx=-Math.abs(n.vx);n.fr=false}
    n.onF=false;for(let f of S.floors){if(f.level<0)continue;if(n.vy>=0&&n.y<=f.y&&n.y+n.vy>=f.y){n.y=f.y;n.vy=0;n.onF=true;break}}
    if(n.st==='walk')n.bob+=0.2;else n.bob*=0.9;
  });
  S.workers.forEach(w=>{w.at--;if(w.at<=0){w.at=80+Math.random()*200;const r=Math.random();if(r<0.4){w.st='idle';w.vx=0}else if(r<0.7){w.st='walk';w.vx=w.spd;w.fr=true}else{w.st='walk';w.vx=-w.spd;w.fr=false}}
    w.x+=w.vx;if(w.x<TL+40){w.x=TL+40;w.vx=Math.abs(w.vx);w.fr=true}if(w.x>TR-40){w.x=TR-40;w.vx=-Math.abs(w.vx);w.fr=false}
    if(w.st==='walk')w.bob+=0.15;else w.bob*=0.9;
  });
  if(p.st==='walk'||p.st==='climb')p.bob+=0.2;else p.bob*=0.9;
  if(p.st==='walk'&&S.frame%12===0)sndStep();
  const fpEl=document.getElementById('fp');
  fpEl.textContent=p.cf<0?'ROOFTOP · UNDER CONSTRUCTION':`FLOOR ${p.cf+1} · ${FD[p.cf]?.name||''}`;
  S.cam.tx=p.x;S.cam.ty=p.y-60;S.cam.x+=(S.cam.tx-S.cam.x)*0.08;S.cam.y+=(S.cam.ty-S.cam.y)*0.08;
  S.jp={};
}

// ═══ GAME LOOP ═══
function loop(){update();draw();renderPanel();requestAnimationFrame(loop)}
genWorld();S.player.x=0;S.player.y=TB;S.cam.x=S.player.x;S.cam.y=S.player.y-60;
if(loadGame()){showMsg('SAVE LOADED','Welcome back, builder.')}
recalc();renderPanel();requestAnimationFrame(loop);
