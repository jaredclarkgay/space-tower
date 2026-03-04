'use strict';
import { S, isBuildable } from './state.js';
import { TL, TR, TW, TB, FH, NF, PG, BPF, ELEV_X, RK_COUNTDOWN_T, RK_ACTIVE_T, RK_FLOOD_T,
  RK_PLAYER_CLAIM, RK_BUILDER_CLAIM, RK_SUIT_CLAIM, RK_QUORUM, RK_PROX } from './constants.js';
import { FLOOR_LEADERS, BP2 } from './npcs.js';
import { sndTick, sndVictory, sndDefeat, sndBell, sndReckoningClaim, sndReckoningWave } from './sound.js';
import { triggerShake, triggerFlash, spawnParticles, showMsg } from './render.js';
import { autoSave } from './save.js';

// ═══ FLOOR 8 MODULE DEFINITIONS (re-exported for save.js backward compat) ═══
export const BUILDER_MODS=[
  {id:'f8_workbench',nm:'Workbench',col:'#c87830',ic:'\u{1F528}',cost:0,sell:0,sat:0,desc:'Builder territory',team:'b'},
  {id:'f8_toolrack',nm:'Tool Rack',col:'#b86820',ic:'\u{1F9F0}',cost:0,sell:0,sat:0,desc:'Builder territory',team:'b'},
  {id:'f8_lumber',nm:'Lumber Pile',col:'#a08040',ic:'\u{1FAB5}',cost:0,sell:0,sat:0,desc:'Builder territory',team:'b'},
  {id:'f8_blueprint',nm:'Blueprint Table',col:'#d89040',ic:'\u{1F4D0}',cost:0,sell:0,sat:0,desc:'Builder territory',team:'b'},
];
export const SUIT_MODS=[
  {id:'f8_monitor',nm:'Monitor Desk',col:'#2a3a55',ic:'\u{1F5A5}',cost:0,sell:0,sat:0,desc:'Suit territory',team:'s'},
  {id:'f8_cabinet',nm:'Filing Cabinet',col:'#3a4050',ic:'\u{1F5C4}',cost:0,sell:0,sat:0,desc:'Suit territory',team:'s'},
  {id:'f8_whiteboard',nm:'Whiteboard',col:'#3a4a60',ic:'\u{1F4CB}',cost:0,sell:0,sat:0,desc:'Suit territory',team:'s'},
  {id:'f8_cooler',nm:'Water Cooler',col:'#304050',ic:'\u{1F6B0}',cost:0,sell:0,sat:0,desc:'Suit territory',team:'s'},
];
export const F8_ALL_MODS=[...BUILDER_MODS,...SUIT_MODS];

// ═══ COLOR PALETTE (post-reckoning pick) ═══
export const RK_COLORS=[
  '#FF6600','#FF3030','#FFD700','#00CC66','#00AAFF','#AA44FF','#FF69B4','#FFFFFF',
];
let _colorIdx=0;

// ═══ CONTESTED FLOOR RANGE ═══
// Observation (6), Storage (7), Observatory (8) — code indices
export const RK_FLOOR_MIN=6,RK_FLOOR_MAX=8;
const F8_FLOOR=7; // trigger floor (Storage)
function isContested(fi){return fi>=RK_FLOOR_MIN&&fi<=RK_FLOOR_MAX}

// ═══ BRIEFING (typewriter INTRO) ═══
const BRIEFING_TEXT='You built ten floors with your bare hands. Now guys in briefcases are filing paperwork to claim the top three. Something about "corporate oversight of high-value assets." Sure.\n\nObservation, Storage, Observatory \u2014 stand on a block to claim it. Your crew follows your lead.\n\nThe suits are climbing from below, floor by floor. Show them whose name is on the hard hat.';
let _briefingIdx=0,_briefingDone=false;

// ═══ HELPERS ═══
function blockCX(bi){return TL+bi*PG+PG/2}
function floorY(fi){return TB-fi*FH}

