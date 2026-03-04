'use strict';
import { NF, BPF, TB, FH, MOB, isWinBlock, isElevBlock } from './constants.js';

// ═══ GAME STATE ═══
export const S={
  cam:{x:0,y:0,tx:0,ty:0},
  floors:[],stairs:[],objs:[],npcs:[],suits:[],cranes:[],workers:[],
  player:{x:0,y:TB-FH,w:24,h:48,vx:0,vy:0,spd:5,color:'#FF5722',
    fr:true,cf:0,st:'idle',onF:true,clT:null,clP:0,bob:0,alien:false,suit:false,suitC:'#506070',
    chgT:0,isChg:false,drpT:0,isDrp:false,drpPhase:0,baseZoom:0,crane:-1,
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
  keeper:{active:false,zoom:0,spoken:false,exchange:0,twText:'',twIdx:0,twDone:false,twTimer:0},
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
  for(let i=0;i<NF;i++) if(S.buildout[i].stage<5) return i;
  return -1;
}

// ═══ MODULE UTILITIES ═══
export function isBuildable(bi){return !isWinBlock(bi)&&!isElevBlock(bi)}
export function canAfford(cost){return S.credits>=cost}
export function placeModule(fi,bi,mod){
  if(!isBuildable(bi)||S.modules[fi][bi])return false;
  if(!canAfford(mod.cost))return false;
  S.modules[fi][bi]={...mod};
  S.credits-=mod.cost;
  S.panelDirty=true;
  return true;
}
export function sellModule(fi,bi){
  const mod=S.modules[fi][bi];
  if(!mod)return false;
  S.credits+=mod.sell;
  S.modules[fi][bi]=null;
  S.panelDirty=true;
  return true;
}
export function recalc(){S.panelDirty=true}
