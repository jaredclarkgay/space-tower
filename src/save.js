'use strict';
import { S, syncLitFloors } from './state.js';
import { NF, BPF } from './constants.js';
import { FD } from './floors.js';

// ═══ SAVE / LOAD ═══
const SAVE_KEY='spacetower_v11';
export function peekSave(){
  try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return null;return JSON.parse(raw)}catch(e){return null}
}
export function saveGame(){
  try{
    // Serialize modules as 2D array of ID strings or null
    const mods=S.modules.map(row=>row.map(m=>m?m.id:null));
    const d={
      buildout:S.buildout.map(b=>b.stage),
      litFloors:[...S.litFloors],
      panelFloor:S.panelFloor,
      compendium:S.compendium.entries,
      modules:mods,
      credits:S.credits,
      sat:S.sat,
      ts:Date.now()
    };localStorage.setItem(SAVE_KEY,JSON.stringify(d));return true}catch(e){return false}
}
export function loadGame(){
  try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return false;
    const d=JSON.parse(raw);
    if(d.buildout)d.buildout.forEach((stage,i)=>{
      if(i<NF) S.buildout[i].stage=stage;
    });
    if(d.panelFloor!=null)S.panelFloor=d.panelFloor;
    if(d.compendium)S.compendium.entries=d.compendium;
    if(d.credits!=null)S.credits=d.credits;
    if(d.sat!=null)S.sat=d.sat;
    // Reconstruct module objects from saved IDs
    if(d.modules){
      for(let fi=0;fi<NF;fi++){
        if(!d.modules[fi])continue;
        for(let bi=0;bi<BPF;bi++){
          const id=d.modules[fi][bi];
          if(!id){S.modules[fi][bi]=null;continue}
          const mod=FD[fi].mods.find(m=>m.id===id);
          if(mod)S.modules[fi][bi]={...mod};
          else S.modules[fi][bi]=null;
        }
      }
    }
    syncLitFloors();return true}catch(e){return false}
}
export function autoSave(){saveGame()}