// ═══ TRAVEL STATE ═══
const TRAVEL_TIME=60;
function updateTravel(npc){
  if(npc.travelTimer>0){
    npc.travelTimer--;
    if(npc.travelTimer<=0){
      npc.fi=npc.travelDest;
      npc.y=floorY(npc.fi);
      npc.x=Math.random()>0.5?TL+60:TR-60;
      npc.travelDest=-1;
    }
    return true;
  }
  return false;
}
function startTravel(npc,destFi){
  if(npc.fi===destFi)return;
  npc.travelTimer=TRAVEL_TIME+Math.floor(Math.random()*30);
  npc.travelDest=destFi;
  npc.targetBi=-1;npc.claimTimer=0;
}

// ═══ TRIGGER ═══
export function checkReckoningTrigger(){
  const rk=S.reckoning;
  if(rk.phase!=='IDLE'||rk.played)return;
  if(S.buildout[F8_FLOOR].stage<5)return;
  for(let i=0;i<NF;i++){if(S.buildout[i].stage<1)return}
  startReckoning();
}

// ═══ START ═══
function startReckoning(){
  const rk=S.reckoning;
  rk.phase='INTRO';rk.timer=0;
  rk.bScore=0;rk.sScore=0;rk.suitWave=RK_FLOOR_MIN;
  rk.claimBi=-1;rk.claimFi=-1;rk.claimTimer=0;
  _briefingIdx=0;_briefingDone=false;
  // Reset map (only contested floors matter, but clear all for cleanliness)
  for(let i=0;i<NF;i++)for(let bi=0;bi<BPF;bi++)rk.map[i][bi]=0;
  // Teleport player to floor 8 (Storage)
  S.player.x=TL+200;S.player.y=floorY(F8_FLOOR);S.player.cf=F8_FLOOR;
  S.player.vx=0;S.player.vy=0;S.player.onF=true;S.player.st='idle';
  S.cam.x=S.player.x;S.cam.y=S.player.y-60;
  // Spawn builders (12 AI) — 8 near player on floor 8, 2 on floor 7, 2 on floor 6
  rk.builders=[];
  const bSpawns=[F8_FLOOR,F8_FLOOR,F8_FLOOR,F8_FLOOR,F8_FLOOR,F8_FLOOR,F8_FLOOR,F8_FLOOR,
    F8_FLOOR-1,F8_FLOOR-1,RK_FLOOR_MIN,RK_FLOOR_MIN];
  for(let i=0;i<bSpawns.length;i++){
    const fi=bSpawns[i],fy=floorY(fi);
    rk.builders.push({
      x:fi===F8_FLOOR?TL+150+Math.random()*600:TL+100+Math.random()*(TW-200),
      y:fy,fi,
      vx:0,st:'idle',bob:Math.random()*10,fr:Math.random()>0.5,
      spd:1.2+Math.random()*0.8,
      targetBi:-1,targetFi:-1,claimTimer:0,
      travelTimer:0,travelDest:-1,
      retargetCd:60+Math.floor(Math.random()*120),
      followSpread:(Math.random()-0.5)*400,
    });
  }
  // Spawn suits (18 AI) — all start on bottom contested floor, squad-assigned
  rk.suits=[];
  for(let i=0;i<18;i++){
    const fi=RK_FLOOR_MIN,fy=floorY(fi);
    rk.suits.push({
      x:TR-80-Math.random()*400,y:fy,fi,
      vx:0,st:'idle',bob:Math.random()*10,fr:false,lp:0,
      pal:BP2[i%BP2.length],
      spd:1.6+Math.random()*0.8,
      targetBi:-1,targetFi:-1,claimTimer:0,
      travelTimer:0,travelDest:-1,
      waveCd:Math.floor(Math.random()*40),
      squad:i%6, // 6 squads of 3 — each squad targets same block
    });
  }
  // Spawn floor leaders (only those on contested floors)
  rk.floorLeaders=[];
  for(const ld of FLOOR_LEADERS){
    if(!isContested(ld.floor))continue;
    const fy=floorY(ld.floor);
    rk.floorLeaders.push({
      x:TL+200+Math.random()*(TW-400),y:fy,fi:ld.floor,
      vx:0,st:'idle',bob:Math.random()*10,fr:Math.random()>0.5,
      spd:1.5,name:ld.name,
    });
  }
  // Hide Gene
  rk.geneAbsent=true;
  S.npcs.forEach(n=>{if(n.isGene)n._hidden=true});
  rk.floodNpcs=[];
  triggerShake(10);triggerFlash('#FF6600',0.5);
}

