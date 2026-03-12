'use strict';
import { S, addCredits, setSat } from './state.js';
import { NF, BPF, TB, FH, ELEV_X } from './constants.js';
import { FD } from './floors.js';
import { sndElev, sndCrAlarm, sndCrChunk, sndCrThud } from './sound.js';
import { initTerrain } from './terrain.js';
// ═══ CONTROL ROOM ═══
// Basement scene below Floor 1. Elevator doors → dark room → screen boots → interactive.

// ── Topo bulldozer view (full-screen overlay) ──
// Dynamic import — keeps Three.js out of the sim chunk until player actually enters topo
let _topoAPI = null;
let _topoActive = false;

export function isTopoActive() { return _topoActive; }

export async function enterTopo() {
  // Initialize terrain if first time
  if (!S.terrain3d.initialized) initTerrain(S.terrain3d);
  // Lazy-init the topo renderer (dynamic import keeps Three.js out of sim chunk)
  if (!_topoAPI) {
    const canvas = document.getElementById('topoCanvas');
    if (!canvas) return;
    const { initTopoView } = await import('./bulldozer-topo.js');
    _topoAPI = initTopoView(canvas);
  }
  _topoAPI.enter(S.terrain3d, S.bulldozer);
  _topoActive = true;
}

function _exitTopo() {
  if (_topoAPI && _topoAPI.active) _topoAPI.exit();
  _topoActive = false;
  S.cr.fullScreen = false;
}

export function updateTopoView(dt) {
  if (!_topoActive || !_topoAPI) return;
  _topoAPI.update(dt);
  if (_topoAPI.wantsExit()) _exitTopo();
}

export function resizeTopoView(w, h) {
  if (_topoAPI) _topoAPI.resize(w, h);
}

// ── Color palette ──
const CR={
  sky:'#a8d4f0',blue:'#7ec8ee',blueMid:'#5aaedd',blueDim:'#3a90cc',
  blueFaint:'#2070aa',blueGhost:'#103050',
  white:'#e8eef4',whiteMid:'#c0ccd8',whiteDim:'#90a0b4',whiteFaint:'#506070',
  red:'#dda0a0',redDim:'#bb7777',
  cream:'#d8ccb8',creamDim:'#aa9977',gold:'#ccbb88',
  bg:'#060a10',
};

// ── Static stars (cosmetic, not seeded from game RNG) ──
const STARS=Array.from({length:40},(_,i)=>({
  x:(i*137+23)%1000/1000,y:(i*89+41)%1000/1000,
  r:0.5+(i*53%30)*0.04,alpha:0.3+(i*17%10)*0.06,
}));

// ── Task text for "Next Step" on screen ──
const TASK_TEXT=[
  'Build the lobby — launch crates from the seesaw',
  'Frame the quarters — give people a place to sleep',
  'Raise the garden — the tower needs to breathe',
  'Get research online — connect the server rack',
  'Open the restaurant — you need to eat',
  'Build the lounge — your people need space to gather',
  'Install observation systems — look out, not just up',
  'Secure the storage level — protect what you have',
  'Mount the telescope — see how far you\'ve come',
  'Reach command — someone is waiting for you',
];

// ── Floor descriptions for detail panel ──
const FLOOR_DESC=[
  'Ground level. The first thing anyone sees. Power, reception, basic life support. Population flows in and out through here.',
  'Living spaces. Beds, personal storage, communal areas. Where residents sleep and form the social fabric of the tower.',
  'Hydroponics and green space. Air recycling, food growth, and the closest thing to nature this far up.',
  'Labs, data terminals, experimental modules. The tower\'s intellectual engine.',
  'The hunger destination. This is where you connect your mind. The threshold to something deeper. The door glows.',
  'Social space, relaxation, views. Will become a pressure point.',
  'Health and the physical toll of building a space elevator by hand.',
  'This floor will test what you\'ve built and who you\'ve become.',
  'When built, this is where you look up and realize how far you\'ve come.',
  'Someone is waiting on this floor. They know everything about your tower.',
];

// ── Internal time accumulator ──
let _t=0;

// ── Module-local state (features 1–5) ──
let _logLines=[],_logTimer=0,_logIdx=0;
let _nearConsole=false,_redAlertT=0,_goldUsed=false,_pressedBtn=null,_pressedBtnT=0;
let _wasJumping=false,_shakeT=0,_shakeIntensity=0,_consoleLandIdx=0;
let _glitchT=0,_glitchRng=5,_flickerT=2,_pendingSatLog=false;
let _lastSatBoost=0; // persists across visits (60s cooldown)
let _screenAlpha=1; // current frame screen alpha (for flicker)

const LOG_INTERVAL=6; // seconds between quips
const LOG_FADE=18; // seconds before fade-out

const LOG_QUIPS=[
  // Contextual (with cond)
  {text:s=>'Population: '+s.population+'. The tower is technically a house.',cond:s=>s.population<=15},
  {text:'Satisfaction critical. Consider doing literally anything.',cond:s=>s.satisfaction<20},
  {text:s=>'Credits: '+s.credits+'. Poverty is a feature, not a bug.',cond:s=>s.credits===0},
  {text:'Floor 5 restaurant still empty. Your stomach knows.',cond:(_,c)=>c.floors[4].stage<3},
  {text:'Someone rang a bell on Floor 8. The reverberations continue.',cond:()=>S.reckoning.played},
  {text:'10 floors. All by hand. Your chiropractor is waiting.',cond:(_,c)=>c.doneCount>=10},
  {text:s=>'Satisfaction at '+s.satisfaction+'%. Morale is a concept.',cond:s=>s.satisfaction>=80},
  {text:'Half the tower is dark. The other half is also mostly dark.',cond:(_,c)=>c.active<=5},
  {text:s=>'Population '+s.population+'. Standing room only.',cond:s=>s.population>40},
  {text:'Research floor offline. Science waits for no one. Except you.',cond:(_,c)=>c.floors[3].stage<3},
  // Generic (no cond, rotate in order)
  {text:'Note: the red button does nothing useful.'},
  {text:'Elevator maintenance overdue by 47 visits.'},
  {text:'Ambient temperature: cold. Morale: also cold.'},
  {text:'System log: everything is nominal. Suspiciously nominal.'},
  {text:'Reminder: you built this. All of it. With your hands.'},
  {text:'Oxygen levels stable. Existential dread levels: unmeasured.'},
  {text:'Warning: basement lighting budget was zero.'},
  {text:'Console uptime: impressive. Console usefulness: debatable.'},
  {text:'Next maintenance cycle: undefined.'},
  {text:'Power draw: minimal. Ambiance draw: maximal.'},
  {text:'No anomalies detected. That is the anomaly.'},
  {text:'If you can read this, you are too close to the screen.'},
  {text:'Status: operational. Purpose: unclear.'},
  {text:'Floor count: 10. Complaint count: higher.'},
  {text:'The hum you hear is normal. Probably.'},
  {text:'Seesaw accuracy improving. Roof integrity: questionable.'},
  {text:'New floor detected. Interior awaiting activation.'},
  {text:'Builders report: materials received. Mostly intact.'},
  {text:'The work expands. The job continues.'},
];

