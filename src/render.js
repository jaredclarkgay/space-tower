'use strict';
import { S, cZoom } from './state.js';
import { TW, FH, FT, NF, TL, TR, TB, TT, PG, BPF, UW, ROOF_Y, MOB, PH, CHG_MX, DROP_MX, lerpColor, isWinBlock, isElevBlock, ELEV_X } from './constants.js';
import { FTHEME, FD } from './floors.js';
import { updateAmbient } from './sound.js';

let C,X;
const msgEl=()=>document.getElementById('msg');
const fpEl=()=>document.getElementById('fp');
const spEl=()=>document.getElementById('sp');

export function initCanvas(){
  C=document.getElementById('gameCanvas');
  X=C.getContext('2d');
  // roundRect polyfill
  if(!CanvasRenderingContext2D.prototype.roundRect){CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){if(typeof r==='number')r={tl:r,tr:r,br:r,bl:r};this.beginPath();this.moveTo(x+r.tl,y);this.lineTo(x+w-r.tr,y);this.quadraticCurveTo(x+w,y,x+w,y+r.tr);this.lineTo(x+w,y+h-r.br);this.quadraticCurveTo(x+w,y+h,x+w-r.br,y+h);this.lineTo(x+r.bl,y+h);this.quadraticCurveTo(x,y+h,x,y+h-r.bl);this.lineTo(x,y+r.tl);this.quadraticCurveTo(x,y,x+r.tl,y);this.closePath();return this}}
  function resize(){C.width=innerWidth;C.height=Math.ceil(innerHeight*(1-PH))}
  addEventListener('resize',resize);resize();
}

// ═══ MESSAGING ═══
export function showMsg(l,t){const el=msgEl();el.querySelector('.ml').textContent=l;el.querySelector('.mt2').textContent=t;el.style.opacity='1';if(S.msgTmr)clearTimeout(S.msgTmr);S.msgTmr=setTimeout(()=>{el.style.opacity='0'},3500)}
export function floatText(t,c){const el=document.createElement('div');el.className='float-txt';el.textContent=t;el.style.color=c;el.style.left=MOB?'50%':'85px';el.style.bottom=`calc(${Math.round(PH*100)}vh + 40px)`;el.style.opacity='1';document.body.appendChild(el);requestAnimationFrame(()=>{el.style.bottom=`calc(${Math.round(PH*100)}vh + 80px)`;el.style.opacity='0'});setTimeout(()=>el.remove(),1600)}

// ═══ INTERACTIONS ═══
export function getInter(){const p=S.player;
  // Elevator — highest priority, checked first
  if(p.cf>=0&&S.litFloors.has(p.cf)&&Math.abs(p.x-ELEV_X)<80)return{t:'elev',v:{floor:p.cf}};
  for(let o of S.objs){if(Math.abs(p.y-o.y)<20&&Math.abs(p.x-o.x)<50)return{t:'obj',v:o}}
  for(let n of S.npcs){if(Math.abs(p.x-n.x)<40&&Math.abs(p.y-n.y)<30)return{t:'npc',v:n}}
  for(let w of S.workers){if(Math.abs(p.x-w.x)<40&&Math.abs(p.y-w.y)<30)return{t:'npc',v:w}}
  if(p.st!=='climb'){for(let st of S.stairs){if(Math.abs(p.y-st.by)<12&&Math.abs(p.x-st.bx)<35)return{t:'up',v:st};if(Math.abs(p.y-st.ty)<12&&Math.abs(p.x-st.tx)<35)return{t:'dn',v:st}}}return null}
export function nearSuit(){const p=S.player;for(let s of S.suits){if(!s.taken&&Math.abs(p.y-s.y)<20&&Math.abs(p.x-s.x)<40)return s}return null}

// ═══ DRAW: CHARACTERS (FLAT) ═══
function drawBlob(c,isP,oneEye){
  const bob=Math.abs(Math.sin(c.bob))*4,mov=c.st==='walk'||c.st==='climb';
  X.save();X.translate(c.x,c.y-c.h/2-8-bob);if(!c.fr)X.scale(-1,1);
  // Antenna (aliens only, not player)
  if(oneEye&&!isP){X.strokeStyle=c.color;X.lineWidth=2;X.beginPath();X.moveTo(0,-c.h/2);X.lineTo(-3,-c.h/2-10);X.stroke();X.fillStyle=c.color;X.beginPath();X.arc(-3,-c.h/2-12,3,0,Math.PI*2);X.fill()}
  X.fillStyle=c.color;X.beginPath();X.roundRect(-c.w/2,-c.h/2,c.w,c.h,10);X.fill();
  if(oneEye){X.fillStyle='white';X.beginPath();X.arc(4,-10,6,0,Math.PI*2);X.fill();X.fillStyle='black';X.beginPath();X.arc(6,-10,2.5,0,Math.PI*2);X.fill();X.fillStyle='white';X.beginPath();X.arc(7,-12,1,0,Math.PI*2);X.fill()}
  else{X.fillStyle='white';X.beginPath();X.arc(0,-10,4.5,0,Math.PI*2);X.fill();X.beginPath();X.arc(8,-10,4.5,0,Math.PI*2);X.fill();X.fillStyle='black';X.beginPath();X.arc(2,-10,2,0,Math.PI*2);X.fill();X.beginPath();X.arc(10,-10,2,0,Math.PI*2);X.fill()}
  if(isP&&c.alien&&!c.suit){X.fillStyle='#333';X.beginPath();X.roundRect(-c.w/2-7,-5,8,20,3);X.fill()}
  X.strokeStyle='#222';X.lineWidth=4;X.lineCap='round';
  X.beginPath();X.moveTo(-4,c.h/2-2);X.lineTo(-4+(mov?Math.sin(c.bob)*10:0),c.h/2+8+bob);X.stroke();
  X.beginPath();X.moveTo(4,c.h/2-2);X.lineTo(4-(mov?Math.sin(c.bob)*10:0),c.h/2+8+bob);X.stroke();
  X.restore();
}
function drawBiz(n){
  const pl=n.pal,x=n.x,y=n.y,f=n.fr?1:-1,lp=n.lp||0,mv=n.st==='walk';
  X.save();X.translate(x,y);X.fillStyle='rgba(0,0,0,0.1)';X.beginPath();X.ellipse(0,0,10,3,0,0,Math.PI*2);X.fill();
  X.translate(0,-7);
  const ls=mv?Math.sin(lp)*8:0,as=-ls*0.6;
  X.fillStyle=pl.sh;X.save();X.translate(-3,-6);X.rotate(ls*0.1);X.fillRect(-2.5,-1,5,14);X.restore();
  X.save();X.translate(3,-6);X.rotate(-ls*0.1);X.fillRect(-2.5,-1,5,14);X.restore();
  X.fillStyle=pl.cl;X.fillRect(-6,-24,12,18);
  X.fillStyle=pl.cl;X.save();X.translate(-8,-22);X.rotate(as*0.08);X.fillRect(-2,-1,4,12);X.fillStyle=pl.h;X.beginPath();X.arc(0,12,2.5,0,Math.PI*2);X.fill();X.restore();
  X.save();X.translate(8,-22);X.rotate(-as*0.08);X.fillStyle=pl.cl;X.fillRect(-2,-1,4,12);X.fillStyle=pl.h;X.beginPath();X.arc(0,12,2.5,0,Math.PI*2);X.fill();X.restore();
  X.fillStyle=pl.h;X.beginPath();X.ellipse(0,-28,5.5,6.5,0,0,Math.PI*2);X.fill();
  X.fillStyle=pl.b;X.beginPath();X.ellipse(0,-31.5,5.5,3.5,0,0,Math.PI*2);X.fill();
  X.fillStyle='#1a1a2a';X.beginPath();X.arc(f>0?2:-2,-28,1,0,Math.PI*2);X.fill();X.beginPath();X.arc(f>0?5:-5,-28,1,0,Math.PI*2);X.fill();
  X.restore();
}

