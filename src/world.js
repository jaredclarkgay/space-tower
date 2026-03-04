'use strict';
import { S } from './state.js';
import { TW, TL, TR, TB, FH, NF, ROOF_Y, PG, BPF, ELEV_X, sr, ri, pk } from './constants.js';
import { FD, OD } from './floors.js';
import { HN, AN, AC, BN2, BP2, HM, AM, BM, CWN, CWM, CWM_INDOOR, genAppearance, GENE_DATA } from './npcs.js';

// ═══ PER-FLOOR NPC CONFIG ═══
// [{t:type, mn:min, mx:max}] — 'c'=casual, 'b'=business, 'w'=worker, 'cb'=pick c or b
const FLOOR_NPCS=[
  [{t:'w',mn:1,mx:1}],                        // 0 LOBBY — receptionist
  [{t:'c',mn:1,mx:2}],                        // 1 QUARTERS — residents
  [{t:'w',mn:1,mx:1}],                        // 2 GARDEN — gardener
  [{t:'c',mn:0,mx:1},{t:'b',mn:1,mx:1}],     // 3 RESEARCH — researchers
  [{t:'c',mn:1,mx:2},{t:'w',mn:1,mx:1}],     // 4 RESTAURANT — diners + server
  [{t:'c',mn:1,mx:2}],                        // 5 LOUNGE — loungers
  [{t:'c',mn:1,mx:2}],                        // 6 OBSERVATION — observers
  [{t:'w',mn:1,mx:2}],                        // 7 STORAGE — workers
  [{t:'cb',mn:1,mx:1}],                       // 8 OBSERVATORY — astronomer
  [{t:'w',mn:1,mx:1}],                        // 9 COMMAND — worker
];

// ═══ WORLD GEN ═══
export function genWorld(){
  S.floors=[];S.stairs=[];S.objs=[];S.npcs=[];S.suits=[];S.cranes=[];S.workers=[];
  S.floors.push({level:-1,y:ROOF_Y});
  for(let i=0;i<NF;i++){
    const fy=TB-(i*FH);S.floors.push({level:i,y:fy});
    if(i<NF-1){for(let s=0,ns=ri(2,3);s<ns;s++){const span=120,mg=80,av=TW-mg*2-span,zone=av/ns;const xO=TL+mg+s*zone+sr()*(zone-span),dir=sr()>0.5?1:-1;S.stairs.push({bx:xO,by:fy,tx:xO+span*dir,ty:fy-FH,ff:i,tf:i+1})}}
    const defs=OD[i]||OD[0];
    for(let o=0,no=ri(3,5);o<no;o++){const def=defs[Math.floor(sr()*defs.length)],seg=(TW-100)/no;const ox=TL+50+o*seg+sr()*(seg-def.w-10);let ov=false;S.stairs.forEach(st=>{if(st.ff===i&&Math.abs(st.bx-ox)<70)ov=true});if(Math.abs((ox+def.w/2)-ELEV_X)<100)ov=true;if(!ov)S.objs.push({...def,x:ox,y:fy,floor:i,width:def.w,height:def.h})}
    // Per-floor NPC spawning
    const fc=FLOOR_NPCS[i]||[];
    for(const spec of fc){const cnt=ri(spec.mn,spec.mx);for(let n=0;n<cnt;n++){
      let tp=spec.t;if(tp==='cb')tp=sr()>0.5?'c':'b';
      if(tp==='c'){const isFem=sr()>0.5;const app=genAppearance(pk,isFem);const convo=HM[Math.floor(sr()*HM.length)];const nx=TL+100+sr()*(TW-200);S.npcs.push({type:'c',x:nx,y:fy-48,w:24,h:48,vx:0,vy:0,spd:1+sr()*1.5,app,name:pk(HN),fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,floor:i,onF:true,convo,ci:0,arrived:false,destX:nx,arrState:'queue'})}
      else if(tp==='b'){const convo=BM[Math.floor(sr()*BM.length)];const nx=TL+180+sr()*(TW-360);S.npcs.push({type:'b',x:nx,y:fy-48,w:24,h:48,vx:0,vy:0,spd:0.65,pal:pk(BP2),name:pk(BN2),fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,floor:i,lp:sr()*6,jt:180+Math.floor(sr()*180),onF:true,convo,ci:0,arrived:false,destX:nx,arrState:'queue'})}
      else if(tp==='w'){const convo=CWM_INDOOR[Math.floor(sr()*CWM_INDOOR.length)];const nx=TL+150+sr()*(TW-300);S.npcs.push({type:'w',x:nx,y:fy-48,w:24,h:48,vx:0,vy:0,spd:0.8+sr()*0.6,name:pk(CWN),fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,floor:i,onF:true,convo,ci:0,arrived:false,destX:nx,arrState:'queue'})}
    }}
    if(sr()<0.45) S.suits.push({x:TL+200+sr()*(TW-400),y:fy,floor:i,taken:false});
  }
  // Gene — recurring business NPC on multiple floors
  for(const gf of GENE_DATA.floors){
    const nx=TL+300+sr()*(TW-600);
    S.npcs.push({type:'b',x:nx,y:TB-gf*FH-48,w:24,h:48,vx:0,vy:0,spd:0.65,
      pal:GENE_DATA.pal,name:GENE_DATA.name,fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,
      floor:gf,lp:sr()*6,jt:180+Math.floor(sr()*180),onF:true,
      convo:GENE_DATA.convo,ci:0,arrived:false,destX:nx,arrState:'queue',isGene:true});
  }
  // Convert up to 3 random casual NPCs to aliens (preserves compendium discoverability)
  let alienCount=0;
  for(let ci=0;ci<S.npcs.length&&alienCount<3;ci++){
    if(S.npcs[ci].type==='c'&&sr()<0.25){
      const n=S.npcs[ci],convo=AM[Math.floor(sr()*AM.length)];
      n.type='a';n.color=pk(AC);n.name=pk(AN);n.convo=convo;n.spd=1+sr()*1.2;delete n.app;
      alienCount++;
    }
  }
  S.floors.sort((a,b)=>a.y-b.y);
  for(let b=2;b<BPF;b+=5) S.cranes.push({x:TL+b*PG+PG/2,y:ROOF_Y});
  // Construction workers on rooftop
  for(let w=0;w<4;w++){const convo=CWM[w%CWM.length];S.workers.push({x:TL+200+sr()*(TW-400),y:ROOF_Y,w:24,h:48,vx:0,vy:0,spd:0.8+sr()*0.6,name:pk(CWN),fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,onF:true,convo,ci:0})}
}