const CONSOLE_LAND_QUIPS=[
  'Please do not stand on the equipment.',
  'That console cost more than Floor 3.',
  'Structural integrity of operator station: concerning.',
];

function _pickQuip(){
  const stats=_cache.stats,c=_cache;
  const contextual=LOG_QUIPS.filter(q=>q.cond&&q.cond(stats,c));
  const generic=LOG_QUIPS.filter(q=>!q.cond);
  if(contextual.length>0&&Math.random()<0.6){
    const q=contextual[Math.floor(Math.random()*contextual.length)];
    return typeof q.text==='function'?q.text(stats):q.text;
  }
  const q=generic[_logIdx%generic.length];
  _logIdx++;
  return typeof q.text==='function'?q.text(stats):q.text;
}

function _pushLog(text){
  _logLines.push({text,age:0});
  if(_logLines.length>3)_logLines.shift();
}

// ── Per-frame cache (refreshed every 30 frames or on panelDirty) ──
let _cache={stats:null,floors:null,nextTask:null,doneCount:0,active:0,building:0};
let _cacheFrame=0;
function _refreshCache(){
  if(_cache.stats&&!S.panelDirty&&++_cacheFrame<30)return;
  _cacheFrame=0;
  let pop=0;
  for(let i=0;i<S.npcs.length;i++)if(S.npcs[i].arrived)pop++;
  _cache.stats={population:pop+S.workers.length,satisfaction:Math.round(S.sat),credits:S.credits};
  if(!_cache.floors)_cache.floors=Array.from({length:NF},()=>({name:'',stage:0,mods:0}));
  let ac=0,bd=0,dc=0;
  for(let i=0;i<NF;i++){
    const stg=S.buildout[i].stage;
    let mc=0;for(let bi=0;bi<BPF;bi++)if(S.modules[i][bi])mc++;
    _cache.floors[i].name=FD[i].name;_cache.floors[i].stage=stg;_cache.floors[i].mods=mc;
    if(stg>=3){ac++;dc++}else if(stg>0)bd++;
  }
  _cache.active=ac;_cache.building=bd;_cache.doneCount=dc;
  _cache.nextTask=null;
  _cache.builtUnexplored=null;
  for(let i=0;i<NF;i++){
    if(S.buildout[i].stage<3){_cache.nextTask={floor:i,text:TASK_TEXT[i]};break}
  }
  // Find first floor that's built (stage>=1) but not fully explored (stage<3)
  for(let i=0;i<NF;i++){
    const stg=S.buildout[i].stage;
    if(stg>=1&&stg<3){_cache.builtUnexplored={floor:i};break}
  }
}

// ═══ EXPORTS ═══

export function enterControlRoom(){
  const cr=S.cr;
  cr.active=true;cr.phase=0;cr.phaseT=0;
  cr.doorOpen=0;cr.screenBoot=0;cr.screenOn=false;
  cr.px=0;cr.pz=0;cr.walking=false;cr.walkDir=0;
  cr.nearElev=false;cr.introWalkDone=false;
  cr.selectedFloor=-1;cr.fullScreen=false;cr.fsPanX=0;cr.fsPanY=0;
  _t=0;
  // Feature resets (per-visit)
  _logLines=[];_logTimer=0;_logIdx=0;
  _nearConsole=false;_redAlertT=0;_goldUsed=false;_pressedBtn=null;_pressedBtnT=0;
  cr.jumping=false;cr.jumpVel=0;cr.jumpY=0;cr.charging=false;cr.chargeT=0;
  _wasJumping=false;_shakeT=0;_shakeIntensity=0;_consoleLandIdx=0;
  _glitchT=0;_glitchRng=5;_flickerT=2;_pendingSatLog=false;
  // SAT boost (60s cooldown persists across visits)
  if(Date.now()-_lastSatBoost>=60000){
    setSat(S.sat+2);
    _lastSatBoost=Date.now();
    _pendingSatLog=true;
  }
}

export function exitControlRoom(){
  if(_topoActive) _exitTopo();
  const cr=S.cr;
  cr.active=false;cr.phase=0;cr.phaseT=0;
  cr.doorOpen=0;cr.screenBoot=0;cr.screenOn=false;
  cr.px=0;cr.pz=0;cr.introWalkDone=false;
  cr.selectedFloor=-1;cr.fullScreen=false;
  // Return player to Lobby at elevator
  S.player.x=ELEV_X;S.player.cf=0;S.player.y=TB;S.player.vy=0;S.player.vx=0;
  S.player.onF=true;S.player.st='idle';
  S.elevAnim='opening';S.elevDoorTarget=1;S.elevDoors=0;
  sndElev();
}

export function handleConsoleInteract(){
  const cr=S.cr;
  if(!_nearConsole||cr.phase!==3)return;
  if(cr.px<0){
    // Red button
    _redAlertT=2.0;_pressedBtn='red';_pressedBtnT=0.3;
    _pushLog('RED ALERT. RED ALE\u2014 false alarm. Carry on.');
    sndCrAlarm();
  } else {
    // Gold button
    if(!_goldUsed){
      addCredits(1);_goldUsed=true;_pressedBtn='gold';_pressedBtnT=0.3;
      _pushLog('Emergency budget: 1 credit disbursed.');
      sndCrChunk();
    } else {
      _pushLog('Emergency budget exhausted. Try again next visit.');
    }
  }
}

export function updateControlRoom(dt){
  const cr=S.cr;
  cr.phaseT+=dt;_t+=dt;

  if(cr.phase===0&&cr.phaseT>1.0){cr.phase=1;cr.phaseT=0}
  if(cr.phase===1){
    cr.doorOpen=Math.min(1,cr.phaseT/2.2);
    if(cr.phaseT>2.8){cr.phase=2;cr.phaseT=0}
  }
  if(cr.phase===2){
    if(!cr.introWalkDone){
      cr.pz=Math.min(1,cr.phaseT/3.0);
      if(cr.pz>=1)cr.introWalkDone=true;
    }
    if(cr.phaseT>1.5)cr.screenOn=true;
    cr.screenBoot=cr.screenOn?Math.min(1,(cr.phaseT-1.5)/1.2):0;
    if(cr.phaseT>3.5){cr.phase=3;cr.phaseT=0}
  }
  if(cr.phase===3){
    cr.screenBoot=1;cr.screenOn=true;
    _handleInput(dt);
    // Feature 1: Log timer
    _logTimer+=dt;
    if(_logTimer>=LOG_INTERVAL){_logTimer=0;_pushLog(_pickQuip())}
    for(let i=_logLines.length-1;i>=0;i--){_logLines[i].age+=dt;if(_logLines[i].age>LOG_FADE)_logLines.splice(i,1)}
    // Feature 3: Deferred SAT log
    if(_pendingSatLog&&cr.screenOn){_pushLog('Management spotted in basement. Morale adjusting.');_pendingSatLog=false}
    // Feature 4b: Zero-credit glitch
    if(S.credits===0){_glitchRng-=dt;if(_glitchRng<=0){_glitchT=0.08+Math.random()*0.12;_glitchRng=3+Math.random()*5}}
    if(_glitchT>0)_glitchT-=dt;
    // Feature 4d: Low SAT flicker
    if(S.sat<25){_flickerT-=dt;if(_flickerT<=0)_flickerT=1.5+Math.random()*3}
    // Feature 2: Button press decay
    if(_pressedBtnT>0)_pressedBtnT-=dt;
    if(_redAlertT>0)_redAlertT-=dt;
    // Feature 5: Jump gag detection
    const justLanded=_wasJumping&&!cr.jumping&&(cr.jumpY||0)===0;
    _wasJumping=cr.jumping;
    if(justLanded&&cr.pz>=0.65&&cr.pz<=0.85){
      _glitchT=0.5;_shakeT=0.3;_shakeIntensity=4;
      _pushLog(CONSOLE_LAND_QUIPS[_consoleLandIdx%CONSOLE_LAND_QUIPS.length]);
      _consoleLandIdx++;sndCrThud();
    }
    if(_shakeT>0)_shakeT-=dt;
    // Feature 2: Console proximity
    _nearConsole=cr.pz>=0.65&&cr.pz<=0.9&&Math.abs(cr.px)<250;
  }
}

