'use strict';
import { S, syncLitFloors, cZoom, tZoom, setCZoom, setTZoom, getActiveBuildFloor } from './state.js';
import { TB, FH, FT, TL, TR, UW, GRAV, JUMP_F, JUMP_MX, CHG_MX, DROP_MX, MOB, pk, ELEV_X, NF, BPF, PG } from './constants.js';
import { FD } from './floors.js';
import { CASUAL_TOPS_M } from './npcs.js';
import { initCanvas, draw, showMsg, getInter, nearSuit, spawnParticles, triggerShake, triggerFlash } from './render.js';
import { setupInput } from './input.js';
import { setupPanel, renderPanel } from './panel.js';
import { genWorld } from './world.js';
import { loadGame, autoSave } from './save.js';
import { setupCompendium, isCompendiumOpen } from './compendium.js';
import { ensureAudio, sndStep, sndTalk, sndWarn, sndElev, sndBuild, sndTile, sndWhoosh, sndChime, sndBoom, sndGrow, sndData, sndAwe, soundOn, toggleSound, getAudioCtx, sndDoorHumStart, sndDoorHumStop } from './sound.js';
import { initMusic, saveMusicState, setMuted as setMusicMuted } from './music.js';
import { setupRadio } from './radio-ui.js';
import { checkReckoningTrigger, updateReckoning, checkReckoningBell, startRematch, isReckoningFrozen, isReckoningActive, setupTestMode, handleReckoningIntroE, handleReckoningColorLeft, handleReckoningColorRight, handleReckoningColorConfirm, checkColorWheel, openColorWheel } from './reckoning.js';
import { isKeeperProximity, startKeeperZoom, endKeeperZoom, updateKeeper, advanceKeeperDialogue, getZoomState } from './keeper.js';
import { enterControlRoom, exitControlRoom, updateControlRoom, handleConsoleInteract } from './control-room.js';

// ═══ REAL-TIME ACCUMULATORS (frame-rate independent) ═══
let _lastFrameTime = 0;
let _saveAcc = 0;     // auto-save every 60s
const SAVE_INTERVAL = 60000;

// ═══ DOOR EXIT ═══
let _exitDoorCheck = null;
let _simStartTime = 0;
let _keeperDebounce = false;

// ═══ ELEVATOR PANEL ═══
let elevPanel, elevFloors, fpElRef;