// ═══ UPDATE ═══
export function updateReckoning(){
  const rk=S.reckoning;
  if(rk.phase==='IDLE'||rk.phase==='DONE')return;
  switch(rk.phase){
    case 'INTRO':
      // Typewriter — 1 char per frame
      if(!_briefingDone){
        _briefingIdx=Math.min(_briefingIdx+1,BRIEFING_TEXT.length);
        if(_briefingIdx>=BRIEFING_TEXT.length)_briefingDone=true;
      }
      // No auto-advance — wait for player E key via handleReckoningIntroE()
      break;
    case 'COUNTDOWN':
      rk.timer--;
      if(rk.timer%60===0&&rk.timer>0)sndTick();
      if(rk.timer<=0){rk.phase='ACTIVE';rk.timer=RK_ACTIVE_T;}
      break;
    case 'ACTIVE':
      rk.timer--;
      updatePlayerClaim();
      updateBuilderAI();
      updateSuitAI();
      updateWave();
      recount();
      if(rk.timer<=0||allClaimed()){
        fillUnclaimed();
        rk.phase='FLOOD';rk.timer=RK_FLOOD_T;
        spawnFloodNpcs();
      }
      break;
    case 'FLOOD':
      rk.timer--;
      updateFlood();
      if(rk.timer<=0){
        rk.phase='RESULT';rk.timer=240;
        rk.outcome=rk.bScore>=rk.sScore?'builders':'suits';
        if(rk.outcome==='builders'){sndVictory();triggerFlash('#ffa030',0.6)}
        else{sndDefeat();triggerFlash('#3355cc',0.4)}
        triggerShake(8);
      }
      break;
    case 'RESULT':
      rk.timer--;
      if(rk.timer<=0){
        rk.phase='COLOR_PICK';rk.colorPick=true;
        _colorIdx=0;
      }
      break;
    case 'COLOR_PICK':
      // Waiting for player input (handled by handleReckoningColorPick)
      // Preview the selected color live
      rk.builderColor=RK_COLORS[_colorIdx];
      break;
  }
}

// ═══ INTRO E KEY HANDLER ═══
// Called from game-init when E is pressed during INTRO.
// First press: skip typewriter to end. Second press: begin countdown.
export function handleReckoningIntroE(){
  if(S.reckoning.phase!=='INTRO')return false;
  if(!_briefingDone){
    _briefingIdx=BRIEFING_TEXT.length;_briefingDone=true;
    return true;
  }
  // Begin!
  S.reckoning.phase='COUNTDOWN';S.reckoning.timer=RK_COUNTDOWN_T;
  return true;
}

// ═══ PLAYER CLAIMING ═══
function updatePlayerClaim(){
  const rk=S.reckoning,p=S.player;
  const pfi=p.cf;
  if(!isContested(pfi)){rk.claimTimer=0;rk.claimBi=-1;rk.claimFi=-1;return}
  const pbi=Math.floor((p.x-TL)/PG);
  if(pbi<0||pbi>=BPF){rk.claimTimer=0;rk.claimBi=-1;rk.claimFi=-1;return}
  if(rk.map[pfi][pbi]!==0){rk.claimTimer=0;rk.claimBi=-1;rk.claimFi=-1;return}
  if(pbi===rk.claimBi&&pfi===rk.claimFi){
    rk.claimTimer++;
    if(rk.claimTimer>=RK_PLAYER_CLAIM){
      rk.map[pfi][pbi]=1;
      rk.claimTimer=0;rk.claimBi=-1;rk.claimFi=-1;
      sndReckoningClaim();
      spawnParticles(blockCX(pbi),floorY(pfi)-FH/2,8,'rgba(255,102,0,0.6)',{speed:2.5,life:25,size:2,spread:Math.PI*2,dir:0,gravity:0});
    }
  } else {
    rk.claimBi=pbi;rk.claimFi=pfi;rk.claimTimer=0;
  }
}