function _handleInput(dt){
  const cr=S.cr,k=S.keys;
  const left=k['ArrowLeft']||k['KeyA'];
  const right=k['ArrowRight']||k['KeyD'];
  const up=k['ArrowUp']||k['KeyW'];
  const down=k['ArrowDown']||k['KeyS'];
  const sprint=k['ShiftLeft']||k['ShiftRight']?2:1;
  const spd=160*sprint;

  cr.walking=false;cr.walkDir=0;

  if(left){cr.px=Math.max(-600,cr.px-spd*dt);cr.walking=true;cr.walkDir=-1}
  if(right){cr.px=Math.min(600,cr.px+spd*dt);cr.walking=true;cr.walkDir=1}
  if(down){cr.pz=Math.max(0,cr.pz-0.5*sprint*dt);cr.walking=true}
  if(up&&cr.pz<1){cr.pz=Math.min(1,cr.pz+0.5*sprint*dt);cr.walking=true}
  // Charge jump (hold Space to charge, release to jump higher)
  const jumpKey=k['Space']||(up&&cr.pz>=1);
  if(jumpKey&&!cr.jumping){
    cr.charging=true;
    cr.chargeT=Math.min((cr.chargeT||0)+dt,0.75);
  } else if(cr.charging&&!jumpKey){
    const t=Math.min((cr.chargeT||0)/0.75,1);
    cr.jumping=true;cr.jumpVel=-(150+200*t);cr.jumpY=0;
    cr.charging=false;cr.chargeT=0;
  }
  if(cr.jumping){
    cr.jumpY+=cr.jumpVel*dt;cr.jumpVel+=750*dt;
    if(cr.jumpY>=0){cr.jumpY=0;cr.jumping=false;cr.jumpVel=0}
  }
  cr.nearElev=cr.pz<0.08;
}

// ── Cached data accessors ──
function _getStats(){return _cache.stats}
function _getFloorData(i){return _cache.floors[i]}
function _getNextTask(){return _cache.nextTask}
function _getTaskDone(i){return _cache.floors[i].stage>=3}

// ── Word wrap helper ──
function _wrapText(X,text,x,y,maxW,lineH){
  const words=text.split(' ');let line='',ly=y;
  for(const word of words){
    const test=line+(line?' ':'')+word;
    if(X.measureText(test).width>maxW&&line){X.fillText(line,x,ly);ly+=lineH;line=word}
    else line=test;
  }
  if(line)X.fillText(line,x,ly);
}

// ═══ SHARED DRAW PRIMITIVES ═══
// Used by both room-view screen and full-screen mode.

function _drawStars(X,ox,oy,w,h,rMul){
  STARS.forEach(st=>{
    const twinkle=st.alpha+Math.sin(_t*1.5+st.x*40)*0.1;
    X.fillStyle=`rgba(200,210,230,${twinkle})`;
    X.beginPath();X.arc(ox+st.x*w,oy+st.y*h*0.7,st.r*rMul,0,Math.PI*2);X.fill();
  });
}

function _drawEarthMoon(X,cx,cy,eR,moonR,moonDist){
  // Earth
  X.fillStyle='#0a1628';
  X.beginPath();X.arc(cx,cy,eR,0,Math.PI*2);X.fill();
  // Atmosphere glow
  X.strokeStyle='rgba(60,120,180,0.15)';X.lineWidth=eR>300?4:3;
  X.beginPath();X.arc(cx,cy,eR+2,Math.PI+0.3,Math.PI*2-0.3);X.stroke();
  X.strokeStyle='rgba(80,160,220,0.08)';X.lineWidth=eR>300?8:6;
  X.beginPath();X.arc(cx,cy,eR+5,Math.PI+0.5,Math.PI*2-0.5);X.stroke();
  // Moon
  const mAngle=_t*0.15;
  const mX=cx+Math.cos(mAngle)*moonDist,mY=cy+Math.sin(mAngle)*moonDist*0.3-eR*0.4;
  X.fillStyle='#8090a8';X.beginPath();X.arc(mX,mY,moonR,0,Math.PI*2);X.fill();
  X.fillStyle='rgba(100,120,150,0.15)';X.beginPath();X.arc(mX,mY,moonR*1.75,0,Math.PI*2);X.fill();
}