// ═══ DRAW: CASUAL HUMAN ═══
function drawCasual(n){
  const x=n.x,y=n.y,f=n.fr?1:-1,mv=n.st==='walk';
  const bob=Math.abs(Math.sin(n.bob))*3;
  const lp=n.bob*1.2,ls=mv?Math.sin(lp)*7:0;
  const a=n.app;
  X.save();X.translate(x,y);
  X.fillStyle='rgba(0,0,0,0.08)';X.beginPath();X.ellipse(0,0,9,2.5,0,0,Math.PI*2);X.fill();
  X.translate(0,-7-bob);
  // Legs
  X.fillStyle=a.bot;
  X.save();X.translate(-3,-5);X.rotate(ls*0.09);X.fillRect(-2.5,0,5,14);X.restore();
  X.save();X.translate(3,-5);X.rotate(-ls*0.09);X.fillRect(-2.5,0,5,14);X.restore();
  // Shoes
  X.fillStyle=a.sho;
  const sy1=mv?Math.sin(lp)*3:0,sy2=mv?-Math.sin(lp)*3:0;
  X.fillRect(-6,8+sy1,5,3);X.fillRect(1,8+sy2,5,3);
  // Torso
  X.fillStyle=a.top;
  const tw2=a.fem?12:14;
  X.fillRect(-tw2/2,-24,tw2,19);
  X.strokeStyle=a.fem?'rgba(0,0,0,0.15)':'rgba(0,0,0,0.1)';X.lineWidth=1;
  X.beginPath();X.moveTo(-3,-24);X.lineTo(0,-21);X.lineTo(3,-24);X.stroke();
  // Arms
  const as2=-ls*0.5;
  X.save();X.translate(-tw2/2-2,-22);X.rotate(as2*0.07);
  X.fillStyle=a.top;X.fillRect(-2,0,4,11);
  X.fillStyle=a.skin;X.beginPath();X.arc(0,12,2.5,0,Math.PI*2);X.fill();X.restore();
  X.save();X.translate(tw2/2+2,-22);X.rotate(-as2*0.07);
  X.fillStyle=a.top;X.fillRect(-2,0,4,11);
  X.fillStyle=a.skin;X.beginPath();X.arc(0,12,2.5,0,Math.PI*2);X.fill();X.restore();
  // Neck + head
  X.fillStyle=a.skin;X.fillRect(-2,-27,4,4);
  X.fillStyle=a.skin;X.beginPath();X.ellipse(0,-30,5.5,6,0,0,Math.PI*2);X.fill();
  // Hair
  X.fillStyle=a.hair;
  if(a.hs==='short'){X.beginPath();X.ellipse(0,-34,6,3,0,0,Math.PI);X.fill();X.fillRect(-6,-35,12,3)}
  else if(a.hs==='buzz'){X.beginPath();X.ellipse(0,-34.5,5.5,2,0,0,Math.PI);X.fill()}
  else if(a.hs==='messy'){X.beginPath();X.ellipse(0,-34,6.5,3.5,0,0,Math.PI);X.fill();X.fillRect(-7,-36,3,3);X.fillRect(2,-37,3,2);X.fillRect(5,-36,3,3)}
  else if(a.hs==='long'){X.beginPath();X.ellipse(0,-34,6.5,3.5,0,0,Math.PI);X.fill();X.fillRect(-6.5,-34,13,3);X.fillRect(-7,-32,3,10);X.fillRect(4,-32,3,10)}
  else if(a.hs==='ponytail'){X.beginPath();X.ellipse(0,-34,6,3,0,0,Math.PI);X.fill();X.fillRect(-6,-35,12,3);
    X.beginPath();X.moveTo(f>0?-5:5,-33);X.quadraticCurveTo(f>0?-10:10,-30,f>0?-8:8,-24);X.lineTo(f>0?-6:6,-24);X.quadraticCurveTo(f>0?-8:8,-30,f>0?-4:4,-33);X.fill()}
  else if(a.hs==='bun'){X.beginPath();X.ellipse(0,-34,6,3,0,0,Math.PI);X.fill();X.fillRect(-6,-35,12,3);X.beginPath();X.arc(0,-38,3.5,0,Math.PI*2);X.fill()}
  else if(a.hs==='bob'){X.beginPath();X.ellipse(0,-34,6.5,3.5,0,0,Math.PI);X.fill();X.fillRect(-6.5,-34,13,3);X.fillRect(-7,-32,3,6);X.fillRect(4,-32,3,6)}
  // Eyes
  X.fillStyle='#1a1a2a';
  X.beginPath();X.arc(f>0?2:-2,-30,1,0,Math.PI*2);X.fill();
  X.beginPath();X.arc(f>0?5:-5,-30,1,0,Math.PI*2);X.fill();
  X.restore();
}

