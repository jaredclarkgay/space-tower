'use strict';
import { NF, BPF, TB, FH, MOB, T3D_SEGS, isWinBlock, isElevBlock, isFlankBlock } from './constants.js';

// ═══ GAME STATE ═══
export const S={
  cam:{x:0,y:0,tx:0,ty:0},
  floors:[],stairs:[],objs:[],npcs:[],suits:[],cranes:[],workers:[],
  player:{x:0,y:TB-FH,w:24,h:48,vx:0,vy:0,spd:5,color:'#FF5722',
    fr:true,cf:0,st:'idle',onF:true,clT:null,clP:0,bob:0,alien:false,suit:false,suitC:'#506070',
    chgT:0,isChg:false,drpT:0,isDrp:false,drpPhase:0,baseZoom:0,crane:-1,
    hunger:100,
  },
  keys:{},jp:{},iLock:false,msgTmr:null,
  litFloors:new Set(),
  buildout:Array.from({length:NF},()=>({stage:0,revealT:999})),
  panelFloor:0,panelDirty:true,frame:0,
  elevOpen:false,elevDoors:0,elevDoorTarget:0,elevAnim:'idle',elevAnimT:0,elevFrom:-1,elevTo:-1,elevSelected:0,
  compendium:{entries:{}},
  fx:{shake:0,flash:0,flashColor:'#fff',tint:null,tintAlpha:0},
  particles:[],
  door:{open:0,openR:0},
  arrivalQueue:[],
  reckoning:{
    phase:'IDLE',timer:0,played:false,outcome:null,
    map:Array.from({length:NF},()=>Array(BPF).fill(0)),
    bScore:0,sScore:0,suitWave:0,
    claimBi:-1,claimFi:-1,claimTimer:0,
    builders:[],suits:[],floorLeaders:[],floodNpcs:[],
    bellX:0,geneAbsent:false,
    builderColor:null, // custom color picked after reckoning (null = default #FF6600)
    colorPick:false, // true when color picker is active
  },
  keeper:{active:false,zoom:0,spoken:false,exchange:0,twText:'',twIdx:0,twDone:false,twTimer:0,
    llmMode:false,llmHistory:[],llmLoading:false,resolved:false},
  cr:{
    active:false,phase:0,phaseT:0,
    doorOpen:0,screenBoot:0,screenOn:false,
    px:0,pz:0,walking:false,walkDir:0,
    nearElev:false,introWalkDone:false,
    selectedFloor:-1,fullScreen:false,fsPanX:0,fsPanY:0,
  },
  rgbDoor:{particles:[],textTimer:0},
  modules:Array.from({length:NF},()=>Array(BPF).fill(null)),
  credits:500,
  sat:50,
  food:0,
  builderHappiness:0,
  foodChainComplete:false,
  cornerStoreUpgraded:false,
  terrain:new Float32Array(800),
  terrain3d:{
    heightmap:new Float32Array((T3D_SEGS+1)*(T3D_SEGS+1)),
    cutHeat:new Float32Array((T3D_SEGS+1)*(T3D_SEGS+1)),
    raiseHeat:new Float32Array((T3D_SEGS+1)*(T3D_SEGS+1)),
    dirty:false,
    initialized:false,
  },
  bulldozer:{
    unlocked:false,active:false,
    x:-1800-200,y:2400,vx:0,vy:0,
    facing:1,bladeDown:false,bobT:0,
    // 3D position (shared between control room topo + exterior)
    wx:60,wz:60,wAngle:0,wSpeed:0,bladeMode:0,
  },
};

export let cZoom=MOB?0.5:0.7;
export let tZoom=cZoom;
export function setCZoom(v){cZoom=v}
export function setTZoom(v){tZoom=v}

export let keeperZoom=0;
export function setKeeperZoom(v){keeperZoom=v}

// ═══ BUILDOUT ENGINE ═══
export function syncLitFloors(){
  S.litFloors=new Set();
  for(let i=0;i<NF;i++) if(S.buildout[i].stage>=1) S.litFloors.add(i);
  S.panelDirty=true;
}

export function getActiveBuildFloor(){
  for(let i=0;i<NF;i++) if(S.buildout[i].stage<3) return i;
  return -1;
}

// ═══ MODULE UTILITIES ═══
export function isBuildable(bi){return !isWinBlock(bi)&&!isElevBlock(bi)&&!isFlankBlock(bi)}
export function canAfford(cost){return S.credits>=cost}
export function placeModule(fi,bi,mod){
  if(!isBuildable(bi)||S.modules[fi][bi])return false;
  if(!canAfford(mod.cost))return false;
  S.modules[fi][bi]={...mod};
  // Init growStage for planters on floor 2
  if(fi===2&&mod.id==='planter')S.modules[fi][bi].growStage=0;
  addCredits(-mod.cost);
  // Happiness from residential placement
  if(fi===1)addHappiness(2);
  S.panelDirty=true;
  return true;
}
export function sellModule(fi,bi){
  const mod=S.modules[fi][bi];
  if(!mod)return false;
  addCredits(mod.sell);
  // Deduct happiness for residential demolition
  if(fi===1)addHappiness(-2);
  if(fi===2&&mod.id==='planter'&&mod.growStage>=4)addHappiness(-3);
  S.modules[fi][bi]=null;
  S.panelDirty=true;
  return true;
}
export function recalc(){S.panelDirty=true}

// ═══ STATE SETTERS ═══
// Centralized mutation points for cross-cutting state.
// Every change flows through here — trace, validate, or sync in one place.
export function addCredits(n){S.credits+=n}
export function setCredits(n){S.credits=n}
export function addHappiness(n){S.builderHappiness=Math.max(0,S.builderHappiness+n)}
export function setHappiness(n){S.builderHappiness=n}
export function setSat(n){S.sat=Math.min(100,Math.max(0,n))}
export function setFood(n){S.food=Math.max(0,n)}
export function setHunger(n){S.player.hunger=Math.min(100,Math.max(0,n))}
export function advanceBuildout(fi,stage,revealT){S.buildout[fi].stage=stage;if(revealT!=null)S.buildout[fi].revealT=revealT;}