function _drawTowerWire(X,twrX,twrW,twrBase,flrH,sel,opts){
  const fs=opts.fontSize||7,bk=opts.bracket||4;
  const selCol=opts.selColor||CR.blue;
  const lineCol=opts.lineColor||CR.blueMid;
  const ghostCol=opts.ghostColor||CR.blueGhost;
  const fillSel=opts.fillSel||CR.blueMid+'30';
  const fillNorm=opts.fillNorm||CR.blueFaint+'18';
  const nameOff=opts.nameOffset||6;

  for(let i=0;i<10;i++){
    const f=_getFloorData(i);
    const fy=twrBase-(i+1)*flrH;
    const isSel=sel===i;

    if(f.stage>0){
      X.strokeStyle=isSel?selCol:lineCol+'55';
      X.lineWidth=isSel?1.5:0.7;
      X.strokeRect(twrX,fy,twrW,flrH-1);
      const fill=f.stage/3;
      X.fillStyle=isSel?fillSel:fillNorm;
      X.fillRect(twrX,fy,twrW*fill,flrH-1);
      if(f.stage<3){
        const p=Math.sin(_t*2.5+i)*0.12+0.12;
        X.fillStyle=`rgba(126,200,238,${p})`;
        X.fillRect(twrX,fy,twrW*fill,flrH-1);
      }
      // Module dots
      if(opts.modSlots){
        for(let m=0;m<9;m++){
          X.fillStyle=m<f.mods?(m%5===1?CR.cream+'33':m%7===3?CR.red+'28':'rgba(255,255,255,0.15)'):CR.whiteFaint+'18';
          X.fillRect(twrX+opts.modPadX+m*opts.modSpacing,fy+flrH-opts.modOffY,opts.modW,opts.modH);
        }
        if(f.stage<3){
          const stages=['POWER','STRUCTURE','ACTIVATE'];
          X.font=`${opts.stageFont||8}px monospace`;X.fillStyle=CR.whiteFaint;X.textAlign='left';
          X.fillText(f.stage>=3?'COMPLETE':`STAGE: ${stages[f.stage-1]}`,twrX+opts.modPadX,fy+16);
        }
      } else {
        for(let m=0;m<f.mods;m++){
          const col=m%5===1?CR.cream+'44':m%7===3?CR.red+'33':CR.blue+'44';
          X.fillStyle=col;X.fillRect(twrX+3+m*8,fy+flrH-5,6,2);
        }
      }
    } else {
      X.strokeStyle=ghostCol+'88';X.lineWidth=0.5;
      X.strokeRect(twrX,fy,twrW,flrH-1);
    }

    X.font=isSel?`bold ${fs}px monospace`:`${fs}px monospace`;X.textAlign='left';
    X.fillStyle=isSel?CR.white:(f.stage>0?CR.whiteMid+'88':CR.whiteFaint+'88');
    X.fillText(f.name,twrX+twrW+nameOff,fy+flrH/2+(fs<10?3:4));

    if(isSel){
      X.strokeStyle=selCol;X.lineWidth=isSel?1.5:1;
      X.beginPath();
      X.moveTo(twrX-2,fy+bk);X.lineTo(twrX-2,fy);X.lineTo(twrX+bk,fy);
      X.moveTo(twrX+twrW+2,fy+bk);X.lineTo(twrX+twrW+2,fy);X.lineTo(twrX+twrW-bk,fy);
      X.moveTo(twrX-2,fy+flrH-1-bk);X.lineTo(twrX-2,fy+flrH-1);X.lineTo(twrX+bk,fy+flrH-1);
      X.moveTo(twrX+twrW+2,fy+flrH-1-bk);X.lineTo(twrX+twrW+2,fy+flrH-1);X.lineTo(twrX+twrW-bk,fy+flrH-1);
      X.stroke();
    }
  }
}

function _drawStatsPanel(X,x,y,labelSz,valSz,stats){
  X.font=`bold ${labelSz}px monospace`;X.textAlign='left';
  X.fillStyle=CR.whiteDim;X.fillText('POP',x,y);
  X.font=`bold ${valSz}px monospace`;X.fillStyle=CR.white+'cc';
  X.fillText(stats.population.toString(),x,y+valSz+2);

  const satY=y+valSz+labelSz+12;
  X.font=`bold ${labelSz}px monospace`;
  X.fillStyle=stats.satisfaction>50?CR.whiteDim:CR.redDim;
  X.fillText('SAT',x,satY);
  X.font=`bold ${Math.round(valSz*0.8)}px monospace`;
  X.fillStyle=stats.satisfaction>50?CR.blueMid+'cc':CR.red+'cc';
  X.fillText(stats.satisfaction+'%',x,satY+valSz*0.8+2);

  const crY=satY+valSz*0.8+labelSz+12;
  X.font=`bold ${labelSz}px monospace`;X.fillStyle=CR.whiteDim;
  X.fillText('CREDITS',x,crY);
  X.font=`bold ${Math.round(valSz*0.8)}px monospace`;X.fillStyle=CR.cream+'cc';
  X.fillText(stats.credits.toString(),x,crY+valSz*0.8+2);

  const acY=crY+valSz*0.8+labelSz+8;
  X.font=`${labelSz}px monospace`;X.fillStyle=CR.whiteFaint;
  const dark=10-_cache.active-_cache.building;
  X.fillText(`${_cache.active} ACTIVE · ${_cache.building} BUILDING`+(dark>0?` · ${dark} DARK`:''),x,acY);
}

function _drawNextStepPanel(X,x,y,maxW,headerSz,titleSz,textSz,dotW,dotH,dotGap){
  const nextTask=_getNextTask();

  X.font=`bold ${headerSz}px monospace`;X.fillStyle=CR.blue;X.textAlign='left';
  X.fillText('NEXT STEP',x,y);
  X.fillStyle=CR.blueMid+'33';X.fillRect(x,y+4,maxW,1);

  if(nextTask){
    X.font=`bold ${titleSz}px monospace`;X.fillStyle=CR.blue;
    X.fillText(`FLOOR ${nextTask.floor+1}`,x,y+22);
    X.font=`${textSz}px monospace`;X.fillStyle=CR.white+'dd';
    _wrapText(X,nextTask.text,x,y+22+textSz+8,maxW,textSz+4);
    // Secondary: built but not explored
    const bu=_cache.builtUnexplored;
    if(bu&&bu.floor!==nextTask.floor){
      X.font=`${Math.max(7,textSz-1)}px monospace`;X.fillStyle=CR.gold+'bb';
      X.fillText(`Floor ${bu.floor+1} built — enter the tower to bring it online`,x,y+22+textSz*3+16);
    }
  }

  const doneCount=_cache.doneCount;
  X.font=`${Math.max(7,headerSz-2)}px monospace`;X.fillStyle=CR.whiteFaint;
  X.fillText(`${doneCount}/10 COMPLETE`,x,y+105);

  for(let i=0;i<10;i++){
    const done=_getTaskDone(i);
    const isNext=nextTask&&nextTask.floor===i;
    X.fillStyle=done?CR.blue+'88':(isNext?CR.blue+'44':CR.blueGhost+'88');
    X.fillRect(x+i*(dotW+dotGap),y+112,dotW,dotH);
  }
}

function _drawLogPanel(X,x,y,fontSize,lineH){
  if(_logLines.length===0)return;
  X.font=`${fontSize}px monospace`;X.textAlign='left';
  for(let i=0;i<_logLines.length;i++){
    const l=_logLines[i];
    const fadeIn=Math.min(1,l.age/0.5);
    const fadeOut=l.age>LOG_INTERVAL*3?Math.max(0,1-(l.age-LOG_INTERVAL*3)/2):1;
    const a=0.6*fadeIn*fadeOut;
    X.fillStyle=`rgba(144,160,180,${a})`;
    X.fillText('> '+l.text,x,y-((_logLines.length-1-i)*lineH));
  }
}

function _drawHeartbeat(X,x,y,w,freqMul,ampMul){
  const hbSpeed=1.0+(1-Math.min(Math.max(S.sat,0),100)/100)*2.0;
  X.strokeStyle=CR.blueFaint+'44';X.lineWidth=1;
  X.beginPath();
  for(let lx=0;lx<w;lx++){
    const ly=Math.sin(lx*0.018*freqMul+_t*hbSpeed)*4*ampMul+Math.sin(lx*0.06*freqMul+_t*hbSpeed*2.2)*2*ampMul;
    if(lx===0)X.moveTo(x+lx,y+ly);else X.lineTo(x+lx,y+ly);
  }
  X.stroke();
}