// ═══ BUILDER AI ═══
// Find the best unclaimed block near a target position on a given floor
function findNearestUnclaimed(fi,targetX){
  const rk=S.reckoning;
  let best=-1,bestDist=Infinity;
  for(let bi=0;bi<BPF;bi++){
    if(rk.map[fi][bi]!==0)continue;
    const d=Math.abs(blockCX(bi)-targetX);
    if(d<bestDist){bestDist=d;best=bi}
  }
  return best;
}

function updateBuilderAI(){
  const rk=S.reckoning,p=S.player;
  const pOnContested=isContested(p.cf);
  const pbi=Math.floor((p.x-TL)/PG); // player's block index
  for(const b of rk.builders){
    if(updateTravel(b))continue;
    const leaderBoost=rk.floorLeaders.some(l=>l.fi===b.fi)?1.2:1.0;
    // Periodically travel to player's floor (if player is on a contested floor)
    b.retargetCd--;
    if(b.retargetCd<=0){
      b.retargetCd=80+Math.floor(Math.random()*80);
      if(pOnContested&&b.fi!==p.cf&&Math.random()<0.8){
        startTravel(b,p.cf);continue;
      }
      // Pick a target block near the player (or near self if on different floor)
      if(b.fi===p.cf&&pOnContested){
        const nearBi=findNearestUnclaimed(b.fi,p.x);
        if(nearBi>=0){b.targetBi=nearBi;b.targetFi=b.fi}
      } else if(isContested(b.fi)){
        const nearBi=findNearestUnclaimed(b.fi,b.x);
        if(nearBi>=0){b.targetBi=nearBi;b.targetFi=b.fi}
      }
    }
    // Try claiming the block we're standing on
    const bbi=Math.floor((b.x-TL)/PG);
    if(isContested(b.fi)&&bbi>=0&&bbi<BPF&&rk.map[b.fi][bbi]===0){
      const bx=blockCX(bbi);
      const mates=rk.builders.filter(o=>o.fi===b.fi&&!o.travelTimer&&Math.abs(o.x-bx)<RK_PROX);
      if(mates.length>=RK_QUORUM){
        b.claimTimer++;b.st='idle';
        if(b.claimTimer>=RK_BUILDER_CLAIM){
          rk.map[b.fi][bbi]=1;b.claimTimer=0;
          sndReckoningClaim();
          spawnParticles(bx,floorY(b.fi)-FH/2,6,'rgba(255,102,0,0.5)',{speed:2,life:25,size:2,spread:Math.PI*2,dir:0,gravity:0});
          // Immediately retarget
          const nextBi=findNearestUnclaimed(b.fi,p.x);
          if(nextBi>=0){b.targetBi=nextBi;b.targetFi=b.fi}
        }
        continue;
      } else {
        b.claimTimer=Math.max(0,b.claimTimer-1);
      }
    } else {
      b.claimTimer=0;
    }
    // Navigate toward target block (near player), or follow player if no target
    if(b.fi===p.cf&&pOnContested){
      let goalX;
      if(b.targetBi>=0&&b.targetFi===b.fi&&rk.map[b.fi][b.targetBi]===0){
        goalX=blockCX(b.targetBi)+b.followSpread*0.3; // spread around target block
      } else {
        goalX=p.x+b.followSpread*0.5; // tighter follow when no target
      }
      const dx=goalX-b.x;
      if(Math.abs(dx)>30){
        const dir=dx>0?1:-1;
        b.x+=dir*b.spd*leaderBoost;b.fr=dir>0;b.st='walk';b.bob+=0.15;
      } else {b.st='idle';b.bob*=0.9}
    } else {
      // On other floors, seek unclaimed blocks
      const seekBi=b.targetBi>=0&&b.targetFi===b.fi&&rk.map[b.fi]?.[b.targetBi]===0
        ?b.targetBi:findNearestUnclaimed(b.fi,b.x);
      const goalX=seekBi>=0?blockCX(seekBi):TL+TW/2+b.followSpread;
      const dx=goalX-b.x;
      if(Math.abs(dx)>40){
        const dir=dx>0?1:-1;
        b.x+=dir*b.spd*0.7*leaderBoost;b.fr=dir>0;b.st='walk';b.bob+=0.1;
      } else {b.st='idle';b.bob*=0.9}
    }
  }
  // Floor leaders follow the player on their floor, wander otherwise
  for(const l of rk.floorLeaders){
    l.y=floorY(l.fi);
    const dx=(l.fi===p.cf?p.x:blockCX(6))-l.x;
    if(Math.abs(dx)>60){
      const dir=dx>0?1:-1;
      l.x+=dir*l.spd;l.fr=dir>0;l.st='walk';l.bob+=0.15;
    } else {l.st='idle';l.bob*=0.9}
  }
}

