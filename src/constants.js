'use strict';

// ═══ CONSTANTS ═══
export const TW=3600,FH=160,FT=12,NF=10,GRAV=0.5;
export const JUMP_F=-10,JUMP_MX=-28,CHG_MX=45,DROP_MX=50;
export const GY=2400,UW=1400;
export const TL=-TW/2,TR=TW/2,TB=GY,TT=TB-(NF*FH);
export const PG=300; // pillar gap = block width
export const BPF=Math.floor(TW/PG); // 12 blocks per floor
export const ROOF_Y=TT;
export function isWinBlock(bi){return(bi+1)%4===0} // blocks 3,7,11 are windows
export function isElevBlock(bi){return bi===6} // block 6 is the elevator shaft
export const ELEV_X=150; // center of elevator shaft in world coords (TL + 6*PG + PG/2)

export const MOB='ontouchstart'in window||navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches;
export const PH=0.42;

// ═══ SEEDED RANDOM ═══
let _s=42;
export function sr(){_s=(_s*16807)%2147483647;return(_s-1)/2147483646}
export function ri(a,b){return Math.floor(sr()*(b-a+1))+a}
export function pk(a){return a[Math.floor(sr()*a.length)]}

// Color interpolation for altitude sky
export function lerpColor(a,b,t){
  const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16);
  const r=Math.round(((pa>>16)&255)*(1-t)+((pb>>16)&255)*t);
  const g=Math.round(((pa>>8)&255)*(1-t)+((pb>>8)&255)*t);
  const bl=Math.round((pa&255)*(1-t)+(pb&255)*t);
  return`#${((1<<24)+(r<<16)+(g<<8)+bl).toString(16).slice(1)}`;
}