function _hitTestTower(mx,my,twrX,twrW,twrBase,flrH,nameW){
  for(let i=9;i>=0;i--){
    const fy=twrBase-(i+1)*flrH;
    if(mx>=twrX-10&&mx<=twrX+twrW+nameW&&my>=fy&&my<=fy+flrH) return i;
  }
  return -1;
}

// ═══ MAIN DRAW ═══
export function drawControlRoom(X,W,H){
  _refreshCache();
  const cr=S.cr;
  X.fillStyle='#000';X.fillRect(0,0,W,H);

  if(cr.phase===0){
    const a=0.012+Math.sin(_t*3)*0.006;
    X.fillStyle=`rgba(120,190,240,${a})`;
    X.fillRect(0,H/2-1,W,2);
    return;
  }

  if(cr.fullScreen){
    if(_topoActive) return; // topo overlay handles its own rendering
    _drawFullScreen(X,W,H);
    return;
  }

  // Scene shake (Feature 5)
  let _shaking=false;
  if(_shakeT>0){
    _shaking=true;X.save();
    const mag=_shakeIntensity*(_shakeT/0.3);
    X.translate((Math.random()-0.5)*mag*2,(Math.random()-0.5)*mag*2);
  }

  // Flicker alpha (Feature 4d)
  _screenAlpha=1;
  if(S.sat<25&&_flickerT>=0&&_flickerT<=0.1)_screenAlpha=0.3+Math.random()*0.4;

  _drawRoom(X,W,H);
  _drawScreen(X,W,H);
  _drawConsole(X,W,H);
  _drawPlayer(X,W,H);
  _drawElevDoors(X,W,H);
  _drawElevPrompt(X,W,H);
  _drawConsolePrompt(X,W,H);
  _drawLighting(X,W,H);

  if(_shaking)X.restore();
}

// ═══ ROOM ═══
function _drawRoom(X,W,H){
  const cr=S.cr;
  const amb=cr.screenOn?0.05+cr.screenBoot*0.04:cr.doorOpen*0.02;

  // Floor
  X.fillStyle=`rgba(8,12,20,${0.65+amb})`;
  X.fillRect(0,H*0.48,W,H*0.52);
  for(let i=0;i<6;i++){
    X.fillStyle=`rgba(60,90,120,${0.01+(1-i/6)*0.012})`;
    X.fillRect(0,H*0.52+i*(H*0.08),W,1);
  }

  // Ceiling
  X.fillStyle='rgba(6,8,14,0.92)';
  X.fillRect(0,0,W,H*0.18);
  X.fillStyle=`rgba(20,28,40,${0.3+amb})`;
  X.fillRect(W*0.0625,H*0.144,W*0.875,3);
  X.fillRect(W*0.1,H*0.152,2,H*0.028);
  X.fillRect(W*0.5,H*0.152,2,H*0.028);
  X.fillRect(W*0.9,H*0.152,2,H*0.028);

  // Side walls (perspective trapezoids)
  X.fillStyle='rgba(8,10,18,0.88)';
  X.beginPath();X.moveTo(0,H*0.18);X.lineTo(W*0.0875,H*0.2);X.lineTo(W*0.0875,H*0.68);X.lineTo(0,H);X.closePath();X.fill();
  X.beginPath();X.moveTo(W,H*0.18);X.lineTo(W*0.9125,H*0.2);X.lineTo(W*0.9125,H*0.68);X.lineTo(W,H);X.closePath();X.fill();

  // Side racks with LEDs
  X.fillStyle=`rgba(12,16,26,${0.5+amb})`;
  X.fillRect(W*0.095,H*0.21,W*0.035,H*0.456);
  for(let i=0;i<9;i++){
    const ry=H*0.224+i*H*0.048;
    const flrStg=i<NF?_cache.floors[i].stage:0;
    const blueOn=flrStg>=5?true:(flrStg>0?Math.sin(_t*3+i*0.7)>0:false);
    X.fillStyle=blueOn?'rgba(126,200,238,0.4)':'rgba(40,50,65,0.2)';
    X.fillRect(W*0.1025,ry,4,3);
    const redOn=Math.sin(_t*1.5+i*1.3)>0.4;
    X.fillStyle=redOn?'rgba(221,160,160,0.25)':'rgba(35,40,50,0.15)';
    X.fillRect(W*0.115,ry,4,3);
  }
  X.fillStyle=`rgba(12,16,26,${0.5+amb})`;
  X.fillRect(W*0.87,H*0.21,W*0.035,H*0.456);
  for(let i=0;i<8;i++){
    const ry=H*0.23+i*H*0.052;
    X.fillStyle=(i+Math.floor(_t*1.2))%4===0?'rgba(126,200,238,0.3)':'rgba(30,40,55,0.2)';
    X.fillRect(W*0.8775,ry,4,3);
  }

  // Elevator light spill
  if(cr.doorOpen>0.1){
    const a=cr.doorOpen*0.035*Math.max(0,1-cr.pz*0.8);
    X.fillStyle=`rgba(140,200,240,${a})`;
    X.beginPath();X.moveTo(W*0.3125,H);X.lineTo(W*0.425,H*0.64);X.lineTo(W*0.575,H*0.64);X.lineTo(W*0.6875,H);X.closePath();X.fill();
  }
}