// ═══ SUIT AI ═══
// Squad leader picks a target; squad mates follow the same target
function pickSquadTarget(squad,fi){
  const rk=S.reckoning,empties=[];
  for(let bi=0;bi<BPF;bi++){if(rk.map[fi][bi]===0)empties.push(bi)}
  if(empties.length===0)return -1;
  // Spread squads across different blocks — avoid blocks other squads already target
  const taken=new Set();
  for(const s of rk.suits){if(s.squad!==squad&&s.fi===fi&&s.targetBi>=0)taken.add(s.targetBi)}
  const preferred=empties.filter(bi=>!taken.has(bi));
  const pool=preferred.length>0?preferred:empties;
  return pool[Math.floor(Math.random()*pool.length)];
}

function updateSuitAI(){
  const rk=S.reckoning;
  // First pass: squad leaders pick targets, then assign to squad
  const squadTargets=new Map(); // squad -> {fi, bi}
  for(const s of rk.suits){
    if(s.travelTimer>0)continue;
    // Ensure on wave floor
    if(s.fi>rk.suitWave){startTravel(s,rk.suitWave);continue}
    if(s.fi<rk.suitWave){
      s.waveCd--;
      if(s.waveCd<=0){startTravel(s,rk.suitWave);s.waveCd=20+Math.floor(Math.random()*30)}
      continue;
    }
    // Check if current target is still valid
    if(s.targetBi>=0&&s.targetFi===s.fi&&rk.map[s.fi][s.targetBi]===0){
      // Target still good — register it for squad
      if(!squadTargets.has(s.squad))squadTargets.set(s.squad,{fi:s.fi,bi:s.targetBi});
    } else {
      s.targetBi=-1;s.targetFi=-1;s.claimTimer=0;
    }
  }
  // Assign targets to suits without one (follow squad leader's target or pick new)
  for(const s of rk.suits){
    if(s.travelTimer>0){updateTravel(s);continue}
    if(s.fi!==rk.suitWave)continue;
    if(s.targetBi<0){
      const sq=squadTargets.get(s.squad);
      if(sq&&sq.fi===s.fi&&rk.map[sq.fi][sq.bi]===0){
        s.targetBi=sq.bi;s.targetFi=sq.fi;
      } else {
        const newBi=pickSquadTarget(s.squad,s.fi);
        if(newBi>=0){s.targetBi=newBi;s.targetFi=s.fi;squadTargets.set(s.squad,{fi:s.fi,bi:newBi})}
      }
    }
    if(s.targetBi<0){s.st='idle';s.bob*=0.9;continue}
    const tx=blockCX(s.targetBi),dx=tx-s.x;
    if(Math.abs(dx)>RK_PROX*0.6){
      const dir=dx>0?1:-1;
      s.x+=dir*s.spd;s.fr=dir>0;s.st='walk';s.lp+=0.18;s.bob+=0.15;
    } else {
      s.st='idle';
      const mates=rk.suits.filter(o=>o.fi===s.fi&&o.targetBi===s.targetBi&&!o.travelTimer&&Math.abs(o.x-tx)<RK_PROX);
      if(mates.length>=RK_QUORUM){
        s.claimTimer++;
        if(s.claimTimer>=RK_SUIT_CLAIM){
          rk.map[s.fi][s.targetBi]=2;s.claimTimer=0;
          spawnParticles(tx,floorY(s.fi)-FH/2,6,'rgba(51,85,204,0.6)',{speed:2,life:25,size:2,spread:Math.PI*2,dir:0,gravity:0});
          // Immediately retarget — next unclaimed block
          const next=pickSquadTarget(s.squad,s.fi);
          s.targetBi=next;s.targetFi=next>=0?s.fi:-1;
          // Push squad mates to retarget too
          for(const m of rk.suits){if(m.squad===s.squad&&m!==s){m.targetBi=next;m.targetFi=next>=0?s.fi:-1;m.claimTimer=0}}
        }
      } else {s.claimTimer=Math.max(0,s.claimTimer-1)}
    }
  }
}