// ═══ DRAW: CONSTRUCTION WORKER ═══
function drawWorker(w){
  const bob=Math.abs(Math.sin(w.bob))*3,mv=w.st==='walk';
  X.save();X.translate(w.x,w.y-26-bob);if(!w.fr)X.scale(-1,1);
  X.fillStyle='#3a5070';X.fillRect(-5,12,4,12);X.fillRect(2,12,4,12);
  X.fillStyle='#5a4030';X.fillRect(-6,22,6,4);X.fillRect(1,22,6,4);
  X.fillStyle='#606060';X.fillRect(-7,-2,14,16);
  X.fillStyle='#FF6600';X.fillRect(-7,-2,14,14);
  X.fillStyle='rgba(255,255,0,0.6)';X.fillRect(-7,4,14,2);
  X.fillRect(-7,8,14,2);
  X.fillStyle='#FF6600';
  if(mv){X.fillRect(-10,-1+Math.sin(w.bob)*4,4,10);X.fillRect(7,-1-Math.sin(w.bob)*4,4,10)}
  else{X.fillRect(-10,0,4,10);X.fillRect(7,0,4,10)}
  X.fillStyle='#d4a878';X.beginPath();X.arc(-8,mv?10+Math.sin(w.bob)*4:10,2.5,0,Math.PI*2);X.fill();
  X.beginPath();X.arc(9,mv?10-Math.sin(w.bob)*4:10,2.5,0,Math.PI*2);X.fill();
  X.fillStyle='#d4a878';X.beginPath();X.ellipse(0,-8,6,7,0,0,Math.PI*2);X.fill();
  X.fillStyle='#FFD700';X.beginPath();X.ellipse(0,-16,8,4,0,0,Math.PI*2);X.fill();
  X.fillRect(-7,-16,14,5);
  X.fillStyle='#E8C020';X.fillRect(-8,-12,16,2);
  X.fillStyle='#1a1a2a';X.beginPath();X.arc(w.fr?2:-2,-8,1.2,0,Math.PI*2);X.fill();X.beginPath();X.arc(w.fr?5:-5,-8,1.2,0,Math.PI*2);X.fill();
  X.restore();
}
function drawCrane(cx,cy){
  X.fillStyle='#8a8580';X.fillRect(cx-16,cy-20,32,20);X.fillStyle='#9a9590';X.fillRect(cx-14,cy-18,28,4);
  const mh=180;X.fillStyle='#e8a020';X.fillRect(cx-4,cy-20-mh,8,mh);
  X.strokeStyle='#c08010';X.lineWidth=1.5;for(let my=0;my<mh;my+=18){const yy=cy-20-my;X.beginPath();X.moveTo(cx-4,yy);X.lineTo(cx+4,yy-18);X.stroke();X.beginPath();X.moveTo(cx+4,yy);X.lineTo(cx-4,yy-18);X.stroke()}
  const jL=160,topY=cy-20-mh;X.fillStyle='#e8a020';X.fillRect(cx-20,topY,jL,6);X.fillRect(cx-60,topY,44,6);
  X.fillStyle='#606060';X.fillRect(cx-58,topY+6,18,14);X.fillStyle='#506880';X.fillRect(cx-8,topY+6,16,14);X.fillStyle='rgba(140,200,230,0.5)';X.fillRect(cx-6,topY+8,12,6);
  const hx=cx+jL-24;X.strokeStyle='#404040';X.lineWidth=1;X.beginPath();X.moveTo(hx,topY+6);X.lineTo(hx,topY+70);X.stroke();
  X.fillStyle='#505050';X.beginPath();X.arc(hx,topY+72,4,0,Math.PI*2);X.fill();X.strokeStyle='#505050';X.lineWidth=2;X.beginPath();X.arc(hx,topY+78,5,0.5,Math.PI-0.5);X.stroke();
  X.strokeStyle='#404040';X.lineWidth=1;X.beginPath();X.moveTo(cx,topY-12);X.lineTo(hx+4,topY);X.stroke();X.beginPath();X.moveTo(cx,topY-12);X.lineTo(cx-56,topY);X.stroke();
  X.fillStyle='#e8a020';X.fillRect(cx-3,topY-16,6,16);X.fillStyle='#ff3030';X.beginPath();X.arc(cx,topY-18,3,0,Math.PI*2);X.fill();
}

