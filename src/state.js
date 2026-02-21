'use strict';
import { NF, BPF, TB, FH, MOB } from './constants.js';
import { FD } from './floors.js';

// ═══ GAME STATE ═══
export const S={
  cam:{x:0,y:0,tx:0,ty:0},
  floors:[],stairs:[],objs:[],npcs:[],suits:[],cranes:[],workers:[],
  player:{x:0,y:TB-FH,w:24,h:48,vx:0,vy:0,spd:5,color:'#FF5722',
    fr:true,cf:0,st:'idle',onF:true,clT:null,clP:0,bob:0,alien:true,suit:false,suitC:'#506070',
    chgT:0,isChg:false,drpT:0,isDrp:false,drpPhase:0,baseZoom:0,
  },
  keys:{},jp:{},iLock:false,msgTmr:null,
  res:{energy:0,credits:100,population:0},sat:50,satDecay:0,
  enProd:0,enDraw:0,crRate:0,
  litFloors:new Set([0,1]),
  modules:Array.from({length:NF},()=>Array(BPF).fill(null)),
  selMod:null,panelFloor:0,panelDirty:true,frame:0,incomeTk:0,decayTk:0,saveTk:0,
  elevOpen:false,elevDoors:0,elevDoorTarget:0,elevAnim:'idle',elevAnimT:0,elevFrom:-1,elevTo:-1,elevSelected:0,
};

export let cZoom=MOB?0.5:0.7;
export let tZoom=cZoom;
export function setCZoom(v){cZoom=v}
export function setTZoom(v){tZoom=v}

// ═══ RESOURCE ENGINE ═══
export function recalc(){
  let eP=0,eD=0,pop=0,sat=50,eff=0,cR=0;
  for(let fi=0;fi<NF;fi++) S.modules[fi].forEach(m=>{if(!m)return;eP+=m.prod.energy||0;eD+=m.cost.energy||0;pop+=m.prod.population||0;cR+=m.prod.credits||0;sat+=m.sat||0;if(m.eff)eff+=m.eff});
  if(eff>0)eP=Math.floor(eP*(1+eff));
  S.res.energy=eP-eD;S.enProd=eP;S.enDraw=eD;S.res.population=pop;S.sat=Math.max(0,Math.min(100,sat));S.crRate=cR;S.panelDirty=true;
}
export function canUnlock(fi){const u=FD[fi].unlock;if(!u)return true;if(u.energy!=null&&S.res.energy<u.energy)return false;if(u.population!=null&&S.res.population<u.population)return false;if(u.sat!=null&&S.sat<u.sat)return false;return true}
export function canAfford(mod){if(mod.cost.credits&&S.res.credits<mod.cost.credits)return false;if(mod.cost.energy){if(S.res.energy+(mod.prod.energy||0)-(mod.cost.energy||0)<0)return false}return true}