// ═══ WAVE ADVANCEMENT (scoped to contested floors) ═══
function updateWave(){
  const rk=S.reckoning;
  if(rk.suitWave>RK_FLOOR_MAX)return;
  let allDone=true;
  for(let bi=0;bi<BPF;bi++){if(rk.map[rk.suitWave][bi]===0){allDone=false;break}}
  if(allDone&&rk.suitWave<RK_FLOOR_MAX){
    rk.suitWave++;sndReckoningWave();triggerFlash('#3355cc',0.2);
  }
}

// ═══ SCORING (scoped to contested floors) ═══
function recount(){
  const rk=S.reckoning;
  rk.bScore=0;rk.sScore=0;
  for(let fi=RK_FLOOR_MIN;fi<=RK_FLOOR_MAX;fi++)for(let bi=0;bi<BPF;bi++){
    if(rk.map[fi][bi]===1)rk.bScore++;
    else if(rk.map[fi][bi]===2)rk.sScore++;
  }
}

function allClaimed(){
  for(let fi=RK_FLOOR_MIN;fi<=RK_FLOOR_MAX;fi++)for(let bi=0;bi<BPF;bi++){
    if(S.reckoning.map[fi][bi]===0)return false;
  }
  return true;
}

function fillUnclaimed(){
  const rk=S.reckoning;
  recount();
  const total=rk.bScore+rk.sScore;
  const bRatio=total>0?rk.bScore/total:0.5;
  for(let fi=RK_FLOOR_MIN;fi<=RK_FLOOR_MAX;fi++)for(let bi=0;bi<BPF;bi++){
    if(rk.map[fi][bi]===0)rk.map[fi][bi]=Math.random()<bRatio?1:2;
  }
  recount();
}

// ═══ FLOOD (scoped to contested floors) ═══
function spawnFloodNpcs(){
  const rk=S.reckoning;rk.floodNpcs=[];
  for(let i=0;i<30;i++){
    const fi=RK_FLOOR_MIN+Math.floor(Math.random()*3);
    const fy=floorY(fi),side=Math.random()>0.5;
    rk.floodNpcs.push({
      x:side?TL+20+Math.random()*200:TR-20-Math.random()*200,
      y:fy,fi,targetX:TL+100+Math.random()*(TW-200),
      vx:0,st:'idle',bob:Math.random()*10,fr:side,
      type:Math.random()<0.5?'c':(Math.random()<0.5?'b':'w'),
      alpha:0,pal:BP2[Math.floor(Math.random()*BP2.length)],
    });
  }
}

function updateFlood(){
  for(const n of S.reckoning.floodNpcs){
    n.alpha=Math.min(1,n.alpha+0.012);
    const dx=n.targetX-n.x;
    if(Math.abs(dx)>20){const dir=dx>0?1:-1;n.x+=dir*1.5;n.fr=dir>0;n.st='walk';n.bob+=0.15}
    else{n.st='idle';n.bob*=0.9}
  }
}

function convertFloodToResidents(){
  const rk=S.reckoning;
  for(const fn of rk.floodNpcs){
    S.npcs.push({
      type:fn.type,x:fn.x,y:fn.y,w:24,h:48,vx:0,vy:0,
      spd:0.5+Math.random()*1.0,
      pal:fn.pal,name:'Resident',fr:fn.fr,st:'idle',bob:0,at:0,
      floor:fn.fi,onF:true,
      convo:[n=>`${n} nods.`,n=>`"Been here since the reckoning."`,n=>`"This tower's home now."`],
      ci:0,arrived:true,destX:fn.x,arrState:'done',
    });
  }
  rk.floodNpcs=[];
}