// ═══ DRAW: MECHANICAL MODULES ═══
function drawMod(id,bx,by,bw,bh){
  const mg=6,mx=bx+mg,my=by+mg,mw=bw-mg*2,mh=bh-mg*2;
  if(id==='coal'){
    X.fillStyle='#3a3028';X.fillRect(mx,my+mh*0.3,mw,mh*0.7);
    X.fillStyle='#2a2018';X.fillRect(mx+4,my+mh*0.35,mw-8,mh*0.2);
    X.fillStyle='#555';X.fillRect(mx+mw*0.7,my,mw*0.12,mh*0.5);X.fillRect(mx+mw*0.72,my-4,mw*0.08,6);
    const st=Date.now()*0.002;
    X.fillStyle='rgba(100,100,100,0.3)';X.beginPath();X.arc(mx+mw*0.76,my-12+Math.sin(st)*3,5+Math.sin(st*1.3)*2,0,Math.PI*2);X.fill();
    X.beginPath();X.arc(mx+mw*0.72,my-22+Math.sin(st+1)*4,4,0,Math.PI*2);X.fill();
    X.fillStyle='#555';X.fillRect(mx+2,my+mh*0.85,mw-4,6);
    for(let cx2=mx+6;cx2<mx+mw-4;cx2+=10){X.fillStyle='#444';X.fillRect(cx2,my+mh*0.86,3,4)}
    X.fillStyle='rgba(255,120,30,0.15)';X.fillRect(mx+4,my+mh*0.36,mw-8,mh*0.18);
  } else if(id==='solar'){
    X.fillStyle='#888';X.fillRect(mx+mw*0.45,my+mh*0.5,mw*0.1,mh*0.5);
    X.fillRect(mx+mw*0.1,my+mh*0.5,mw*0.1,mh*0.5);
    X.fillRect(mx+mw*0.8,my+mh*0.5,mw*0.1,mh*0.5);
    const panelH=mh*0.4;
    X.fillStyle='#1a3a6a';X.fillRect(mx+2,my+mh*0.15,mw-4,panelH);
    X.strokeStyle='#2a5a8a';X.lineWidth=1;
    for(let px=mx+mw*0.25;px<mx+mw;px+=mw*0.25){X.beginPath();X.moveTo(px,my+mh*0.15);X.lineTo(px,my+mh*0.15+panelH);X.stroke()}
    X.beginPath();X.moveTo(mx+2,my+mh*0.35);X.lineTo(mx+mw-2,my+mh*0.35);X.stroke();
    X.fillStyle='rgba(200,230,255,0.15)';X.fillRect(mx+4,my+mh*0.17,mw*0.3,panelH*0.4);
  } else if(id==='batt'){
    const cellH=(mh-8)/3;
    for(let bi=0;bi<3;bi++){
      const cy2=my+4+bi*cellH;
      X.fillStyle='#1a4a7a';X.fillRect(mx+4,cy2,mw-8,cellH-3);
      X.fillStyle='#2060a0';X.fillRect(mx+6,cy2+2,mw-12,cellH-7);
      const charge=0.6+Math.sin(S.frame*0.008+bi)*0.3;
      X.fillStyle='rgba(0,200,255,0.4)';X.fillRect(mx+8,cy2+4,(mw-16)*charge,cellH-11);
    }
    X.fillStyle='#c0c0c0';X.fillRect(mx+mw*0.3,my,8,6);X.fillRect(mx+mw*0.6,my,8,6);
    X.fillStyle='#ff4040';X.fillRect(mx+mw*0.3+2,my+1,4,2);
    X.fillStyle='#404040';X.fillRect(mx+mw*0.6+2,my+1,4,2);
  } else if(id==='hydro'){
    X.fillStyle='#2a3a28';X.fillRect(mx,my+mh*0.4,mw,mh*0.6);
    for(let ti=0;ti<3;ti++){const ty=my+mh*0.45+ti*mh*0.18;X.fillStyle='#3a5a38';X.fillRect(mx+4,ty,mw-8,mh*0.12);
      for(let si=0;si<5;si++){const sx=mx+8+si*(mw-16)/5;const sh2=8+Math.sin(Date.now()*0.0015+si+ti*2)*3;X.fillStyle='#5aaa40';X.fillRect(sx,ty-sh2,3,sh2);X.fillStyle='#70cc50';X.beginPath();X.ellipse(sx+1.5,ty-sh2-2,4,3,0,0,Math.PI*2);X.fill()}}
    X.fillStyle='rgba(80,200,60,0.08)';X.fillRect(mx,my,mw,mh);
  } else if(id==='kitch'){
    X.fillStyle='#8a7a68';X.fillRect(mx,my+mh*0.35,mw,mh*0.65);
    X.fillStyle='#606058';X.fillRect(mx+4,my+mh*0.1,mw-8,mh*0.2);X.fillStyle='#505048';X.fillRect(mx+mw*0.2,my,mw*0.6,mh*0.12);
    const glow=0.3+Math.sin(Date.now()*0.003)*0.15;
    for(let bi2=0;bi2<2;bi2++){const bx2=mx+mw*0.25+bi2*mw*0.35;const by2=my+mh*0.5;
      X.strokeStyle=`rgba(255,100,30,${glow})`;X.lineWidth=2;X.beginPath();X.arc(bx2,by2,8,0,Math.PI*2);X.stroke();
      X.strokeStyle=`rgba(255,60,10,${glow*0.6})`;X.beginPath();X.arc(bx2,by2,5,0,Math.PI*2);X.stroke()}
    const st2=Date.now()*0.002;X.fillStyle='rgba(200,200,200,0.15)';
    X.beginPath();X.arc(mx+mw*0.3,my+mh*0.25+Math.sin(st2)*3,4,0,Math.PI*2);X.fill();
    X.beginPath();X.arc(mx+mw*0.65,my+mh*0.2+Math.sin(st2+1)*4,3,0,Math.PI*2);X.fill();
  } else if(id==='tele'){
    X.fillStyle='#505860';X.fillRect(mx+mw*0.44,my+mh*0.3,mw*0.12,mh*0.7);
    X.fillStyle='#8090a0';X.beginPath();X.ellipse(mx+mw*0.5,my+mh*0.25,mw*0.38,mh*0.2,0,0,Math.PI*2);X.fill();
    X.fillStyle='#90a0b0';X.beginPath();X.ellipse(mx+mw*0.5,my+mh*0.25,mw*0.28,mh*0.12,0,0,Math.PI*2);X.fill();
    X.fillStyle='#606870';X.fillRect(mx+mw*0.47,my+mh*0.05,mw*0.06,mh*0.15);
    const pulse=(Date.now()*0.001)%3;
    if(pulse<1.5){X.strokeStyle=`rgba(100,200,255,${0.4-pulse*0.25})`;X.lineWidth=1;X.beginPath();X.arc(mx+mw*0.5,my+mh*0.08,pulse*12,0,Math.PI*2);X.stroke()}
  } else if(id==='med'){
    X.fillStyle='#b0b4b8';X.fillRect(mx,my+mh*0.4,mw,mh*0.6);
    X.fillStyle='#e0e4e8';X.fillRect(mx+6,my+mh*0.5,mw-12,mh*0.25);X.fillStyle='#c8ccd0';X.fillRect(mx+6,my+mh*0.5,mw*0.2,mh*0.25);
    X.fillStyle='rgba(220,60,60,0.7)';X.fillRect(mx+mw*0.42,my+mh*0.08,mw*0.16,mh*0.3);X.fillRect(mx+mw*0.32,my+mh*0.15,mw*0.36,mh*0.12);
    const hb=Date.now()*0.004;X.strokeStyle='rgba(60,200,100,0.5)';X.lineWidth=1.5;X.beginPath();
    for(let hx=0;hx<mw-12;hx+=2){const hy=my+mh*0.88+Math.sin(hb+hx*0.15)*((hx%20<6)?8:1);X.lineTo(mx+6+hx,hy)}X.stroke();
  } else if(id==='apts'){
    X.fillStyle='#c4a880';X.fillRect(mx,my,mw,mh);
    for(let wy=0;wy<2;wy++){for(let wx2=0;wx2<3;wx2++){
      const awx=mx+6+wx2*(mw-12)/3,awy=my+6+wy*(mh-8)/2;
      X.fillStyle='rgba(255,220,140,0.4)';X.fillRect(awx+2,awy+2,(mw-18)/3-2,(mh-14)/2-2);
      X.strokeStyle='#a08860';X.lineWidth=1;X.strokeRect(awx+2,awy+2,(mw-18)/3-2,(mh-14)/2-2);
    }}
  } else if(id==='work'){
    X.fillStyle='#606870';X.fillRect(mx,my+mh*0.4,mw,mh*0.6);
    for(let di=0;di<3;di++){const dx=mx+4+di*(mw-8)/3;
      X.fillStyle='#808890';X.fillRect(dx+2,my+mh*0.5,mw/3-8,mh*0.15);
      X.fillStyle='rgba(100,180,255,0.3)';X.fillRect(dx+4,my+mh*0.3,(mw/3-12)*0.7,mh*0.18);
      X.fillStyle='rgba(100,180,255,0.08)';X.fillRect(dx+2,my+mh*0.5,mw/3-8,mh*0.1);
    }
  } else if(id==='tree'){
    X.fillStyle='#6a5a40';X.fillRect(mx+mw*0.42,my+mh*0.35,mw*0.16,mh*0.65);
    X.fillStyle='#3a8a30';X.beginPath();X.ellipse(mx+mw*0.5,my+mh*0.3,mw*0.42,mh*0.28,0,0,Math.PI*2);X.fill();
    X.fillStyle='#4aaa40';X.beginPath();X.ellipse(mx+mw*0.4,my+mh*0.2,mw*0.25,mh*0.18,0,0,Math.PI*2);X.fill();
    X.fillStyle='#50bb48';X.beginPath();X.ellipse(mx+mw*0.6,my+mh*0.22,mw*0.2,mh*0.15,0,0,Math.PI*2);X.fill();
    const lsh=Math.sin(Date.now()*0.001)*0.04+0.04;
    X.fillStyle=`rgba(150,255,100,${lsh})`;X.beginPath();X.ellipse(mx+mw*0.45,my+mh*0.18,mw*0.15,mh*0.1,0,0,Math.PI*2);X.fill();
  } else {
    const mod=S.modules?.[Math.floor((by-TT)/FH)]?.[Math.floor((bx-TL)/PG)];
    X.fillStyle=mod?.col||'#555';X.globalAlpha=0.3;X.fillRect(mx,my,mw,mh);X.globalAlpha=1;
  }
}