// ═══ SCREEN ═══
function _drawScreen(X,W,H){
  const cr=S.cr;
  const sx=W*0.1375,sy=H*0.19,sw=W*0.725,sh=H*0.39;

  // Bezel
  X.fillStyle='#080c14';
  X.fillRect(sx-5,sy-5,sw+10,sh+10);

  if(!cr.screenOn){
    X.fillStyle=CR.bg;X.fillRect(sx,sy,sw,sh);return;
  }

  const boot=cr.screenBoot;
  if(boot<0.25){
    X.fillStyle=CR.bg;X.fillRect(sx,sy,sw,sh);
    const lw=(boot/0.25)*sw;
    X.fillStyle=CR.blue+'88';
    X.fillRect(sx+(sw-lw)/2,sy+sh/2-1,lw,2);
    return;
  }

  const alpha=Math.min(1,(boot-0.25)/0.5);
  X.fillStyle=CR.bg;X.fillRect(sx,sy,sw,sh);

  // Scanline tint
  X.fillStyle=`rgba(126,200,238,${0.003*alpha})`;
  X.fillRect(sx,sy,sw,sh);

  X.globalAlpha=alpha*_screenAlpha;
  X.save();
  X.beginPath();X.rect(sx,sy,sw,sh);X.clip();

  _drawStars(X,sx,sy,sw,sh,1);
  _drawEarthMoon(X,sx+sw*0.5,sy+sh+sw*0.55*0.67,sw*0.55,4,sw*0.55+35);

  // Header bar
  X.fillStyle=CR.blueGhost+'88';
  X.fillRect(sx,sy,sw,16);
  X.font='bold 9px monospace';X.textAlign='left';
  X.fillStyle=CR.blueMid;
  X.fillText('SPACE TOWER — SEGMENT 1',sx+10,sy+11);

  // Tower wireframe (left)
  _drawTowerWire(X,sx+20,80,sy+sh-14,16,cr.selectedFloor,{
    fontSize:7,bracket:4,nameOffset:6,
  });

  // Stats (center)
  _drawStatsPanel(X,sx+sw*0.345,sy+30,8,20,_getStats());

  // Next Step (right)
  _drawNextStepPanel(X,sx+sw*0.569,sy+30,sw*0.38,9,11,13,10,4,4);

  // Upcoming tasks (faint)
  const nsX=sx+sw*0.569;
  let upcoming=[];let foundNext=false;
  for(let i=0;i<NF;i++){
    if(!_getTaskDone(i)){
      if(!foundNext){foundNext=true;continue}
      upcoming.push({floor:i,text:TASK_TEXT[i]});
      if(upcoming.length>=2)break;
    }
  }
  upcoming.forEach((task,idx)=>{
    const ty=sy+162+idx*14;
    X.font='7px monospace';X.fillStyle=CR.whiteFaint+'88';X.textAlign='left';
    const txt=`F${task.floor+1}: ${task.text.substring(0,40)}${task.text.length>40?'…':''}`;
    X.fillText(txt,nsX,ty);
  });

  // Feature 1: Log lines
  _drawLogPanel(X,sx+10,sy+sh-28,8,11);

  // Feature 2: RED ALERT text
  if(_redAlertT>1.0){
    X.font='bold 14px monospace';X.textAlign='center';
    const ra=Math.min(1,(_redAlertT-1.0)*2);
    X.fillStyle=`rgba(221,100,100,${0.8*ra})`;
    X.fillText('RED ALERT',sx+sw/2,sy+sh/2);
    X.textAlign='left';
  }

  // Feature 4b: Glitch
  if(_glitchT>0){
    for(let gy=0;gy<sh;gy+=3){
      if(Math.random()>0.4)continue;
      const gx=(Math.random()-0.5)*20;
      X.fillStyle=`rgba(126,200,238,${0.02+Math.random()*0.06})`;
      X.fillRect(sx+gx,sy+gy,sw*0.6+Math.random()*sw*0.4,1);
    }
  }

  // Terrain minimap (when bulldozer unlocked)
  if(S.bulldozer.unlocked&&S.terrain3d.initialized){
    _drawTerrainMini(X,sx+sw-82,sy+sh-72,70,60);
  }

  // Heartbeat (Feature 4a)
  _drawHeartbeat(X,sx+8,sy+sh-8,sw-16,1,1);

  X.restore();
  X.globalAlpha=1;

  // Screen glow
  if(cr.screenOn&&cr.screenBoot>0.5){
    X.fillStyle=`rgba(126,200,238,${0.01*cr.screenBoot})`;
    X.fillRect(sx-12,sy-12,sw+24,sh+24);
  }
}

// ═══ CONSOLE TABLE ═══
function _drawConsole(X,W,H){
  const cr=S.cr;
  if(!cr.screenOn)return;
  X.globalAlpha=Math.min(1,cr.screenBoot);
  const cy=H*0.584,cx=W*0.2,cw=W*0.6;

  X.fillStyle='#0c0e18';X.fillRect(cx,cy,cw,18);
  X.fillStyle='#080a12';X.fillRect(cx,cy+18,cw,7);
  X.fillStyle='#151a2a';X.fillRect(cx,cy,cw,1);

  const btns=[
    {x:12,y:3,w:32,h:6,c:'#7a3838'},{x:48,y:3,w:32,h:6,c:'#7a3838'},{x:84,y:3,w:24,h:6,c:'#7a3838'},
    {x:118,y:3,w:28,h:6,c:'#a0998c'},{x:150,y:3,w:28,h:6,c:'#a0998c'},{x:182,y:3,w:20,h:6,c:'#a0998c'},
    {x:214,y:3,w:12,h:6,c:'#3a5a80'},{x:230,y:3,w:12,h:6,c:'#3a5a80'},{x:246,y:3,w:12,h:6,c:'#3a5a80'},
    {x:270,y:3,w:10,h:6,c:'#8a7a4a'},{x:284,y:3,w:10,h:6,c:'#8a7a4a'},
    {x:12,y:11,w:20,h:5,c:'#7a3838'},{x:36,y:11,w:20,h:5,c:'#7a3838'},
    {x:62,y:11,w:16,h:5,c:'#a0998c'},{x:82,y:11,w:16,h:5,c:'#a0998c'},
    {x:106,y:11,w:10,h:5,c:'#3a5a80'},{x:120,y:11,w:10,h:5,c:'#8a7a4a'},
  ];
  btns.forEach(b=>{
    X.fillStyle=b.c;X.fillRect(cx+b.x,cy+b.y,b.w,b.h);
    X.fillStyle='rgba(255,255,255,0.04)';X.fillRect(cx+b.x,cy+b.y,b.w,1);
  });

  // Feature 2: Button highlight flash
  if(_pressedBtnT>0){
    const fa=_pressedBtnT/0.3;
    if(_pressedBtn==='red'){
      X.fillStyle=`rgba(220,80,80,${0.3*fa})`;
      X.fillRect(cx+12,cy+3,80,6);
    } else if(_pressedBtn==='gold'){
      X.fillStyle=`rgba(200,180,80,${0.3*fa})`;
      X.fillRect(cx+270,cy+3,24,6);
    }
  }

  // Status LEDs on console
  X.fillStyle='#060810';X.fillRect(cx+320,cy+2,148,14);
  X.fillStyle='rgba(221,160,160,0.15)';X.fillRect(cx+326,cy+5,18,3);
  X.fillStyle='rgba(126,200,238,0.12)';X.fillRect(cx+350,cy+5,14,3);
  X.fillStyle='rgba(216,204,184,0.10)';X.fillRect(cx+370,cy+5,14,3);

  X.globalAlpha=1;
}

