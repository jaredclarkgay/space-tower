'use strict';
import { S, isBuildable } from './state.js';
import { TL, TR, TW, TB, FH, PG, BPF, ELEV_X } from './constants.js';
import { sndSlam, sndTick, sndVictory, sndDefeat, sndBell } from './sound.js';
import { triggerShake, triggerFlash, spawnParticles, showMsg } from './render.js';
import { autoSave } from './save.js';

// ═══ FLOOR 8 MODULE DEFINITIONS ═══
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

const F8_FLOOR=7; // code index for display floor 8
const F8_FY=TB-F8_FLOOR*FH; // slab Y

// ═══ SUIT AI ═══
function spawnSuitNpcs(){
  S.floor8.suitNpcs=[];
  for(let i=0;i<2;i++){
    S.floor8.suitNpcs.push({
      x:TR-100-i*120,y:F8_FY,fr:false,st:'idle',bob:0,lp:0,
      pal:{cl:'#2a3050',sh:'#1a1a2a',h:'#d4a878',b:'#3a3040'},
      cd:0,targetBi:-1,targetX:0,
    });
  }
}

function updateSuitAI(){
  const f8=S.floor8;
  f8.suitNpcs.forEach(n=>{
    n.cd--;
    if(n.cd<=0&&n.targetBi<0){
      // Pick random empty buildable block
      const empties=[];
      for(let bi=0;bi<BPF;bi++){if(isBuildable(bi)&&!S.modules[F8_FLOOR][bi])empties.push(bi)}
      if(empties.length===0)return;
      n.targetBi=empties[Math.floor(Math.random()*empties.length)];
      n.targetX=TL+n.targetBi*PG+PG/2;
      n.cd=150+Math.floor(Math.random()*60);
    }
    if(n.targetBi>=0){
      // Check if target still empty
      if(S.modules[F8_FLOOR][n.targetBi]){n.targetBi=-1;n.st='idle';return}
      // Walk toward target
      const dx=n.targetX-n.x;
      if(Math.abs(dx)>20){
        const dir=dx>0?1:-1;
        n.x+=dir*2.5;n.fr=dir>0;n.st='walk';n.lp+=0.18;n.bob+=0.15;
      } else {
        // Place suit module
        const mod=SUIT_MODS[Math.floor(Math.random()*SUIT_MODS.length)];
        S.modules[F8_FLOOR][n.targetBi]={...mod};
        f8.sScore++;
        n.targetBi=-1;n.st='idle';
        spawnParticles(n.targetX,F8_FY-FH/2,6,'rgba(40,60,100,0.5)',{speed:2,life:25,size:2,spread:Math.PI*2,dir:0,gravity:0});
      }
    } else {
      n.bob*=0.9;
    }
  });
}

// ═══ STATE MACHINE ═══
export function checkFloor8Trigger(){
  const f8=S.floor8;
  if(f8.phase!=='IDLE'||f8.played)return;
  if(S.buildout[F8_FLOOR].stage>=5){
    startGame();
  }
}

function startGame(){
  const f8=S.floor8;
  f8.phase='INTRO';f8.timer=120; // 2s at 60fps
  f8.bScore=0;f8.sScore=0;
  // Clear modules on floor 8
  for(let bi=0;bi<BPF;bi++){if(isBuildable(bi))S.modules[F8_FLOOR][bi]=null}
  // Teleport player to floor 8
  S.player.x=TL+200;S.player.y=F8_FY;S.player.cf=F8_FLOOR;S.player.vx=0;S.player.vy=0;S.player.onF=true;S.player.st='idle';
  S.cam.x=S.player.x;S.cam.y=S.player.y-60;
  spawnSuitNpcs();
}

export function updateFloor8(){
  const f8=S.floor8;
  if(f8.phase==='IDLE'||f8.phase==='DONE')return;
  f8.timer--;
  switch(f8.phase){
    case 'INTRO':
      if(f8.timer<=0){f8.phase='COUNTDOWN';f8.timer=180;} // 3s
      break;
    case 'COUNTDOWN':
      if(f8.timer%60===0&&f8.timer>0)sndTick();
      if(f8.timer<=0){f8.phase='PLAYING';f8.timer=3600;} // 60s
      break;
    case 'PLAYING':
      updateSuitAI();
      // Recount scores
      f8.bScore=0;f8.sScore=0;
      for(let bi=0;bi<BPF;bi++){
        if(!isBuildable(bi))continue;
        const m=S.modules[F8_FLOOR][bi];
        if(m&&m.team==='b')f8.bScore++;
        if(m&&m.team==='s')f8.sScore++;
      }
      if(f8.timer<=0){
        f8.phase='RESULT';f8.timer=180;
        f8.outcome=f8.bScore>=f8.sScore?'builders':'suits';
        if(f8.outcome==='builders'){sndVictory();triggerFlash('#ffa030',0.6)}
        else{sndDefeat();triggerFlash('#4060a0',0.4)}
        triggerShake(8);
      }
      break;
    case 'RESULT':
      if(f8.timer<=0){
        f8.phase='DONE';f8.played=true;
        // Place rematch bell near elevator
        f8.bellX=ELEV_X+180;
        showMsg('THE RECKONING',f8.outcome==='builders'?'The builders hold this floor.':'The suits have taken over.');
        autoSave();
      }
      break;
  }
}

export function tryPlaceBuilderModule(){
  const f8=S.floor8;
  if(f8.phase!=='PLAYING')return;
  const px=S.player.x;
  const bi=Math.floor((px-TL)/PG);
  if(bi<0||bi>=BPF||!isBuildable(bi))return;
  if(S.modules[F8_FLOOR][bi])return;
  const mod=BUILDER_MODS[Math.floor(Math.random()*BUILDER_MODS.length)];
  S.modules[F8_FLOOR][bi]={...mod};
  sndSlam();triggerShake(3);
  spawnParticles(TL+bi*PG+PG/2,F8_FY-FH/2,8,'rgba(200,120,30,0.6)',{speed:2.5,life:25,size:2,spread:Math.PI*2,dir:0,gravity:0});
}

export function checkRematchBell(){
  const f8=S.floor8;
  if(f8.phase!=='DONE'||!f8.played)return false;
  return S.player.cf===F8_FLOOR&&Math.abs(S.player.x-f8.bellX)<60;
}

export function startRematch(){
  const f8=S.floor8;
  f8.phase='INTRO';f8.timer=120;
  f8.bScore=0;f8.sScore=0;
  // Clear modules
  for(let bi=0;bi<BPF;bi++){if(isBuildable(bi))S.modules[F8_FLOOR][bi]=null}
  spawnSuitNpcs();
  sndBell();
  // Rematch is cosmetic — doesn't overwrite saved outcome
}

export function getFloor8State(){return S.floor8}

// Is player movement frozen?
export function isFloor8Frozen(){
  const p=S.floor8.phase;
  return p==='INTRO'||p==='COUNTDOWN'||p==='RESULT';
}

// Is floor 8 mini-game actively running?
export function isFloor8Active(){
  const p=S.floor8.phase;
  return p!=='IDLE'&&p!=='DONE';
}
