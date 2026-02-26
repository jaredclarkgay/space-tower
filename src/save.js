'use strict';
import { S, recalc } from './state.js';
import { FD } from './floors.js';

// ═══ SAVE / LOAD ═══
const SAVE_KEY='spacetower_v9c';
export function peekSave(){
  try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return null;return JSON.parse(raw)}catch(e){return null}
}
export function saveGame(){
  try{const d={
    modules:S.modules.map(row=>row.map(m=>m?m.id:null)),
    litFloors:[...S.litFloors],
    credits:S.res.credits,sat:S.sat,
    panelFloor:S.panelFloor,
    compendium:S.compendium.entries,
    ts:Date.now()
  };localStorage.setItem(SAVE_KEY,JSON.stringify(d));return true}catch(e){return false}
}
export function loadGame(){
  try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return false;
    const d=JSON.parse(raw);
    if(d.modules)d.modules.forEach((row,fi)=>row.forEach((id,bi)=>{
      if(!id){S.modules[fi][bi]=null;return}
      const mod=FD[fi]?.mods?.find(m=>m.id===id);
      S.modules[fi][bi]=mod||null;
    }));
    if(d.litFloors)S.litFloors=new Set(d.litFloors);
    if(d.credits!=null)S.res.credits=d.credits;
    if(d.sat!=null)S.sat=d.sat;
    if(d.panelFloor!=null)S.panelFloor=d.panelFloor;
    if(d.compendium)S.compendium.entries=d.compendium;
    recalc();return true}catch(e){return false}
}
export function autoSave(){saveGame()}