// ═══ PLAYER (from behind, depth-scaled) ═══
function _drawPlayer(X,W,H){
  const cr=S.cr;
  if(cr.phase<1||(cr.doorOpen<0.15&&cr.phase===1))return;

  const d=cr.pz;
  const scale=3.2-d*2.0;
  const screenX=W/2+cr.px*(0.3+d*0.7)*0.5;
  const jumpOff=(cr.jumpY||0)*scale;
  const screenY=H*0.92-d*H*0.29;
  const walking=cr.walking||(cr.phase===2&&!cr.introWalkDone);
  const bob=walking?Math.sin(_t*6)*1.5:Math.sin(_t*0.7)*0.4;

  X.save();
  X.translate(screenX,screenY+bob+jumpOff);
  X.scale(scale,scale);

  if(cr.walkDir<0&&cr.phase>=3)X.scale(-1,1);

  // Shadow
  X.fillStyle='rgba(0,0,0,0.12)';
  X.beginPath();X.ellipse(0,24,10,2.5,0,0,Math.PI*2);X.fill();

  // Legs
  const ls=walking?Math.sin(_t*6)*0.12:0;
  X.fillStyle='#3a3a50';
  X.save();X.translate(-4,12);X.rotate(ls);X.fillRect(-2,0,4,12);X.restore();
  X.save();X.translate(4,12);X.rotate(-ls);X.fillRect(-2,0,4,12);X.restore();
  // Boots
  X.fillStyle='#2a2a38';
  X.fillRect(-6,22,6,4);X.fillRect(1,22,6,4);

  // Torso
  X.fillStyle='#606060';X.fillRect(-7,-2,14,16);
  // Hi-vis vest
  X.fillStyle='#CCFF00';X.fillRect(-7,-2,14,14);
  X.fillStyle='rgba(255,255,255,0.5)';
  X.fillRect(-7,4,14,2);X.fillRect(-7,8,14,2);

  // Arms
  const as=walking?Math.sin(_t*6)*0.08:0;
  X.fillStyle='#CCFF00';
  X.save();X.translate(-9,0);X.rotate(-as);X.fillRect(-2,0,4,10);X.restore();
  X.save();X.translate(9,0);X.rotate(as);X.fillRect(-2,0,4,10);X.restore();
  // Hands
  X.fillStyle='#d4a878';
  X.beginPath();X.arc(-9,10,2.5,0,Math.PI*2);X.fill();
  X.beginPath();X.arc(9,10,2.5,0,Math.PI*2);X.fill();

  // Head
  X.fillStyle='#d4a878';
  X.beginPath();X.ellipse(0,-8,6,7,0,0,Math.PI*2);X.fill();
  // Hair
  X.fillStyle='#2a1a0a';X.fillRect(-7,-16,14,8);
  X.beginPath();X.ellipse(0,-14,6.5,3,0,0,Math.PI*2);X.fill();
  // Sideburns
  X.fillStyle='#c49868';X.fillRect(-7,-10,2,4);X.fillRect(5,-10,2,4);

  // Hardhat
  X.fillStyle='#FFD700';X.fillRect(-8,-18,16,5);X.fillRect(-6,-20,12,4);
  X.fillStyle='#E8C020';X.fillRect(-9,-14,18,2);

  // Screen glow on player
  if(cr.screenOn){
    X.fillStyle=`rgba(126,200,238,${0.025*cr.screenBoot})`;
    X.fillRect(-8,-20,16,44);
  }
  X.restore();
}

// ═══ ELEVATOR DOORS ═══
function _drawElevDoors(X,W,H){
  const cr=S.cr;
  const slide=cr.doorOpen;
  const halfW=W/2;
  const leftX=-slide*(halfW+20);
  const rightX=halfW+slide*(halfW+20);

  // Left door
  X.fillStyle='#10121c';
  X.fillRect(leftX,0,halfW,H);
  X.fillStyle='rgba(255,255,255,0.012)';
  X.fillRect(leftX+20,20,halfW-40,1);
  X.fillRect(leftX+halfW-3,0,3,H);
  X.fillStyle='rgba(255,255,255,0.006)';
  X.fillRect(leftX+halfW/2,40,1,H-80);

  // Right door
  X.fillStyle='#10121c';
  X.fillRect(rightX,0,halfW,H);
  X.fillStyle='rgba(255,255,255,0.012)';
  X.fillRect(rightX+20,20,halfW-40,1);
  X.fillRect(rightX,0,3,H);

  // Light seam
  if(slide>0&&slide<0.7){
    const seamW=Math.max(1,slide*30);
    X.fillStyle=`rgba(140,200,240,${(1-slide)*0.3})`;
    X.fillRect(W/2-seamW/2,0,seamW,H);
  }

  // Floor line
  X.fillStyle='#0a0c16';
  X.fillRect(0,H*0.62,W,4);
}

// ═══ ELEVATOR PROMPT ═══
function _drawElevPrompt(X,W,H){
  const cr=S.cr;
  if(!cr.nearElev||cr.phase<3)return;
  const pulse=Math.sin(_t*3)*0.15+0.85;
  X.font='bold 14px monospace';X.textAlign='center';
  X.fillStyle=`rgba(126,200,238,${0.7*pulse})`;
  X.fillText('[ E ] USE ELEVATOR',W/2,H-30);
}

// ═══ CONSOLE PROMPT ═══
function _drawConsolePrompt(X,W,H){
  const cr=S.cr;
  if(!_nearConsole||cr.phase<3||cr.nearElev)return;
  const pulse=Math.sin(_t*3)*0.15+0.85;
  X.font='bold 14px monospace';X.textAlign='center';
  X.fillStyle=`rgba(126,200,238,${0.7*pulse})`;
  X.fillText('[ E ] INTERACT',W/2,H*0.56);
  // Show F key hint for topo/full-screen
  const label=S.bulldozer.unlocked?'[ F ] TERRAIN SURVEY':'[ F ] FULL SCREEN';
  X.font='bold 11px monospace';
  X.fillStyle=`rgba(126,200,238,${0.45*pulse})`;
  X.fillText(label,W/2,H*0.56+20);
}

// ═══ LIGHTING ═══
function _drawLighting(X,W,H){
  const cr=S.cr;
  if(cr.screenOn){
    X.fillStyle=`rgba(126,200,238,${cr.screenBoot*0.015})`;
    X.fillRect(W*0.0875,H*0.18,W*0.825,H*0.5);
  }
  // Feature 2: Red alert overlay
  if(_redAlertT>0){
    const pulse=Math.sin(_t*8)*0.5+0.5;
    X.fillStyle=`rgba(180,40,40,${0.08*pulse*Math.min(1,_redAlertT)})`;
    X.fillRect(0,0,W,H);
  }
  const vg=X.createRadialGradient(W*0.475,H*0.6,60,W*0.5,H*0.64,W*0.6);
  vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(0.6,'rgba(0,0,0,0.2)');
  vg.addColorStop(1,'rgba(0,0,0,0.65)');
  X.fillStyle=vg;X.fillRect(0,0,W,H);
}

// ── Terrain minimap (contour sketch on small screen) ──
function _drawTerrainMini(X,mx,my,mw,mh){
  const t3=S.terrain3d;
  const segs=Math.sqrt(t3.heightmap.length)|0;
  if(segs<2)return;

  // Dark background
  X.fillStyle='rgba(6,10,16,0.8)';
  X.fillRect(mx,my,mw,mh);
  X.strokeStyle=CR.blueGhost+'88';
  X.strokeRect(mx,my,mw,mh);

  // Sample every Nth vertex to draw contour-like horizontal lines
  const step=Math.max(1,Math.floor(segs/20));
  const contourInterval=0.8;
  X.lineWidth=0.5;

  for(let iz=0;iz<segs;iz+=step){
    const fy=my+(iz/segs)*mh;
    X.beginPath();
    for(let ix=0;ix<segs;ix+=step){
      const h=t3.heightmap[iz*segs+ix];
      const contourPhase=Math.abs(h%contourInterval)/contourInterval;
      // Draw dots where contour lines would cross
      if(contourPhase<0.15||contourPhase>0.85){
        const fx=mx+(ix/segs)*mw;
        // Color by heat
        const ch=t3.cutHeat[iz*segs+ix]||0;
        const rh=t3.raiseHeat[iz*segs+ix]||0;
        if(ch>0.1)X.fillStyle=`rgba(255,80,40,${Math.min(0.8,ch)})`;
        else if(rh>0.1)X.fillStyle=`rgba(40,255,80,${Math.min(0.8,rh)})`;
        else X.fillStyle=CR.blueMid+'66';
        X.fillRect(fx,fy,1.5,1.5);
      }
    }
  }

  // Label
  X.font='6px monospace';X.fillStyle=CR.blueMid+'aa';X.textAlign='left';
  X.fillText('TERRAIN',mx+2,my+8);

  // Bulldozer position marker
  const half=400/2; // T3D_SIZE
  const bx=mx+((S.bulldozer.wx+half)/400)*mw;
  const bz=my+((S.bulldozer.wz+half)/400)*mh;
  if(bx>=mx&&bx<=mx+mw&&bz>=my&&bz<=my+mh){
    X.fillStyle='#ff0';
    X.fillRect(bx-1,bz-1,3,3);
  }
}