function openElev(){
  ensureAudio();
  S.elevOpen=true;
  S.elevSelected=S.player.cf;
  elevFloors.innerHTML='';
  for(let fi=NF-1;fi>=0;fi--){
    const fd=FD[fi],stg=S.buildout[fi].stage,cur=S.player.cf===fi;
    const div=document.createElement('div');
    div.className='elev-floor'+(cur?' current':'')+(fi===S.elevSelected?' selected':'');
    div.innerHTML=`<span style="opacity:${stg>=1?1:0.35}">${fd.name}</span><span class="ef-num">${stg>=5?'★':stg>0?`${stg}/5`:'—'}</span>`;
    div.dataset.fi=fi;
    if(!cur){div.addEventListener('click',()=>rideElev(fi))}
    elevFloors.appendChild(div);
  }
  // Basement: Control Room
  const bDiv=document.createElement('div');
  bDiv.className='elev-floor'+(S.elevSelected===-1?' selected':'');
  bDiv.dataset.fi='-1';
  bDiv.innerHTML='<span style="opacity:0.6">CONTROL ROOM</span><span class="ef-num">B</span>';
  bDiv.addEventListener('click',()=>{closeElev();enterControlRoom()});
  elevFloors.appendChild(bDiv);

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

// ─── Activation Moments (Stage 5) ───
function triggerActivation(fi){
  // Floor center Y in world coords
  const fy=TB-(fi*FH);
  const cx=0; // center of tower
  switch(fi){
    case 0: // LOBBY — doors swing open, gust of air
      triggerShake(8);
      triggerFlash('#fffbe0',0.5);
      sndWhoosh();
      // Motes drifting inward from left
      spawnParticles(TL+100,fy-FH*0.5,25,'rgba(255,245,200,0.6)',{speed:3,life:80,size:2,spread:Math.PI*0.6,dir:0,gravity:-0.02});
      break;
    case 1: // QUARTERS — warm amber pulse, first resident fades in
      triggerFlash('#ffd080',0.35);
      sndChime();
      // Warm glow particles at doorway
      spawnParticles(TL+900,fy-FH*0.3,12,'rgba(255,200,120,0.5)',{speed:1,life:60,size:2.5,spread:Math.PI,dir:-Math.PI/2,gravity:-0.01});
      break;
    case 2: // GARDEN — green burst, pollen floats upward
      triggerFlash('#80ff60',0.3);
      sndGrow();
      // Pollen/spore particles rising
      spawnParticles(cx,fy-10,35,'rgba(180,240,80,0.6)',{speed:1.5,life:90,size:2,spread:Math.PI*0.8,dir:-Math.PI/2,gravity:-0.04});
      spawnParticles(cx,fy-10,15,'rgba(255,240,60,0.4)',{speed:1,life:70,size:1.5,spread:Math.PI,dir:-Math.PI/2,gravity:-0.03});
      break;
    case 3: // RESEARCH — blue-white flash, data rain
      triggerFlash('#a0c0ff',0.45);
      sndData();
      // Data particles streaming downward
      for(let dx=-600;dx<=600;dx+=150){
        spawnParticles(dx,fy-FH,8,'rgba(100,180,255,0.5)',{speed:2.5,life:50,size:1.5,spread:0.3,dir:Math.PI/2,gravity:0.02});
      }
      break;
    case 4: // RESTAURANT — warm amber bloom, pendant lights moment
      triggerFlash('#ffe0a0',0.4);
      sndChime();
      triggerShake(3);
      // Warm glow particles at ceiling (pendant lights turning on)
      for(let lx=-500;lx<=500;lx+=350){
        spawnParticles(lx,fy-FH+30,6,'rgba(255,210,100,0.6)',{speed:0.8,life:50,size:3,spread:Math.PI,dir:Math.PI/2,gravity:0.01});
      }
      break;
    case 5: // LOUNGE — softest activation, warm sigh
      triggerFlash('#ffe8d0',0.2);
      sndChime();
      // Very gentle warm particles drifting
      spawnParticles(cx,fy-FH*0.5,10,'rgba(255,220,160,0.4)',{speed:0.5,life:80,size:2,spread:Math.PI*2,dir:0,gravity:-0.01});
      break;
    case 6: // OBSERVATION — cool blue-white flash, sparkles on glass
      triggerFlash('#d0e8ff',0.4);
      sndAwe();
      // Sparkle particles at window positions
      spawnParticles(TL+200,fy-FH*0.6,8,'rgba(200,230,255,0.7)',{speed:1,life:60,size:2,spread:Math.PI,dir:-Math.PI/2,gravity:-0.01});
      spawnParticles(TR-200,fy-FH*0.6,8,'rgba(200,230,255,0.7)',{speed:1,life:60,size:2,spread:Math.PI,dir:-Math.PI/2,gravity:-0.01});
      break;
    case 7: // STORAGE — industrial yellow flash, sharp shake
      triggerFlash('#ffe040',0.4);
      triggerShake(10);
      sndBoom();
      // Industrial sparks
      spawnParticles(cx,fy-FH*0.5,20,'rgba(255,220,60,0.7)',{speed:3,life:40,size:2,spread:Math.PI*2,dir:0,gravity:0.06});
      break;
    case 8: // OBSERVATORY — first light beam, star scatter
      triggerFlash('#e0eeff',0.5);
      sndAwe();
      // Vertical beam of white light from ceiling
      spawnParticles(cx,fy-FH*0.5,30,'rgba(200,220,255,0.6)',{speed:2,life:70,size:2.5,spread:0.4,dir:Math.PI/2,gravity:-0.01});
      // Star-like particles scattering from beam
      spawnParticles(cx,fy-FH*0.3,20,'rgba(255,255,255,0.5)',{speed:2.5,life:60,size:1.5,spread:Math.PI*2,dir:0,gravity:0});
      break;
    case 9: // COMMAND — status cascade, golden tower pulse
      sndBoom();
      triggerShake(6);
      // Rapid status LED cascade (bottom to top, delayed via setTimeout)
      for(let ci=0;ci<9;ci++){
        setTimeout(()=>{
          triggerFlash('#ffd700',0.12);
          const cfy=TB-(ci*FH)-FH*0.5;
          spawnParticles(0,cfy,4,'rgba(255,215,0,0.6)',{speed:1.5,life:30,size:2,spread:Math.PI*2,dir:0,gravity:0});
        },ci*80);
      }
      // Final golden pulse after cascade
      setTimeout(()=>{
        triggerFlash('#ffd700',0.6);
        triggerShake(4);
        sndAwe();
      },750);
      break;
  }
  // Queue NPC arrivals for this floor
  let delay=90;
  S.npcs.forEach((n,idx)=>{
    if(n.floor===fi&&!n.arrived){
      S.arrivalQueue.push({npcIdx:idx,delay});
      delay+=120;
    }
  });
}

// ─── NPC Discovery ───
function discoverNpc(n, lineText){
  if(!S.compendium.entries[n.name]){
    S.compendium.entries[n.name]={name:n.name,type:n.type||'w',app:n.app||null,pal:n.pal||null,color:n.color||null,dialogueHeard:[]};
  }
  const e=S.compendium.entries[n.name];
  if(!e.dialogueHeard.includes(lineText))e.dialogueHeard.push(lineText);
}

// ═══ ARRIVAL SYSTEM ═══
function processArrivals(){
  // Process queue — decrement delays, spawn NPCs at door when ready
  for(let i=S.arrivalQueue.length-1;i>=0;i--){
    const q=S.arrivalQueue[i];
    q.delay--;
    if(q.delay<=0){
      const n=S.npcs[q.npcIdx];
      n.x=TL+10;n.y=TB-48;n.onF=true;n.vx=0;n.vy=0;
      n.arrState='entering';n.fr=true;
      S.arrivalQueue.splice(i,1);
    }
  }
  // NPC arrival state machine
  S.npcs.forEach(n=>{
    if(n.arrived||n.arrState==='queue')return;
    if(n.arrState==='entering'){
      n.vx=4;n.fr=true;n.st='walk';
      n.x+=n.vx;
      // Gravity + floor collision
      n.y+=n.vy;n.vy+=GRAV;
      n.onF=false;
      for(let f of S.floors){if(f.level<0)continue;if(n.vy>=0&&n.y<=f.y&&n.y+n.vy>=f.y){n.y=f.y;n.vy=0;n.onF=true;break}}
      if(n.y>TB){n.y=TB;n.vy=0;n.onF=true}
      n.bob+=0.2;
      if(n.x>=ELEV_X-80){
        if(n.floor===0){n.arrived=true;n.arrState='done';n.x=n.destX;n.vx=0;n.st='idle'}
        else{n.arrState='riding';n.arrTimer=60+n.floor*10;n.vx=0;n.st='idle'}
      }
    } else if(n.arrState==='riding'){
      n.arrTimer--;
      if(n.arrTimer<=0){
        n.x=ELEV_X+80;n.y=TB-(n.floor*FH)-48;n.onF=true;n.vy=0;
        n.arrState='arriving';n.fr=n.destX>n.x;
      }
    } else if(n.arrState==='arriving'){
      const dir=n.destX>n.x?1:-1;
      n.vx=3*dir;n.fr=dir>0;n.st='walk';
      n.x+=n.vx;
      // Gravity + floor collision
      n.y+=n.vy;n.vy+=GRAV;
      n.onF=false;
      for(let f of S.floors){if(f.level<0)continue;if(n.vy>=0&&n.y<=f.y&&n.y+n.vy>=f.y){n.y=f.y;n.vy=0;n.onF=true;break}}
      n.bob+=0.2;
      if(Math.abs(n.x-n.destX)<20){n.arrived=true;n.arrState='done';n.x=n.destX;n.vx=0;n.st='idle'}
    }
  });
  // Door auto-open logic (both sides, works from inside and outside)
  const p=S.player;
  const atGround=p.y>=TB-100;
  const nearDoorL=atGround&&Math.abs(p.x-TL)<80;
  const nearDoorR=atGround&&Math.abs(p.x-TR)<80;
  const npcEntering=S.npcs.some(n=>n.arrState==='entering'&&n.x<TL+80);
  S.door.open+=((nearDoorL||npcEntering?1:0)-S.door.open)*0.08;
  S.door.openR+=((nearDoorR?1:0)-S.door.openR)*0.08;
}

// ═══ UPDATE ═══
function update(){
  // Control room — completely separate scene
  if(S.cr.active){
    const _crNow=performance.now();
    const _crDt=Math.min((_crNow-(_lastFrameTime||_crNow))/1000,0.05);
    _lastFrameTime=_crNow;
    updateControlRoom(_crDt);
    // E to exit
    if(S.cr.nearElev&&S.jp.KeyE){exitControlRoom();S.jp.KeyE=false}
    // Escape to leave full-screen / deselect
    if(S.jp.Escape){
      if(S.cr.fullScreen){S.cr.fullScreen=false;S.cr.fsPanX=0;S.cr.fsPanY=0}
      else if(S.cr.selectedFloor>=0)S.cr.selectedFloor=-1;
    }
    // F to toggle full-screen monitor
    if(S.jp.KeyF&&S.cr.phase===3){S.cr.fullScreen=!S.cr.fullScreen;S.cr.fsPanX=0;S.cr.fsPanY=0}
    // E to interact with console buttons
    if(S.jp.KeyE&&S.cr.phase===3&&!S.cr.nearElev)handleConsoleInteract();
    S.jp={};
    return;
  }
  processArrivals();
  // Dynamic rooftop — keep floor entry in sync for collision
  const _abf2=getActiveBuildFloor();
  const _dynRY=TB-(_abf2>=0?_abf2+1:NF)*FH;
  const _rf=S.floors.find(f=>f.level===-1);
  if(_rf){_rf.y=_dynRY;S.floors.sort((a,b)=>a.y-b.y)}
  // Advance build reveal timers + per-tile sound (30% speed — slow sweep)
  for(let i=0;i<NF;i++){
    const rt=S.buildout[i].revealT;
    if(rt<BPF*10+40){
      S.buildout[i].revealT++;
      for(let bi=0;bi<BPF;bi++){if(rt===bi*10)sndTile(bi)}
    }
  }
  // Reckoning + Keeper updates
  checkReckoningTrigger();updateReckoning();
  updateKeeper();
  const p=S.player,k=S.keys,inter=getInter();
  S.frame++;
  const zLerp=(p.isChg||p.isDrp)?0.04:0.15;
  setCZoom(cZoom+(tZoom-cZoom)*zLerp);
  if(S.elevAnim==='idle'){S.elevDoorTarget=(inter&&inter.t==='elev')?1:(S.elevOpen?1:0)}
  S.elevDoors+=(S.elevDoorTarget-S.elevDoors)*0.08;
  if(S.elevAnim==='closing'){if(S.elevDoors<0.02){S.elevAnim='traveling';S.elevAnimT=30}}
  else if(S.elevAnim==='traveling'){S.elevAnimT--;if(S.elevAnimT<=0){p.x=ELEV_X;p.y=TB-(S.elevTo*FH);p.vy=0;p.vx=0;p.onF=true;p.st='idle';p.cf=S.elevTo;S.cam.x=p.x;S.cam.y=p.y-60;S.elevAnim='opening';S.elevDoorTarget=1;sndElev()}}
  else if(S.elevAnim==='opening'){if(S.elevDoors>0.95)S.elevAnim='idle'}

  const frameNow=performance.now(),frameDt=_lastFrameTime?frameNow-_lastFrameTime:16;_lastFrameTime=frameNow;
  if(S.jp['KeyF']){const spEl=document.getElementById('sp');if(p.suit){p.suit=false;spEl.style.display='none'}else{const s=nearSuit();if(s){s.taken=true;p.suit=true;p.suitC=pk(CASUAL_TOPS_M);spEl.style.display='block'}}}
  _saveAcc+=frameDt;if(_saveAcc>=SAVE_INTERVAL){_saveAcc-=SAVE_INTERVAL;autoSave()}
  // Reckoning intro E handler (skip typewriter / begin)
  if(S.reckoning.phase==='INTRO'){if(k['KeyE']&&!S.iLock){handleReckoningIntroE();S.iLock=true}if(!k['KeyE'])S.iLock=false}
  // Reset iLock during non-interactive reckoning phases so it doesn't stay stuck
  if(S.reckoning.phase==='COUNTDOWN'||S.reckoning.phase==='ACTIVE'||S.reckoning.phase==='FLOOD'||S.reckoning.phase==='RESULT'){if(!k['KeyE'])S.iLock=false}
  // Reckoning color pick handler (post-reckoning or free-roam recolor)
  if(S.reckoning.phase==='COLOR_PICK'||S.reckoning.colorPick){
    if(S.jp['ArrowLeft']||S.jp['KeyA'])handleReckoningColorLeft();
    if(S.jp['ArrowRight']||S.jp['KeyD'])handleReckoningColorRight();
    if(k['KeyE']&&!S.iLock){handleReckoningColorConfirm();S.iLock=true}
    if(S.jp['Escape']&&S.reckoning.colorPick&&S.reckoning.phase==='DONE'){S.reckoning.colorPick=false}
    if(!k['KeyE'])S.iLock=false;
  }
  // Reckoning rematch bell E handler
  if(k['KeyE']&&!S.iLock&&checkReckoningBell()){startRematch();S.iLock=true}
  // Color wheel station E handler
  if(k['KeyE']&&!S.iLock&&checkColorWheel()){openColorWheel();S.iLock=true}
  // Keeper E/Escape handler
  if(S.keeper.active){
    if(S.keeper.llmMode){
      if(S.jp['Escape'])endKeeperZoom();
    } else {
      if(k['KeyE']&&!S.iLock){advanceKeeperDialogue();S.iLock=true}
      if(!k['KeyE'])S.iLock=false;
      if(S.jp['Escape']){endKeeperZoom()}
    }
  }
  // Keeper proximity auto-trigger (debounce: must leave proximity before re-triggering)
  if(!S.keeper.active&&isKeeperProximity()&&getZoomState()==='idle'&&!_keeperDebounce){startKeeperZoom();_keeperDebounce=true}
  if(!isKeeperProximity())_keeperDebounce=false;
  // E to go outside — near front door (either side) or at frame edges after falling off
  const _xMin=TL-UW+p.w/2+50,_xMax=TR+UW-p.w/2-50;
  const _nearExit=!isReckoningActive()&&(
    (p.y>=TB-100&&(p.x<TL+50||p.x>TR-50)) || // ground floor, either wall
    (p.x<=_xMin||p.x>=_xMax)                   // frame edges (fell off building)
  );
  if(k['KeyE']&&!S.iLock&&_exitDoorCheck&&performance.now()-_simStartTime>800&&_nearExit){_exitDoorCheck();S.iLock=true}
  // RGB door ambient hum
  if(p.cf===4&&S.buildout[4].stage>=5&&Math.abs(p.x-(TL+2*PG+PG/2))<200){sndDoorHumStart()}else{sndDoorHumStop()}
  const _f8frozen=isReckoningFrozen()||S.keeper.active;
  if(!S.elevOpen&&S.elevAnim==='idle'&&!isCompendiumOpen()&&!_f8frozen){
  // Crane driving mode
  if(p.crane>=0){
    const _cc=S.cranes[p.crane],_cabY=_cc.y-200;
    p.x=_cc.x;p.y=_cabY;p.vx=0;p.vy=0;p.onF=true;p.st='idle';
    if(k['ArrowLeft']||k['KeyA'])_cc.angle-=1.5*(frameDt/16);
    if(k['ArrowRight']||k['KeyD'])_cc.angle+=1.5*(frameDt/16);
    if(S.jp['KeyE']||S.jp['Escape']){p.crane=-1;S.iLock=true}
  } else {
  const jk=k['ArrowUp']||k['KeyW'],dk=k['ArrowDown']||k['KeyS'];
  const stUp=inter&&inter.t==='up',stDn=inter&&inter.t==='dn';
  if(p.st!=='climb'){
    p.vx=0;
    const _spr=k['ShiftLeft']||k['ShiftRight']?2:1;
    const _lk=k['ArrowLeft']||k['KeyA'],_rk=k['ArrowRight']||k['KeyD'];
    if(_lk){p.vx=-p.spd*_spr;p.fr=false;if(p.onF)p.st='walk'}
    if(_rk){p.vx=p.spd*_spr;p.fr=true;if(p.onF)p.st='walk'}
    // Wall slide: override horizontal input — stick to wall
    if(p.wallSlide){
      p.vx=0;
      // Detach if pressing away from wall
      if((p.wallDir===-1&&_rk)||(p.wallDir===1&&_lk)){p.wallSlide=false}
      // Wall jump
      else if(jk||k['Space']){
        p.vy=-14;p.wallSlide=false;p.st='jump';
        p.wjVx=-p.wallDir*8;p.fr=p.wallDir===-1;
        p.flipInitVel=p.vy;p.flipCommitted=true;
      }
    }
    // Add wall jump momentum
    if(p.wjVx){p.vx+=p.wjVx;p.wjVx*=0.9;if(Math.abs(p.wjVx)<0.3)p.wjVx=0}
    if(p.vx===0&&p.onF&&!p.isChg&&!p.isDrp)p.st='idle';
    if(jk&&stUp){p.st='climb';p.clT=inter.v;p.clP=0;p.x=inter.v.bx;p.vx=0;p.isChg=false;p.chgT=0;setTZoom(p.baseZoom||tZoom)}
    else if(jk||k['Space']){
      if(p.onF){if(!p.isChg)p.baseZoom=tZoom;p.isChg=true;p.chgT=Math.min(p.chgT+1,CHG_MX);setTZoom(p.baseZoom-p.chgT/CHG_MX*0.2)}
    } else {if(p.isChg&&p.onF){const t=p.chgT/CHG_MX;p.vy=JUMP_F+(JUMP_MX-JUMP_F)*t;p.onF=false;p.st='jump';p.flipInitVel=p.vy;p.flipCommitted=t>=0.15;p.wallSlide=false}if(p.isChg)setTZoom(p.baseZoom);p.isChg=false;p.chgT=0}
    if(dk&&p.onF&&!stDn){if(!p.isDrp)p.baseZoom=p.baseZoom||tZoom;p.isDrp=true;p.drpT=Math.min(p.drpT+1,DROP_MX);setTZoom(p.baseZoom-p.drpT/DROP_MX*0.25)}
    else if(dk&&stDn){p.st='climb';p.clT=inter.v;p.clP=1;p.x=inter.v.tx;p.vx=0;p.isDrp=false;p.drpT=0;setTZoom(p.baseZoom||tZoom)}
    else{if(p.isDrp&&p.drpT>3&&p.onF){p.drpPhase=Math.floor(p.drpT/DROP_MX*3);p.y+=FT+4;p.vy=4;p.onF=false;p.st='jump'}if(p.isDrp)setTZoom(p.baseZoom||tZoom);p.isDrp=false;p.drpT=0}
    if(k['KeyE']&&inter){if(!S.iLock){if(inter.t==='elev'&&!isReckoningFrozen()){openElev()}else if(inter.t==='build'){const{floor,stage,def}=inter.v;S.buildout[floor].stage=stage+1;S.buildout[floor].revealT=0;syncLitFloors();if(stage+1>=5)triggerActivation(floor);else sndBuild();showMsg(def.msg[0],def.msg[1]);autoSave()}else if(inter.t==='obj')showMsg(inter.v.nm,inter.v.m[Math.floor(Math.random()*inter.v.m.length)]);
      else if(inter.t==='npc'){const n=inter.v;if(n.convo){const line=n.convo[Math.min(n.ci,n.convo.length-1)];const lineText=line(n.name);showMsg(n.name,lineText);sndTalk();discoverNpc(n,lineText);if(n.ci<n.convo.length-1)n.ci++}
      }S.iLock=true}}
    // E to enter crane — on cab platform, no other interaction
    if(k['KeyE']&&!S.iLock&&p.onF&&p.crane<0){
      for(let ci=0;ci<S.cranes.length;ci++){
        const _cr=S.cranes[ci],_cabY=_cr.y-200;
        if(Math.abs(p.y-_cabY)<10&&Math.abs(p.x-_cr.x)<60){p.crane=ci;S.iLock=true;break}
      }
    }
    if(!k['KeyE'])S.iLock=false;
  } else {
    const st=p.clT;if(jk){p.clP+=0.018;p.fr=st.tx>st.bx}else if(dk){p.clP-=0.018;p.fr=st.bx>st.tx}
    if(p.clP>=1){p.clP=1;p.st='idle';p.clT=null;p.x=st.tx;p.y=st.ty;p.vy=0}
    else if(p.clP<=0){p.clP=0;p.st='idle';p.clT=null;p.x=st.bx;p.y=st.by;p.vy=0}
    else{p.x=st.bx+(st.tx-st.bx)*p.clP;p.y=st.by+(st.ty-st.by)*p.clP}
  }
  if(p.st!=='climb'){
    const _prevX=p.x;
    p.x+=p.vx;p.y+=p.vy;p.vy+=GRAV;
    // Wall slide: cap fall speed (gravity still applies so ascending jumps arc naturally)
    if(p.wallSlide){if(p.vy>1.5)p.vy=1.5}
    const xMin=TL-UW+p.w/2,xMax=TR+UW-p.w/2;
    if(p.x<xMin)p.x=xMin;if(p.x>xMax)p.x=xMax;
    // Tower walls — solid below building height, open above rooftop
    const _wm=p.w/2;
    if(p.y>=_dynRY){
      const _wasIn=_prevX>=TL&&_prevX<=TR;
      if(_wasIn){if(p.x<TL+_wm)p.x=TL+_wm;if(p.x>TR-_wm)p.x=TR-_wm}
      else if(_prevX<TL){if(p.x>TL-_wm)p.x=TL-_wm}
      else{if(p.x<TR+_wm)p.x=TR+_wm}
    }
    // Wall slide — descending and pressed against tower wall (interior or exterior)
    if(p.st==='jump'&&!p.onF&&p.vy>=0&&p.y>=_dynRY){
      const _wasIn2=_prevX>=TL&&_prevX<=TR;
      if(_wasIn2){
        if(p.x<=TL+_wm+2){p.x=TL+_wm;p.wallSlide=true;p.wallDir=-1;p.wjVx=0;p.fr=true}
        else if(p.x>=TR-_wm-2){p.x=TR-_wm;p.wallSlide=true;p.wallDir=1;p.wjVx=0;p.fr=false}
      } else if(_prevX<TL){
        if(p.x>=TL-_wm-2){p.x=TL-_wm;p.wallSlide=true;p.wallDir=1;p.wjVx=0;p.fr=false}
      } else {
        if(p.x<=TR+_wm+2){p.x=TR+_wm;p.wallSlide=true;p.wallDir=-1;p.wjVx=0;p.fr=true}
      }
    }
    p.onF=false;
    for(let f of S.floors){if(p.vy>=0&&p.y<=f.y&&p.y+p.vy>=f.y){if(f.level<0&&(p.x<TL||p.x>TR))continue;if(f.level>=0&&(p.x<TL||p.x>TR))continue;if(f.level>=0&&S.buildout[f.level].stage<1&&f.level!==_abf2)continue;if(p.drpPhase>0&&f.level>=0){p.drpPhase--;continue}p.y=f.y;p.vy=0;p.cf=f.level;p.onF=true;if(p.st==='jump'){p.st=p.vx===0?'idle':'walk';p.flipCommitted=false;p.wallSlide=false}break}}
    if(p.y>TB){p.y=TB;p.vy=0;p.onF=true;p.drpPhase=0;p.cf=0;p.flipCommitted=false;p.wallSlide=false}
    // Crane cab collision (wide platform — 120px across)
    if(!p.onF&&p.vy>=0){
      for(let ci=0;ci<S.cranes.length;ci++){
        const _cr=S.cranes[ci],_cabY=_cr.y-200;
        if(p.y<=_cabY&&p.y+p.vy>=_cabY&&Math.abs(p.x-_cr.x)<60){
          p.y=_cabY;p.vy=0;p.onF=true;p.cf=-1;
          p.st=p.vx===0?'idle':'walk';p.flipCommitted=false;p.wallSlide=false;
          break;
        }
      }
    }
  }
  } // end crane else
  } // end movement guard
  if(S.elevOpen){
    if(S.jp['ArrowUp']||S.jp['KeyW']){let ns=S.elevSelected+1;while(ns<NF&&ns>=0&&S.buildout[ns].stage<1&&ns!==p.cf)ns++;if(ns<NF){S.elevSelected=ns;updateElevHighlight()}}
    if(S.jp['ArrowDown']||S.jp['KeyS']){let ns=S.elevSelected-1;while(ns>=0&&S.buildout[ns].stage<1&&ns!==p.cf)ns--;if(ns>=-1){S.elevSelected=ns;updateElevHighlight()}}
    if(S.jp['Enter']||S.jp['KeyE']){
      if(S.elevSelected===-1){closeElev();enterControlRoom()}
      else if(S.elevSelected!==p.cf&&S.buildout[S.elevSelected].stage>=1)rideElev(S.elevSelected);
    }
  }
  S.npcs.forEach(n=>{
    if(!n.arrived)return; // arrival system handles unarrived NPCs
    n.at--;if(n.at<=0){n.at=60+Math.random()*140;const r=Math.random();if(r<0.4){n.st='idle';n.vx=0}else if(r<0.7){n.st='walk';n.vx=n.spd;n.fr=true}else{n.st='walk';n.vx=-n.spd;n.fr=false}}
    if(n.type==='b'){n.jt--;if(n.jt<=0&&n.onF){n.vy=-6;n.onF=false;n.jt=180+Math.floor(Math.random()*180)}if(n.st==='walk')n.lp+=0.18}
    n.x+=n.vx;const elevL=ELEV_X-80,elevR=ELEV_X+80;if(n.x>elevL&&n.x<ELEV_X&&n.vx>0){n.x=elevL;n.vx=-n.vx;n.fr=false}if(n.x<elevR&&n.x>ELEV_X&&n.vx<0){n.x=elevR;n.vx=-n.vx;n.fr=true}n.y+=n.vy;n.vy+=GRAV;if(n.x<TL+30){n.x=TL+30;n.vx=Math.abs(n.vx);n.fr=true}if(n.x>TR-30){n.x=TR-30;n.vx=-Math.abs(n.vx);n.fr=false}
    n.onF=false;for(let f of S.floors){if(f.level<0)continue;if(n.vy>=0&&n.y<=f.y&&n.y+n.vy>=f.y){n.y=f.y;n.vy=0;n.onF=true;break}}
    if(n.st==='walk')n.bob+=0.2;else n.bob*=0.9;
  });
  S.workers.forEach(w=>{w.at--;if(w.at<=0){w.at=80+Math.random()*200;const r=Math.random();if(r<0.4){w.st='idle';w.vx=0}else if(r<0.7){w.st='walk';w.vx=w.spd;w.fr=true}else{w.st='walk';w.vx=-w.spd;w.fr=false}}
    w.x+=w.vx;if(w.x<TL+40){w.x=TL+40;w.vx=Math.abs(w.vx);w.fr=true}if(w.x>TR-40){w.x=TR-40;w.vx=-Math.abs(w.vx);w.fr=false}
    if(w.st==='walk')w.bob+=0.15;else w.bob*=0.9;
  });
  if(p.st==='walk'||p.st==='climb')p.bob+=0.2;else p.bob*=0.9;
  if(p.st==='walk'&&S.frame%12===0)sndStep();
  fpElRef.textContent=p.crane>=0?'CRANE · \u2190 \u2192 ROTATE · E EXIT':p.cf<0?'ROOFTOP · UNDER CONSTRUCTION':`FLOOR ${p.cf+1} · ${FD[p.cf]?.name||''}`;
  if(!S.keeper.active){S.cam.tx=p.x;S.cam.ty=p.y-60}
  S.cam.x+=(S.cam.tx-S.cam.x)*0.08;S.cam.y+=(S.cam.ty-S.cam.y)*0.08;
  S.jp={};
}

// ═══ GAME LOOP ═══
function loop(){update();draw();renderPanel();gameAnimId=requestAnimationFrame(loop)}

export function initGame(saveData){
  // Wire up sound button
  document.getElementById('snd-btn').addEventListener('click',()=>toggleSound());
  document.getElementById('snd-btn').textContent=soundOn?'🔊':'🔇';

  // Wire up radio
  setupRadio();

  // Init music on first interaction (shares AudioContext with SFX)
  const _initMusicOnce = async () => {
    ensureAudio();
    const ctx = getAudioCtx();
    if (ctx) await initMusic(ctx);
    if (!soundOn) setMusicMuted(true);
    document.removeEventListener('click', _initMusicOnce);
    document.removeEventListener('keydown', _initMusicOnce);
  };
  document.addEventListener('click', _initMusicOnce);
  document.addEventListener('keydown', _initMusicOnce);

  // Go to exterior (shared by location toggle, Tab key, and walking through door)
  function goToExterior() { saveMusicState(); autoSave(); localStorage.setItem('spacetower_gotoExterior','1'); location.reload(); }

  // Wire up inside/outside toggle (go to exterior)
  const locToggle = document.getElementById('location-toggle');
  if (locToggle) locToggle.addEventListener('click', goToExterior);

  // Tab key toggles to exterior (grace period prevents bleed-through from exterior Tab press)
  _simStartTime = performance.now();
  addEventListener('keydown', e => { if (e.code === 'Tab') { e.preventDefault(); if (performance.now() - _simStartTime > 800) goToExterior(); } });

  // Walk through the front door to go outside
  _exitDoorCheck = goToExterior;

  // Wire up menu button (back to title)
  document.getElementById('menu-btn').addEventListener('click',()=>{saveMusicState(); autoSave();location.reload()});

  // Elevator panel refs
  elevPanel=document.getElementById('elev-panel');
  elevFloors=document.getElementById('elev-floors');
  fpElRef=document.getElementById('fp');
  addEventListener('keydown',e=>{if(e.code==='Escape'&&S.elevOpen)closeElev()});

  // Init subsystems
  initCanvas();
  setupInput();
  setupPanel();
  setupCompendium();

  // Set initial zoom slider
  const zSl=document.getElementById('zoom-sl'),zLb=document.getElementById('zoom-lbl');
  zSl.value=cZoom;zLb.textContent=Math.round(cZoom*100)+'%';

  // Generate world + load save
  genWorld();
  if(saveData&&loadGame()){
    showMsg('SAVE LOADED','Welcome back, builder.');
  }
  // Test mode: jump straight to reckoning
  const _testFlag=localStorage.getItem('spacetower_testReckoning');
  if(_testFlag){localStorage.removeItem('spacetower_testReckoning');setupTestMode()}
  // Always enter through the elevator doors
  S.player.x=ELEV_X;S.player.y=TB;S.cam.x=S.player.x;S.cam.y=S.player.y-60;
  // Finalize arrivals for already-completed floors (post-load)
  S.npcs.forEach(n=>{
    if(S.buildout[n.floor].stage>=5){
      n.arrived=true;n.arrState='done';
      n.x=n.destX;n.y=TB-(n.floor*FH)-48;n.onF=true;n.vx=0;n.st='idle';
    }
  });
  syncLitFloors();
  renderPanel();
  // Prevent E key bleed-through from exterior (held E that entered the door)
  S.iLock = true;
}

let gameAnimId = null;
export function startGameLoop(){
  gameAnimId = requestAnimationFrame(loop);
}
export function stopGameLoop(){
  if (gameAnimId) cancelAnimationFrame(gameAnimId);
  gameAnimId = null;
}