// ═══ COLOR PICK INPUT ═══
// Works in both post-reckoning COLOR_PICK phase and free-roam recolor mode
export function handleReckoningColorLeft(){
  if(S.reckoning.phase!=='COLOR_PICK'&&!S.reckoning.colorPick)return false;
  _colorIdx=(_colorIdx-1+RK_COLORS.length)%RK_COLORS.length;
  S.reckoning.builderColor=RK_COLORS[_colorIdx]; // live preview
  return true;
}
export function handleReckoningColorRight(){
  if(S.reckoning.phase!=='COLOR_PICK'&&!S.reckoning.colorPick)return false;
  _colorIdx=(_colorIdx+1)%RK_COLORS.length;
  S.reckoning.builderColor=RK_COLORS[_colorIdx]; // live preview
  return true;
}
export function handleReckoningColorConfirm(){
  const rk=S.reckoning;
  // Post-reckoning first pick
  if(rk.phase==='COLOR_PICK'){
    rk.builderColor=RK_COLORS[_colorIdx];
    rk.colorPick=false;
    rk.phase='DONE';rk.played=true;
    rk.bellX=ELEV_X+180;
    showMsg('THE RECKONING',rk.outcome==='builders'?'The builders hold these rooms.':'The suits have taken over.');
    rk.geneAbsent=false;
    S.npcs.forEach(n=>{if(n.isGene)n._hidden=false});
    convertFloodToResidents();
    autoSave();
    return true;
  }
  // Free-roam recolor
  if(rk.colorPick){
    rk.builderColor=RK_COLORS[_colorIdx];
    rk.colorPick=false;
    autoSave();
    return true;
  }
  return false;
}
export function getColorPickState(){return{idx:_colorIdx,colors:RK_COLORS,active:S.reckoning.colorPick||S.reckoning.phase==='COLOR_PICK'}}

// ═══ COLOR WHEEL STATION ═══
// Located where the player spawns during reckoning (floor 8 / Storage)
const COLOR_WHEEL_X=TL+200;
const COLOR_WHEEL_FI=F8_FLOOR;
export function checkColorWheel(){
  const rk=S.reckoning;
  if(!rk.played||rk.phase!=='DONE')return false;
  if(rk.colorPick)return false; // already open
  return S.player.cf===COLOR_WHEEL_FI&&Math.abs(S.player.x-COLOR_WHEEL_X)<60;
}
export function openColorWheel(){
  const rk=S.reckoning;
  rk.colorPick=true;
  // Initialize index to current color
  const cur=rk.builderColor||'#FF6600';
  const idx=RK_COLORS.indexOf(cur);
  _colorIdx=idx>=0?idx:0;
}
export function getColorWheelPos(){return{x:COLOR_WHEEL_X,fi:COLOR_WHEEL_FI}}

// ═══ REMATCH ═══
export function checkReckoningBell(){
  const rk=S.reckoning;
  if(rk.phase!=='DONE'||!rk.played)return false;
  return S.player.cf===F8_FLOOR&&Math.abs(S.player.x-rk.bellX)<60;
}

export function startRematch(){
  const savedOutcome=S.reckoning.outcome;
  startReckoning();
  S.reckoning._savedOutcome=savedOutcome;
  sndBell();
}

// ═══ TEST MODE ═══
export function setupTestMode(){
  for(let i=0;i<NF;i++){S.buildout[i].stage=5;S.buildout[i].revealT=999}
  S.litFloors=new Set();
  for(let i=0;i<NF;i++)S.litFloors.add(i);
  S.panelDirty=true;
  S.npcs.forEach(n=>{
    n.arrived=true;n.arrState='done';
    n.x=n.destX;n.y=TB-(n.floor*FH)-48;n.onF=true;n.vx=0;n.st='idle';
  });
  setTimeout(()=>startReckoning(),120);
}

// ═══ STATE QUERIES ═══
export function getReckoningState(){return S.reckoning}
export function getReckoningBriefing(){return{text:BRIEFING_TEXT,idx:_briefingIdx,done:_briefingDone}}
export function isReckoningFrozen(){
  const p=S.reckoning.phase;
  return p==='INTRO'||p==='COUNTDOWN'||p==='RESULT'||p==='FLOOD'||p==='COLOR_PICK';
}
export function isReckoningActive(){
  const p=S.reckoning.phase;
  return p!=='IDLE'&&p!=='DONE';
}