// ═══ FULL-SCREEN ARTBOARD ═══
function _drawFullScreen(X,W,H){
  const cr=S.cr;
  const vW=1600,vH=900;
  const scaleX=W/vW,scaleY=H/vH;
  const sc=Math.min(scaleX,scaleY)*1.2;

  X.save();
  X.translate(cr.fsPanX,cr.fsPanY);
  X.scale(sc,sc);

  X.fillStyle=CR.bg;X.fillRect(0,0,vW,vH);
  X.fillStyle='rgba(126,200,238,0.0015)';X.fillRect(0,0,vW,vH);

  _drawStars(X,0,0,vW,vH,2);
  _drawEarthMoon(X,vW*0.5,vH+vW*0.5*0.67,vW*0.5,8,vW*0.5+80);

  // Header
  X.fillStyle=CR.blueGhost+'66';X.fillRect(0,0,vW,40);
  X.font='bold 14px monospace';X.textAlign='left';
  X.fillStyle=CR.blueMid;
  X.fillText('SPACE TOWER — CONTROL ROOM — SEGMENT 1',28,27);

  // Tower (left)
  const twrTop=55,twrBot=vH-30,flrH=(twrBot-twrTop)/10;
  _drawTowerWire(X,80,200,vH-30,flrH,cr.selectedFloor,{
    fontSize:11,bracket:8,selColor:'#ffffff',lineColor:CR.white,
    fillSel:'rgba(255,255,255,0.06)',fillNorm:'rgba(255,255,255,0.02)',
    nameOffset:14,
    modSlots:true,modPadX:8,modSpacing:21,modOffY:15,modW:17,modH:6,stageFont:8,
  });

  // Stats (center)
  _drawStatsPanel(X,460,90,11,48,_getStats());

  // Next Step (right)
  const nsX=900;
  _drawNextStepPanel(X,nsX,88,600,42,48,36,36,10,8);

  // Full task list
  for(let i=0;i<NF;i++){
    const ty=510+i*42;
    const done=_getTaskDone(i);
    const nextTask=_getNextTask();
    const isCurrent=nextTask&&nextTask.floor===i;
    X.font=isCurrent?'bold 16px monospace':'14px monospace';X.textAlign='left';
    X.fillStyle=done?CR.blueMid+'55':(isCurrent?CR.white:CR.whiteFaint+'88');
    X.fillText(`${done?'✓':isCurrent?'→':'·'}  F${i+1}  ${TASK_TEXT[i]}`,nsX,ty);
  }

  // Log lines
  _drawLogPanel(X,40,vH-70,14,20);

  // Heartbeat
  _drawHeartbeat(X,20,vH-30,vW-40,0.44,2);

  X.restore();

  // Full-screen toggle hint
  X.font='bold 11px monospace';X.textAlign='right';
  X.fillStyle='rgba(126,200,238,0.5)';
  X.fillText('[ ESC ] ROOM VIEW',W-20,24);
}

// ═══ CLICK HANDLING ═══
export function crClick(mx,my){
  const cr=S.cr;
  if(cr.phase<3)return;

  if(cr.fullScreen){
    const vW=1600,vH=900;
    const W=innerWidth,H=innerHeight;
    const sc=Math.min(W/vW,H/vH)*1.2;
    const vmx=(mx-cr.fsPanX)/sc;
    const vmy=(my-cr.fsPanY)/sc;
    const twrTop=55,twrBot=vH-30,flrH=(twrBot-twrTop)/10;
    const hit=_hitTestTower(vmx,vmy,80,200,vH-30,flrH,100);
    cr.selectedFloor=hit>=0&&cr.selectedFloor===hit?-1:hit;
    return;
  }

  // Room-view click detection (screen tower area)
  const C=document.getElementById('gameCanvas');
  const W=C.width,H=C.height;
  const sx=W*0.1375,sy=H*0.19,sh=H*0.39;
  const hit=_hitTestTower(mx,my,sx+20,80,sy+sh-14,16,80);
  cr.selectedFloor=hit>=0&&cr.selectedFloor===hit?-1:hit;
}

// ═══ DETAIL PANEL (drawn on canvas) ═══
export function drawCRDetailPanel(X,W,H){
  const cr=S.cr;
  if(cr.selectedFloor<0)return;
  const fi=cr.selectedFloor;
  const f=_getFloorData(fi);

  const pw=Math.min(480,W*0.5),ph=120;
  const px=16,py=H-ph-16;

  // Background
  X.fillStyle='rgba(6,10,16,0.94)';
  X.fillRect(px,py,pw,ph);
  X.strokeStyle=CR.blueFaint+'40';X.lineWidth=1;
  X.strokeRect(px,py,pw,ph);

  // Header
  X.font='bold 11px monospace';X.textAlign='left';
  X.fillStyle=CR.blue;
  X.fillText(`FLOOR ${fi+1} — ${f.name}`,px+12,py+18);
  X.font='10px monospace';X.fillStyle=CR.whiteFaint;
  X.fillText(`STAGE ${f.stage}/3 · ${f.mods}/9 MODULES`,px+12,py+34);

  // Close hint
  X.font='9px monospace';X.textAlign='right';X.fillStyle=CR.whiteDim;
  X.fillText('CLICK TO CLOSE',px+pw-12,py+18);

  // Description
  X.font='12px monospace';X.textAlign='left';X.fillStyle=CR.whiteMid;
  _wrapText(X,FLOOR_DESC[fi],px+12,py+54,pw-24,16);
}

// ═══ FULL-SCREEN PAN (mouse drag) ═══
let _fsDragging=false,_fsDragStartX=0,_fsDragStartY=0,_fsPanStartX=0,_fsPanStartY=0;

export function crMouseDown(mx,my){
  if(!S.cr.fullScreen)return;
  _fsDragging=true;
  _fsDragStartX=mx;_fsDragStartY=my;
  _fsPanStartX=S.cr.fsPanX;_fsPanStartY=S.cr.fsPanY;
}
export function crMouseMove(mx,my){
  if(!_fsDragging)return;
  S.cr.fsPanX=_fsPanStartX+(mx-_fsDragStartX);
  S.cr.fsPanY=_fsPanStartY+(my-_fsDragStartY);
}
export function crMouseUp(){_fsDragging=false}