// ═══ DRAW: SCAFFOLDING ═══
function drawScaffold(sx,sy,sw,sh){
  X.strokeStyle='#8a6a40';X.lineWidth=3;
  for(let vx=sx;vx<=sx+sw;vx+=60){X.beginPath();X.moveTo(vx,sy);X.lineTo(vx,sy+sh);X.stroke()}
  for(let hy=sy;hy<=sy+sh;hy+=FH){X.beginPath();X.moveTo(sx,hy);X.lineTo(sx+sw,hy);X.stroke()}
  X.strokeStyle='#7a5a30';X.lineWidth=2;
  for(let hy=sy;hy<sy+sh;hy+=FH){
    for(let vx=sx;vx<sx+sw-30;vx+=60){
      X.beginPath();X.moveTo(vx,hy);X.lineTo(vx+60,hy+FH);X.stroke();
    }
  }
}

// ═══ DRAW: CARS ═══
function drawCar(cx,cy,col){
  X.fillStyle=col;X.beginPath();X.roundRect(cx-20,cy-16,40,12,3);X.fill();
  X.fillStyle=col;X.beginPath();X.roundRect(cx-12,cy-24,24,10,3);X.fill();
  X.fillStyle='rgba(140,200,230,0.6)';X.fillRect(cx-10,cy-22,9,7);X.fillRect(cx+1,cy-22,9,7);
  X.fillStyle='#222';X.beginPath();X.arc(cx-12,cy-3,5,0,Math.PI*2);X.fill();X.beginPath();X.arc(cx+12,cy-3,5,0,Math.PI*2);X.fill();
  X.fillStyle='#444';X.beginPath();X.arc(cx-12,cy-3,3,0,Math.PI*2);X.fill();X.beginPath();X.arc(cx+12,cy-3,3,0,Math.PI*2);X.fill();
}

