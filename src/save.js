'use strict';
import { S, syncLitFloors } from './state.js';
import { NF, BPF } from './constants.js';
import { FD } from './floors.js';
import { F8_ALL_MODS } from './reckoning.js';

// ═══ SAVE / LOAD ═══
const SAVE_KEY='spacetower_v14';
const OLD_KEYS=['spacetower_v13','spacetower_v12','spacetower_v11'];
function _getRaw(){
  let raw=localStorage.getItem(SAVE_KEY);
  if(raw)return raw;
  // Migrate from older save keys
  for(const k of OLD_KEYS){
    raw=localStorage.getItem(k);
    if(raw){localStorage.setItem(SAVE_KEY,raw);localStorage.removeItem(k);return raw}
  }
  return null;
}
export function peekSave(){
  try{const raw=_getRaw();if(!raw)return null;return JSON.parse(raw)}catch(e){return null}
}
export function saveGame(){
  try{
    // Serialize modules as 2D array — planter modules include growStage
    const mods=S.modules.map(row=>row.map(m=>{
      if(!m)return null;
      if(m.growStage!=null)return{id:m.id,growStage:m.growStage};
      return m.id;
    }));
    const d={
      buildout:S.buildout.map(b=>b.stage),
      litFloors:[...S.litFloors],
      panelFloor:S.panelFloor,
      compendium:S.compendium.entries,
      modules:mods,
      credits:S.credits,
      sat:S.sat,
      food:S.food,
      builderHappiness:S.builderHappiness,
      foodChainComplete:S.foodChainComplete,
      cornerStoreUpgraded:S.cornerStoreUpgraded,
      terrain:Array.from(S.terrain),
      bulldozer:{unlocked:S.bulldozer.unlocked,x:S.bulldozer.x,y:S.bulldozer.y,facing:S.bulldozer.facing},
      reckoning:{played:S.reckoning.played,outcome:S.reckoning.outcome,bellX:S.reckoning.bellX,map:S.reckoning.map,builderColor:S.reckoning.builderColor},
      keeper:{spoken:S.keeper.spoken,exchange:S.keeper.exchange,resolved:S.keeper.resolved||false},
      ts:Date.now()
    };localStorage.setItem(SAVE_KEY,JSON.stringify(d));return true}catch(e){return false}
}
export function loadGame(){
  try{const raw=_getRaw();if(!raw)return false;
    const d=JSON.parse(raw);
    if(d.buildout)d.buildout.forEach((stage,i)=>{
      if(i<NF) S.buildout[i].stage=stage;
    });
    if(d.panelFloor!=null)S.panelFloor=d.panelFloor;
    if(d.compendium)S.compendium.entries=d.compendium;
    if(d.credits!=null)S.credits=d.credits;
    if(d.sat!=null)S.sat=d.sat;
    if(d.food!=null)S.food=d.food;
    if(d.builderHappiness!=null)S.builderHappiness=d.builderHappiness;
    if(d.foodChainComplete!=null)S.foodChainComplete=d.foodChainComplete;
    if(d.cornerStoreUpgraded!=null)S.cornerStoreUpgraded=d.cornerStoreUpgraded;
    if(d.terrain){const t=d.terrain;for(let i=0;i<Math.min(t.length,S.terrain.length);i++)S.terrain[i]=t[i]}
    if(d.bulldozer){
      S.bulldozer.unlocked=!!d.bulldozer.unlocked;
      if(d.bulldozer.x!=null)S.bulldozer.x=d.bulldozer.x;
      if(d.bulldozer.y!=null)S.bulldozer.y=d.bulldozer.y;
      if(d.bulldozer.facing!=null)S.bulldozer.facing=d.bulldozer.facing;
    }
    // Reconstruct module objects from saved IDs
    if(d.modules){
      for(let fi=0;fi<NF;fi++){
        if(!d.modules[fi])continue;
        for(let bi=0;bi<BPF;bi++){
          const saved=d.modules[fi][bi];
          if(!saved){S.modules[fi][bi]=null;continue}
          const id=typeof saved==='string'?saved:saved.id;
          const mod=FD[fi].mods.find(m=>m.id===id)||F8_ALL_MODS.find(m=>m.id===id);
          if(mod){
            S.modules[fi][bi]={...mod};
            if(typeof saved==='object'&&saved.growStage!=null)S.modules[fi][bi].growStage=saved.growStage;
          }
          else S.modules[fi][bi]=null;
        }
      }
    }
    if(d.reckoning){
      S.reckoning.played=!!d.reckoning.played;S.reckoning.outcome=d.reckoning.outcome||null;
      S.reckoning.bellX=d.reckoning.bellX||0;
      if(d.reckoning.map)S.reckoning.map=d.reckoning.map;
      if(d.reckoning.builderColor)S.reckoning.builderColor=d.reckoning.builderColor;
      if(S.reckoning.played)S.reckoning.phase='DONE';
    } else if(d.floor8){
      // Backward compat: migrate old floor8 saves
      S.reckoning.played=!!d.floor8.played;S.reckoning.outcome=d.floor8.outcome||null;
      S.reckoning.bellX=d.floor8.bellX||0;
      if(S.reckoning.played)S.reckoning.phase='DONE';
    }
    if(d.keeper){S.keeper.spoken=!!d.keeper.spoken;S.keeper.exchange=d.keeper.exchange||0;S.keeper.resolved=!!d.keeper.resolved}
    syncLitFloors();return true}catch(e){return false}
}
export function autoSave(){saveGame()}
