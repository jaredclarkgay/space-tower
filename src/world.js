'use strict';
import { S } from './state.js';
import { TW, TL, TR, TB, FH, NF, ROOF_Y, PG, BPF, ELEV_X, sr, ri, pk } from './constants.js';
import { FD, OD } from './floors.js';
import { HN, AN, AC, BN2, BP2, HM, AM, BM, CWN, CWM, CWM_INDOOR, genAppearance } from './npcs.js';

// ═══ WORLD GEN ═══
export function genWorld(){
  S.floors=[];S.stairs=[];S.objs=[];S.npcs=[];S.suits=[];S.cranes=[];S.workers=[];
  let alienCount=0;
  S.floors.push({level:-1,y:ROOF_Y});
  for(let i=0;i<NF;i++){
    const fy=TB-(i*FH);S.floors.push({level:i,y:fy});
    if(i<NF-1){for(let s=0,ns=ri(2,3);s<ns;s++){const span=120,mg=80,av=TW-mg*2-span,zone=av/ns;const xO=TL+mg+s*zone+sr()*(zone-span),dir=sr()>0.5?1:-1;S.stairs.push({bx:xO,by:fy,tx:xO+span*dir,ty:fy-FH,ff:i,tf:i+1})}}
    const defs=OD[i]||OD[0];
    for(let o=0,no=ri(3,5);o<no;o++){const def=defs[Math.floor(sr()*defs.length)],seg=(TW-100)/no;const ox=TL+50+o*seg+sr()*(seg-def.w-10);let ov=false;S.stairs.forEach(st=>{if(st.ff===i&&Math.abs(st.bx-ox)<70)ov=true});if(Math.abs((ox+def.w/2)-ELEV_X)<100)ov=true;if(!ov)S.objs.push({...def,x:ox,y:fy,floor:i,width:def.w,height:def.h})}
    const nT=ri(5,8);
    for(let n=0;n<nT;n++){const roll=sr();
      // 35% casual human
      if(roll<0.35){
        const isFem=sr()>0.5;
        const app=genAppearance(pk,isFem);
        const convo=HM[Math.floor(sr()*HM.length)];
        S.npcs.push({type:'c',x:TL+100+sr()*(TW-200),y:fy-48,w:24,h:48,vx:0,vy:0,spd:1+sr()*1.5,app,name:pk(HN),fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,floor:i,onF:true,convo,ci:0});
      }
      // 40% business
      else if(roll<0.75){
        const convo=BM[Math.floor(sr()*BM.length)];
        S.npcs.push({type:'b',x:TL+180+sr()*(TW-360),y:fy-48,w:24,h:48,vx:0,vy:0,spd:0.65,pal:pk(BP2),name:pk(BN2),fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,floor:i,lp:sr()*6,jt:180+Math.floor(sr()*180),onF:true,convo,ci:0});
      }
      // 20% indoor construction worker
      else if(roll<0.95||alienCount>=3){
        const convo=CWM_INDOOR[Math.floor(sr()*CWM_INDOOR.length)];
        S.npcs.push({type:'w',x:TL+150+sr()*(TW-300),y:fy-48,w:24,h:48,vx:0,vy:0,spd:0.8+sr()*0.6,name:pk(CWN),fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,floor:i,onF:true,convo,ci:0});
      }
      // 5% alien (max 3)
      else{
        alienCount++;
        const convo=AM[Math.floor(sr()*AM.length)];
        S.npcs.push({type:'a',x:TL+150+sr()*(TW-300),y:fy-48,w:24,h:48,vx:0,vy:0,spd:1+sr()*1.2,color:pk(AC),name:pk(AN),fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,floor:i,onF:true,convo,ci:0});
      }
    }
    if(sr()<0.45) S.suits.push({x:TL+200+sr()*(TW-400),y:fy,floor:i,taken:false});
  }
  S.floors.sort((a,b)=>a.y-b.y);
  for(let b=2;b<BPF;b+=5) S.cranes.push({x:TL+b*PG+PG/2,y:ROOF_Y});
  // Construction workers on rooftop
  for(let w=0;w<4;w++){const convo=CWM[w%CWM.length];S.workers.push({x:TL+200+sr()*(TW-400),y:ROOF_Y,w:24,h:48,vx:0,vy:0,spd:0.8+sr()*0.6,name:pk(CWN),fr:sr()>0.5,st:'idle',bob:sr()*10,at:0,onF:true,convo,ci:0})}
}