// ═══ DRAW ═══
export function draw(){
  const W=C.width,H=C.height;
  const altFrac=Math.max(0,Math.min(1,(TB-S.cam.y)/(TB-TT)));
  updateAmbient(altFrac);

  const sg=X.createLinearGradient(0,0,0,H);
  if(altFrac<0.5){
    const t=altFrac*2;
    sg.addColorStop(0,lerpColor('#A7C7E7','#6080B0',t));
    sg.addColorStop(0.3,lerpColor('#BDD4F0','#8090C0',t));
    sg.addColorStop(0.5,lerpColor('#DDD0EC','#9088B0',t));
    sg.addColorStop(0.7,lerpColor('#F0D2CE','#A090A8',t));
    sg.addColorStop(1,lerpColor('#FDF0D5','#C0B0A0',t));
  } else {
    const t=(altFrac-0.5)*2;
    sg.addColorStop(0,lerpColor('#6080B0','#1a1a3a',t));
    sg.addColorStop(0.2,lerpColor('#8090C0','#2a2050',t));
    sg.addColorStop(0.4,lerpColor('#9088B0','#3a2858',t));
    sg.addColorStop(0.6,lerpColor('#A090A8','#483060',t));
    sg.addColorStop(1,lerpColor('#C0B0A0','#201838',t));
  }
  X.fillStyle=sg;X.fillRect(0,0,W,H);

  // Stars
  if(altFrac>0.35){
    const starAlpha=Math.min(1,(altFrac-0.35)/0.4);
    X.fillStyle=`rgba(255,255,255,${starAlpha*0.7})`;
    for(let si=0;si<80;si++){
      const sx2=(Math.sin(si*127.1+si*si*0.3)*0.5+0.5)*W;
      const sy2=(Math.cos(si*311.7+si*0.7)*0.5+0.5)*H*0.7;
      const sz=0.5+Math.sin(si*73.3)*1.2+Math.sin(Date.now()*0.001+si)*0.3;
      X.beginPath();X.arc(sx2,sy2,Math.max(0.3,sz),0,Math.PI*2);X.fill();
    }
  }
  // Moon
  if(altFrac>0.3){
    const moonA=Math.min(1,(altFrac-0.3)/0.3);
    const mx2=W*0.82,my2=H*0.12;
    X.globalAlpha=moonA;
    const mg2=X.createRadialGradient(mx2,my2,0,mx2,my2,60);
    mg2.addColorStop(0,'rgba(220,220,255,0.15)');mg2.addColorStop(1,'rgba(220,220,255,0)');
    X.fillStyle=mg2;X.fillRect(mx2-60,my2-60,120,120);
    X.fillStyle='#e8e4e0';X.beginPath();X.arc(mx2,my2,22,0,Math.PI*2);X.fill();
    X.fillStyle=lerpColor('#1a1a3a','#201838',altFrac>0.7?1:0);
    X.beginPath();X.arc(mx2+10,my2-3,20,0,Math.PI*2);X.fill();
    X.fillStyle='rgba(180,175,170,0.2)';X.beginPath();X.arc(mx2-6,my2-4,4,0,Math.PI*2);X.fill();
    X.beginPath();X.arc(mx2-10,my2+6,3,0,Math.PI*2);X.fill();
    X.globalAlpha=1;
  }
  // Clouds
  if(altFrac>0.15&&altFrac<0.8){
    const cloudA=Math.min(0.35,(altFrac<0.5?altFrac-0.15:0.8-altFrac)*1.2);
    X.globalAlpha=cloudA;X.fillStyle='#fff';
    const cdrift=Date.now()*0.003;
    for(let ci2=0;ci2<5;ci2++){
      const cx2=((ci2*W*0.28+cdrift*20+ci2*137)%((W+400)))-200;
      const cy2=H*0.15+ci2*H*0.08+Math.sin(ci2*2.3)*20;
      X.beginPath();X.ellipse(cx2,cy2,60+ci2*12,14+ci2*3,0,0,Math.PI*2);X.fill();
      X.beginPath();X.ellipse(cx2+30,cy2-5,40+ci2*8,10+ci2*2,0,0,Math.PI*2);X.fill();
      X.beginPath();X.ellipse(cx2-25,cy2+3,35+ci2*6,12+ci2*2,0,0,Math.PI*2);X.fill();
    }
    X.globalAlpha=1;
  }

  X.save();X.translate(W/2-S.cam.x*cZoom,H/2-S.cam.y*cZoom);X.scale(cZoom,cZoom);

  // Ground
  const gg=X.createLinearGradient(0,TB,0,TB+100);gg.addColorStop(0,'#8AB880');gg.addColorStop(0.4,'#6AA070');gg.addColorStop(1,'#4A7858');
  X.fillStyle=gg;X.fillRect(TL-UW,TB,TW+UW*2,800);

  // Parallax treeline
  X.restore();
  X.save();
  const pxFactor=0.6;
  X.translate(W/2-S.cam.x*cZoom*pxFactor,H/2-S.cam.y*cZoom);X.scale(cZoom,cZoom);
  const treeBase=TB;
  const treeCols=['#4a8a45','#3d7a3a','#5a9a50','#3a7030','#5a9855','#4a8540'];
  for(let tx=TL-200;tx<TR+200;tx+=28+Math.sin(tx*0.1)*12){
    const tH=80+Math.sin(tx*0.23)*40+Math.cos(tx*0.17)*20;
    const tW=30+Math.sin(tx*0.31)*12;
    const tc=treeCols[Math.abs(Math.floor(tx*0.1))%treeCols.length];
    X.fillStyle='#6a5a40';X.fillRect(tx-3,treeBase-tH*0.4,6,tH*0.4);
    X.fillStyle=tc;X.beginPath();X.ellipse(tx,treeBase-tH*0.5,tW*0.6,tH*0.35,0,0,Math.PI*2);X.fill();
    X.fillStyle=tc+'cc';X.beginPath();X.ellipse(tx-4,treeBase-tH*0.65,tW*0.45,tH*0.22,0,0,Math.PI*2);X.fill();
    X.beginPath();X.ellipse(tx+6,treeBase-tH*0.58,tW*0.35,tH*0.2,0,0,Math.PI*2);X.fill();
  }
  X.globalAlpha=0.4;
  for(let tx=TL-300;tx<TR+300;tx+=40+Math.sin(tx*0.07)*15){
    const tH=60+Math.sin(tx*0.19)*25;
    const tc=treeCols[Math.abs(Math.floor(tx*0.07))%treeCols.length];
    X.fillStyle=tc;X.beginPath();X.ellipse(tx,treeBase-tH*0.3,22,tH*0.3,0,0,Math.PI*2);X.fill();
  }
  X.globalAlpha=1;
  X.restore();
  // Re-apply main camera
  X.save();X.translate(W/2-S.cam.x*cZoom,H/2-S.cam.y*cZoom);X.scale(cZoom,cZoom);

  // Parking lots
  const pkW=300,pkY=TB;
  X.fillStyle='#808080';X.fillRect(TL-UW,pkY,pkW,FT);X.fillStyle='#707070';X.fillRect(TL-UW,pkY,pkW,2);
  X.strokeStyle='rgba(255,255,255,0.4)';X.lineWidth=1;X.setLineDash([]);
  for(let lx=TL-UW+30;lx<TL-UW+pkW;lx+=50){X.beginPath();X.moveTo(lx,pkY-30);X.lineTo(lx,pkY);X.stroke()}
  drawCar(TL-UW+55,pkY,'#c03030');drawCar(TL-UW+155,pkY,'#3050a0');drawCar(TL-UW+255,pkY,'#e0e0e0');
  X.fillStyle='#808080';X.fillRect(TR+UW-pkW,pkY,pkW,FT);X.fillStyle='#707070';X.fillRect(TR+UW-pkW,pkY,pkW,2);
  for(let lx=TR+UW-pkW+30;lx<TR+UW;lx+=50){X.strokeStyle='rgba(255,255,255,0.4)';X.beginPath();X.moveTo(lx,pkY-30);X.lineTo(lx,pkY);X.stroke()}
  drawCar(TR+UW-245,pkY,'#d0a020');drawCar(TR+UW-145,pkY,'#404040');

  // Scaffolding
  drawScaffold(TL-80,TT,80,TB-TT);
  drawScaffold(TR,TT,80,TB-TT);

  // Floors
  S.floors.forEach((f)=>{
    if(f.level<0)return;
    const i=f.level,lit=S.litFloors.has(i),fy=f.y;
    X.strokeStyle='rgba(120,100,80,0.3)';X.lineWidth=4;X.beginPath();X.moveTo(TL-UW,fy);X.lineTo(TL,fy);X.stroke();X.beginPath();X.moveTo(TR,fy);X.lineTo(TR+UW,fy);X.stroke();
    for(let bi=0;bi<BPF;bi++){
      const bx=TL+bi*PG,isWin=(bi+1)%4===0,isElev=bi===6;
      if(isElev){
        const elevW=PG*0.5,elevX=bx+PG*0.25;  // 150px shaft centered in 300px block
        const doorH=FH*0.65,doorY=fy-doorH;    // doors sit on the floor line
        // Normal wall on both sides of shaft
        const th=FTHEME[i]||FTHEME[0];
        X.fillStyle=lit?th.wall:th.dark;X.fillRect(bx,fy-FH,PG*0.25,FH);X.fillRect(elevX+elevW,fy-FH,PG*0.25,FH);
        if(lit){X.fillStyle=th.accent;X.fillRect(bx,fy-FH,PG*0.25,FH);X.fillRect(elevX+elevW,fy-FH,PG*0.25,FH)}
        if(!lit){X.fillStyle='rgba(0,0,0,0.12)';X.fillRect(bx,fy-FH,PG*0.25,FH);X.fillRect(elevX+elevW,fy-FH,PG*0.25,FH)}
        // Shaft interior (extends past slab for cross-floor continuity)
        X.fillStyle='#0a0a12';X.fillRect(elevX,fy-FH-4,elevW,FH+8);
        // Guide rails (full shaft height)
        X.strokeStyle='#686870';X.lineWidth=3;
        X.beginPath();X.moveTo(elevX+10,fy-FH-4);X.lineTo(elevX+10,fy+4);X.stroke();
        X.beginPath();X.moveTo(elevX+elevW-10,fy-FH-4);X.lineTo(elevX+elevW-10,fy+4);X.stroke();
        // Center cable
        X.strokeStyle='#606068';X.lineWidth=2;
        X.beginPath();X.moveTo(elevX+elevW/2,fy-FH-4);X.lineTo(elevX+elevW/2,fy+4);X.stroke();
        // Door frame (around door-height opening)
        X.strokeStyle='#808088';X.lineWidth=5;X.strokeRect(elevX+2,doorY-4,elevW-4,doorH+4);
        // Per-floor door state — only open on player's floor or animation floors
        const isPlayerFloor=(i===S.player.cf);
        const isAnimFloor=(S.elevAnim!=='idle')&&(i===S.elevFrom||i===S.elevTo);
        const doorOpenAmount=(isPlayerFloor||isAnimFloor)?S.elevDoors:0;
        // Sliding doors (clipped to shaft)
        X.save();X.beginPath();X.rect(elevX,doorY,elevW,doorH);X.clip();
        const doorSlide=doorOpenAmount*(elevW/2-2);
        const doorCol=lit?'#909098':'#606068';
        X.fillStyle=doorCol;X.fillRect(elevX-doorSlide,doorY,elevW/2,doorH);
        X.fillStyle='#808088';X.fillRect(elevX-doorSlide+elevW/2-1,doorY,2,doorH);
        X.fillStyle=doorCol;X.fillRect(elevX+elevW/2+doorSlide,doorY,elevW/2,doorH);
        X.restore();
        // Interior detail when doors are open
        if(doorOpenAmount>0.3){X.fillStyle='#14141e';X.fillRect(elevX+4,doorY+2,elevW-8,doorH-4);X.strokeStyle='#505058';X.lineWidth=2;X.beginPath();X.moveTo(elevX+8,doorY+doorH*0.55);X.lineTo(elevX+elevW-8,doorY+doorH*0.55);X.stroke()}
        // Floor indicator above doors
        X.fillStyle=lit?'rgba(60,50,20,0.8)':'rgba(20,20,25,0.8)';
        X.beginPath();X.roundRect(elevX+elevW/2-18,fy-FH+4,36,14,2);X.fill();
        if(lit){X.fillStyle='rgba(255,200,80,0.7)';X.font='bold 9px monospace';X.textAlign='center';X.fillText(`F${i+1}`,elevX+elevW/2,fy-FH+14)}
        else{X.fillStyle='rgba(80,80,90,0.5)';X.font='bold 9px monospace';X.textAlign='center';X.fillText(`F${i+1}`,elevX+elevW/2,fy-FH+14)}
        // Call button on right wall of shaft
        if(lit){X.fillStyle='#404048';X.beginPath();X.arc(elevX+elevW+12,fy-FH*0.45,5,0,Math.PI*2);X.fill();if(doorOpenAmount>0.5){const glw=X.createRadialGradient(elevX+elevW+12,fy-FH*0.45,0,elevX+elevW+12,fy-FH*0.45,10);glw.addColorStop(0,'rgba(255,215,0,0.4)');glw.addColorStop(1,'rgba(255,215,0,0)');X.fillStyle=glw;X.beginPath();X.arc(elevX+elevW+12,fy-FH*0.45,10,0,Math.PI*2);X.fill()}X.fillStyle=doorOpenAmount>0.5?'#ffd700':'#606068';X.beginPath();X.arc(elevX+elevW+12,fy-FH*0.45,3.5,0,Math.PI*2);X.fill()}
      } else if(isWin){
        X.fillStyle=lit?'rgba(160,205,235,0.1)':'rgba(60,80,100,0.06)';X.fillRect(bx,fy-FH,PG,FH);
        X.strokeStyle=lit?'rgba(80,120,150,0.4)':'rgba(60,80,100,0.15)';X.lineWidth=3;
        X.strokeRect(bx+4,fy-FH+4,PG-8,FH-8);
        X.lineWidth=2.5;X.beginPath();X.moveTo(bx+PG/2,fy-FH+4);X.lineTo(bx+PG/2,fy-4);X.stroke();
        X.beginPath();X.moveTo(bx+4,fy-FH/2);X.lineTo(bx+PG-4,fy-FH/2);X.stroke();
        if(lit){X.fillStyle='rgba(200,230,255,0.05)';X.fillRect(bx+6,fy-FH+6,PG*0.35,FH*0.4)}
      } else {
        const th=FTHEME[i]||FTHEME[0];
        X.fillStyle=lit?th.wall:th.dark;X.fillRect(bx,fy-FH,PG,FH);
        if(lit){X.fillStyle=th.accent;X.fillRect(bx,fy-FH,PG,FH)}
        if(!lit){X.fillStyle='rgba(0,0,0,0.12)';X.fillRect(bx,fy-FH,PG,FH)}
      }
      if(lit&&!isWin&&!isElev&&S.modules[i][bi]){drawMod(S.modules[i][bi].id,bx,fy-FH,PG,FH)}
    }
    if(lit){for(let lx=TL+180;lx<TR;lx+=280){X.fillStyle='#333';X.fillRect(lx,fy-FH,2,38);X.fillStyle='#b08d5c';X.beginPath();X.arc(lx+1,fy-FH+38,7,Math.PI,0);X.fill();const gl=X.createRadialGradient(lx+1,fy-FH+42,0,lx+1,fy-FH+42,55);gl.addColorStop(0,'rgba(255,235,160,0.35)');gl.addColorStop(1,'rgba(255,235,160,0)');X.fillStyle=gl;X.fillRect(lx-55,fy-FH+38,110,90)}}
    X.fillStyle='#8f8c85';X.fillRect(TL,fy,TW,FT);X.fillStyle='#a09e98';X.fillRect(TL,fy,TW,2);
    X.fillStyle='#7a766f';for(let px=TL+PG;px<TR;px+=PG)X.fillRect(px-5,fy-FH,10,FH);
    X.fillStyle=lit?'rgba(0,180,80,0.55)':'rgba(100,100,100,0.25)';X.beginPath();X.arc(TL+25,fy-FH/2,5,0,Math.PI*2);X.fill();
    X.fillStyle=lit?'rgba(60,50,40,0.5)':'rgba(60,50,40,0.18)';X.font='11px monospace';X.textAlign='left';X.fillText(`F${i+1} ${FD[i].name}`,TL+36,fy-FH/2+4);
    if(!lit){X.fillStyle='rgba(255,100,50,0.45)';X.font='9px monospace';X.fillText('🔒',TL+36,fy-FH/2+16)}
  });

  // Side walls
  X.fillStyle='rgba(180,210,220,0.15)';X.fillRect(TL-FT,TT-FT,FT,(TB-TT)+FT);X.fillStyle='rgba(100,180,170,0.4)';X.fillRect(TL-3,TT-FT,3,(TB-TT)+FT);
  X.fillStyle='rgba(180,210,220,0.15)';X.fillRect(TR,TT-FT,FT,(TB-TT)+FT);X.fillStyle='rgba(100,180,170,0.4)';X.fillRect(TR,TT-FT,3,(TB-TT)+FT);

  // Rooftop
  X.fillStyle='#8f8c85';X.fillRect(TL,ROOF_Y,TW,FT);X.fillStyle='#a09e98';X.fillRect(TL,ROOF_Y,TW,2);
  X.strokeStyle='rgba(200,180,80,0.5)';X.lineWidth=3;X.beginPath();X.moveTo(TL,ROOF_Y-30);X.lineTo(TR,ROOF_Y-30);X.stroke();
  X.strokeStyle='rgba(200,180,80,0.3)';X.lineWidth=2;X.beginPath();X.moveTo(TL,ROOF_Y-15);X.lineTo(TR,ROOF_Y-15);X.stroke();
  for(let rx=TL;rx<=TR;rx+=120){X.fillStyle='rgba(180,160,60,0.4)';X.fillRect(rx-2,ROOF_Y-30,4,30)}
  X.fillStyle='#a09880';X.fillRect(TL+80,ROOF_Y-12,50,12);X.fillStyle='#708090';X.fillRect(TL+160,ROOF_Y-18,30,18);
  S.cranes.forEach(c=>drawCrane(c.x,c.y));
  X.fillStyle='rgba(255,200,40,0.7)';X.beginPath();X.roundRect(TL+TW/2-80,ROOF_Y-50,160,28,4);X.fill();
  X.fillStyle='#2a2010';X.font='bold 11px monospace';X.textAlign='center';X.fillText('⚠ UNDER CONSTRUCTION ⚠',TL+TW/2,ROOF_Y-32);
  X.fillStyle='#2c2e33';X.fillRect(TL-FT,TT-FT,TW+FT*2,FT);

  // Boundary
  const bOp=0.2+Math.sin(Date.now()*0.003)*0.12;X.strokeStyle=`rgba(180,160,80,${bOp})`;X.lineWidth=4;X.setLineDash([24,16]);
  X.beginPath();X.moveTo(TL-UW,TT-400);X.lineTo(TL-UW,TB+100);X.moveTo(TR+UW,TT-400);X.lineTo(TR+UW,TB+100);X.stroke();X.setLineDash([]);

  // Stairs
  S.stairs.forEach(st=>{X.strokeStyle='rgba(96,125,139,0.5)';X.lineWidth=4;X.beginPath();X.moveTo(st.bx,st.by);X.lineTo(st.tx,st.ty);X.stroke();
    X.fillStyle='#455a64';for(let i=0;i<=14;i++){const px=st.bx+(st.tx-st.bx)*(i/14),py=st.by+(st.ty-st.by)*(i/14);X.fillRect(px-12,py-4,24,5)}
    X.strokeStyle='rgba(80,90,100,0.4)';X.lineWidth=2;X.beginPath();X.moveTo(st.bx-14,st.by-30);X.lineTo(st.tx-14,st.ty-30);X.stroke();X.beginPath();X.moveTo(st.bx+14,st.by-30);X.lineTo(st.tx+14,st.ty-30);X.stroke()});

  // Objects
  S.objs.forEach(o=>{if(!S.litFloors.has(o.floor))return;X.fillStyle='rgba(0,0,0,0.04)';X.beginPath();X.ellipse(o.x+o.width/2,o.y,o.width/2+3,3,0,0,Math.PI*2);X.fill();X.fillStyle=o.c;X.beginPath();X.roundRect(o.x,o.y-o.height,o.width,o.height,4);X.fill();X.fillStyle='rgba(255,255,255,0.12)';X.fillRect(o.x+1,o.y-o.height+1,o.width-2,3)});
  S.suits.forEach(s=>{if(s.taken||!S.litFloors.has(s.floor))return;const bob=Math.sin(Date.now()*0.002+s.x)*2;X.fillStyle='rgba(80,70,100,0.45)';X.beginPath();X.roundRect(s.x-10,s.y-44+bob,20,32,6);X.fill()});

  // NPCs
  const al=[],ca=[],bz=[],cw=[];
  S.npcs.forEach(n=>{
    if(!S.litFloors.has(n.floor))return;
    if(n.type==='a')al.push(n);
    else if(n.type==='c')ca.push(n);
    else if(n.type==='w')cw.push(n);
    else bz.push(n);
  });
  al.forEach(n=>drawBlob(n,false,true));
  ca.forEach(n=>drawCasual(n));
  bz.forEach(n=>drawBiz(n));
  cw.forEach(n=>drawWorker(n));
  S.workers.forEach(w=>drawWorker(w));

  // Player (fade during elevator door animation)
  const p=S.player;if(S.elevAnim!=='idle')X.globalAlpha=Math.max(0,S.elevDoors);
  if(p.suit)drawBlob({...p,color:p.suitC},true,true);else drawBlob(p,true,true);
  X.globalAlpha=1;

  // Charge bars
  if(p.isChg&&p.chgT>0){const t=p.chgT/CHG_MX,bh=40,bw=6,bx2=p.x+18,by2=p.y-60;X.fillStyle='rgba(0,0,0,0.35)';X.beginPath();X.roundRect(bx2-1,by2-1,bw+2,bh+2,3);X.fill();X.fillStyle=`rgb(255,${Math.round(255-t*100)},${Math.round(Math.max(0,255-t*200))})`;X.beginPath();X.roundRect(bx2,by2+bh-bh*t,bw,bh*t,2);X.fill();X.fillStyle='#fff';X.font='bold 10px monospace';X.textAlign='center';X.fillText(`${1+Math.floor(t*2)}F▲`,bx2+bw/2,by2-6)}
  if(p.isDrp&&p.drpT>0){const t=p.drpT/DROP_MX,bh=35,bw=6,bx2=p.x+18,by2=p.y+8;X.fillStyle='rgba(0,0,0,0.35)';X.beginPath();X.roundRect(bx2-1,by2-1,bw+2,bh+2,3);X.fill();X.fillStyle=`rgb(${Math.round(100+t*155)},${Math.round(180-t*130)},255)`;X.beginPath();X.roundRect(bx2,by2,bw,bh*t,2);X.fill();X.fillStyle='#fff';X.font='bold 10px monospace';X.textAlign='center';X.fillText(`${1+Math.floor(t*3)}F▼`,bx2+bw/2,by2+bh+12)}

  // Interaction prompts
  const inter=getInter();
  if(inter&&S.elevAnim==='idle'){let pt='',px2=p.x,py2=p.y-p.h-20;
    if(inter.t==='elev')pt='[E] Elevator';else if(inter.t==='up')pt='▲ Climb';else if(inter.t==='dn')pt='▼ Descend';
    else if(inter.t==='obj'){pt=`[E] ${inter.v.nm}`;px2=inter.v.x+inter.v.width/2;py2=inter.v.y-inter.v.height-18}
    else if(inter.t==='npc'){pt=`[E] ${inter.v.name}`;px2=inter.v.x;py2=inter.v.y-inter.v.h-18}
    X.font='bold 13px Segoe UI,sans-serif';X.textAlign='center';const tw=X.measureText(pt).width;
    X.fillStyle='rgba(0,0,0,0.55)';X.beginPath();X.roundRect(px2-tw/2-8,py2-12,tw+16,20,4);X.fill();X.fillStyle='#ffee88';X.fillText(pt,px2,py2+2)}
  const ns=nearSuit();if(ns&&!p.suit){X.font='bold 12px Segoe UI,sans-serif';X.textAlign='center';X.fillStyle='rgba(0,0,0,0.5)';const stxt='[F] Suit',stw=X.measureText(stxt).width;X.beginPath();X.roundRect(ns.x-stw/2-6,ns.y-66,stw+12,18,4);X.fill();X.fillStyle='#ffd870';X.fillText(stxt,ns.x,ns.y-54)}
  X.restore();
}
