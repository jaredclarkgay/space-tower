'use strict';
import { S, recalc, canUnlock, canAfford } from './state.js';
import { FD } from './floors.js';
import { MOB, BPF, NF, isWinBlock, isElevBlock } from './constants.js';
import { sndPlace, sndSell, sndFund, ensureAudio } from './sound.js';
import { autoSave } from './save.js';
import { showMsg } from './render.js';
import { mobTab } from './input.js';

// ═══ BUILD PANEL ═══
let bpSlots,bpList,bpLock,bpTitle,bpMob;

export function setupPanel(){
  bpSlots=document.getElementById('bp-slots');
  bpList=document.getElementById('bp-mods-list');
  bpLock=document.getElementById('bp-lock-area');
  bpTitle=document.getElementById('bp-ftitle');
  bpMob=document.getElementById('bp-mob');
  document.getElementById('fn-prev').addEventListener('click',()=>{if(S.panelFloor>0){S.panelFloor--;S.selMod=null;S.panelDirty=true}});
  document.getElementById('fn-next').addEventListener('click',()=>{if(S.panelFloor<NF-1){S.panelFloor++;S.selMod=null;S.panelDirty=true}});

  // Desktop click handlers
  bpSlots.addEventListener('click',e=>{ensureAudio();const sl=e.target.closest('.slot');if(!sl)return;const bi=parseInt(sl.dataset.slot),fi=S.panelFloor;
    if(isWinBlock(bi)||isElevBlock(bi))return;
    if(e.target.closest('.ss')){const m=S.modules[fi][bi];if(m){S.res.credits+=m.sell;S.modules[fi][bi]=null;sndSell();recalc();autoSave();renderPanel()}return}
    if(S.selMod&&!S.modules[fi][bi]&&S.litFloors.has(fi)){if(!canAfford(S.selMod))return;if(S.selMod.cost.credits)S.res.credits-=S.selMod.cost.credits;S.modules[fi][bi]=S.selMod;S.selMod=null;sndPlace();recalc();autoSave();renderPanel()}});
  bpList.addEventListener('click',e=>{ensureAudio();const card=e.target.closest('.mc');if(!card||card.classList.contains('dis'))return;const mi=parseInt(card.dataset.mi),mod=FD[S.panelFloor].mods[mi];
    if(canAfford(mod)){S.selMod=(S.selMod&&S.selMod.id===mod.id)?null:mod;S.panelDirty=true;renderPanel()}});
}

export function renderPanel(){
  if(!S.panelDirty)return;S.panelDirty=false;
  const fi=S.panelFloor,fd=FD[fi],lit=S.litFloors.has(fi);
  document.getElementById('re').textContent=S.res.energy;document.getElementById('re-rate').textContent=`⬆${S.enProd} ⬇${S.enDraw}`;
  document.getElementById('rc').textContent=S.res.credits;document.getElementById('rc-rate').textContent=`+${5+S.crRate}/2s`;
  document.getElementById('rp').textContent=S.res.population;
  const sc=S.sat>=70?'#00ff88':S.sat>=40?'#ffd700':'#ff6b35';
  document.getElementById('sf').style.width=S.sat+'%';document.getElementById('sf').style.background=sc;document.getElementById('st').textContent=Math.floor(S.sat)+'%';
  document.getElementById('fn-prev').className='nav'+(fi===0?' dis':'');document.getElementById('fn-next').className='nav'+(fi===NF-1?' dis':'');
  bpTitle.textContent=`FLOOR ${fi+1} · ${fd.name}`;bpTitle.style.color=lit?'#ffd700':'#ff6b35';
  bpSlots.innerHTML='';
  for(let bi=0;bi<BPF;bi++){const m=S.modules[fi][bi],div=document.createElement('div'),win=isWinBlock(bi),elev=isElevBlock(bi);
    div.className='slot'+(m?' filled':'')+(win||elev?' win':'')+(S.selMod&&!m&&lit&&!win&&!elev?' placeable':'');
    if(elev){div.innerHTML='<div style="font-size:9px;opacity:0.4">🛗</div>';div.style.background='rgba(20,20,30,0.6)';div.style.borderColor='rgba(80,80,100,0.4)';div.style.cursor='default'}
    else if(win){div.innerHTML='<div style="font-size:9px;opacity:0.2">🪟</div>';div.style.background='rgba(130,180,210,0.08)';div.style.borderColor='rgba(100,150,180,0.2)';div.style.cursor='default'}
    else if(m){div.style.borderColor=m.col;div.innerHTML=`<div class="si">${m.ic}</div><div class="sn">${m.nm}</div><div class="ss" data-sell="${bi}">sell 💰${m.sell}</div>`}
    else if(S.selMod&&lit)div.innerHTML='<div style="font-size:14px;opacity:0.4">+</div>';
    else div.innerHTML=`<div style="font-size:7px;opacity:0.12">${bi+1}</div>`;
    div.dataset.slot=bi;bpSlots.appendChild(div)}
  bpList.innerHTML='';bpLock.innerHTML='';
  if(!lit){const u=fd.unlock;if(u){const ok=canUnlock(fi),div=document.createElement('div');div.className='unlock-box '+(ok?'ready':'locked');
    let h=`<div style="font-weight:bold;margin-bottom:4px;color:${ok?'#00ff88':'#ff6b35'}">${ok?'✨ FUND':'🔒 LOCKED'}</div>`;
    if(u.energy!=null)h+=`<div>⚡ ${S.res.energy}/${u.energy} ${S.res.energy>=u.energy?'✓':''}</div>`;
    if(u.population!=null)h+=`<div>👥 ${S.res.population}/${u.population} ${S.res.population>=u.population?'✓':''}</div>`;
    if(u.sat!=null)h+=`<div>😊 ${Math.floor(S.sat)}/${u.sat}% ${S.sat>=u.sat?'✓':''}</div>`;
    div.innerHTML=h;if(ok)div.addEventListener('click',()=>{S.litFloors.add(fi);sndFund();showMsg('FLOOR FUNDED',`${fd.name} — lights on.`);autoSave();S.panelDirty=true;renderPanel()});bpLock.appendChild(div)}
  } else {fd.mods.forEach((mod,mi)=>{const aff=canAfford(mod),sel=S.selMod&&S.selMod.id===mod.id;
    const div=document.createElement('div');div.className='mc'+(sel?' sel':'')+(aff?'':' dis');
    let costS=Object.entries(mod.cost).map(([r,a])=>{const ic=r==='energy'?'⚡':'💰';const ok2=r==='energy'?(S.res.energy+(mod.prod.energy||0)-(mod.cost.energy||0)>=0):(S.res.credits>=a);return`<span style="color:${ok2?'#aaa':'#ff6b35'}">${ic}${a}</span>`}).join(' ');
    let prodS=Object.entries(mod.prod||{}).map(([r,a])=>`<span style="color:#00ff88">${r==='energy'?'⚡':r==='population'?'👥':'💰'}+${a}</span>`).join(' ');
    let satS=mod.sat?`<span style="color:${mod.sat>0?'#00ff88':'#ff6b35'}">${mod.sat>0?'↑':'↓'}${Math.abs(mod.sat)}</span>`:'';
    div.innerHTML=`<div class="mt"><span class="mi">${mod.ic}</span><span class="mn">${mod.nm}</span></div><div class="md">${mod.desc}</div><div class="mp">${costS} ${prodS?'→ '+prodS:''} ${satS}</div>`;
    div.dataset.mi=mi;bpList.appendChild(div)})}
  // Mobile mini bar
  document.getElementById('rm-e').textContent='⚡'+S.res.energy;document.getElementById('rm-c').textContent='💰'+S.res.credits;
  document.getElementById('rm-p').textContent='👥'+S.res.population;document.getElementById('rm-s').textContent='😊'+Math.floor(S.sat)+'%';
  if(!MOB){bpMob.style.display='none';return}
  bpMob.style.display='block';bpMob.innerHTML='';
  if(mobTab==='res'){bpMob.innerHTML=`<div class="rb" style="border-color:#ff6b35;margin-bottom:5px"><div class="l">⚡ ENERGY</div><div class="v" style="color:#ff6b35">${S.res.energy}</div><div class="rate">⬆${S.enProd} ⬇${S.enDraw}</div></div><div class="rb" style="border-color:#ffd700;margin-bottom:5px"><div class="l">💰 CREDITS</div><div class="v" style="color:#ffd700">${S.res.credits}</div><div class="rate">+${5+S.crRate}/2s</div></div><div class="rb" style="border-color:#4a9eff;margin-bottom:5px"><div class="l">👥 POP</div><div class="v" style="color:#4a9eff">${S.res.population}</div></div><div class="rb" style="border-color:#00ff88"><div class="l">😊 MORALE</div><div class="sat-wrap"><div class="sat-fill" style="width:${S.sat}%;background:${sc}"></div><div class="sat-txt">${Math.floor(S.sat)}%</div></div></div>`}
  else if(mobTab==='floor'){let h=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div class="nav" id="mn-prev" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:14px">◀</div><div style="flex:1;text-align:center;font-size:12px;font-weight:bold;color:${lit?'#ffd700':'#ff6b35'}">F${fi+1} · ${fd.name}</div><div class="nav" id="mn-next" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:14px">▶</div></div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px">`;
    for(let bi=0;bi<BPF;bi++){const m=S.modules[fi][bi],win=isWinBlock(bi),elev=isElevBlock(bi);
      if(elev)h+=`<div class="slot" data-slot="${bi}" style="background:rgba(20,20,30,0.6);border-color:rgba(80,80,100,0.4);cursor:default"><div style="font-size:9px;opacity:0.4">🛗</div></div>`;
      else if(win)h+=`<div class="slot" data-slot="${bi}" style="background:rgba(130,180,210,0.08);border-color:rgba(100,150,180,0.2);cursor:default"><div style="font-size:9px;opacity:0.2">🪟</div></div>`;
      else if(m)h+=`<div class="slot filled" style="border-color:${m.col}" data-slot="${bi}"><div class="si">${m.ic}</div><div class="sn">${m.nm}</div><div class="ss" data-sell="${bi}">sell💰${m.sell}</div></div>`;
      else if(S.selMod&&lit)h+=`<div class="slot placeable" data-slot="${bi}"><div style="font-size:12px;opacity:0.4">+</div></div>`;
      else h+=`<div class="slot" data-slot="${bi}"><div style="font-size:7px;opacity:0.12">${bi+1}</div></div>`}
    h+='</div>';
    if(!lit&&fd.unlock){const u=fd.unlock,ok=canUnlock(fi);h+=`<div class="unlock-box ${ok?'ready':'locked'}" id="mn-unlock" style="margin-top:6px"><div style="font-weight:bold;color:${ok?'#00ff88':'#ff6b35'}">${ok?'✨ TAP TO FUND':'🔒 LOCKED'}</div>`;
      if(u.energy!=null)h+=`<div>⚡${S.res.energy}/${u.energy}${S.res.energy>=u.energy?' ✓':''}</div>`;if(u.population!=null)h+=`<div>👥${S.res.population}/${u.population}${S.res.population>=u.population?' ✓':''}</div>`;if(u.sat!=null)h+=`<div>😊${Math.floor(S.sat)}/${u.sat}%${S.sat>=u.sat?' ✓':''}</div>`;h+='</div>'}
    bpMob.innerHTML=h;
    bpMob.querySelector('#mn-prev')?.addEventListener('click',()=>{if(S.panelFloor>0){S.panelFloor--;S.selMod=null;S.panelDirty=true;renderPanel()}});
    bpMob.querySelector('#mn-next')?.addEventListener('click',()=>{if(S.panelFloor<NF-1){S.panelFloor++;S.selMod=null;S.panelDirty=true;renderPanel()}});
    bpMob.querySelector('#mn-unlock')?.addEventListener('click',()=>{if(canUnlock(fi)){S.litFloors.add(fi);sndFund();showMsg('FLOOR FUNDED',`${fd.name} — lights on.`);autoSave();S.panelDirty=true;renderPanel()}});
    bpMob.querySelectorAll('.slot').forEach(el=>{el.addEventListener('click',e=>{ensureAudio();const bi=parseInt(el.dataset.slot);
      if(isWinBlock(bi)||isElevBlock(bi))return;
      if(e.target.closest('.ss')){const m=S.modules[fi][bi];if(m){S.res.credits+=m.sell;S.modules[fi][bi]=null;sndSell();recalc();autoSave();renderPanel()}return}
      if(S.selMod&&!S.modules[fi][bi]&&lit){if(!canAfford(S.selMod))return;if(S.selMod.cost.credits)S.res.credits-=S.selMod.cost.credits;S.modules[fi][bi]=S.selMod;S.selMod=null;sndPlace();recalc();autoSave();renderPanel()}})})}
  else if(mobTab==='mods'){if(!lit){bpMob.innerHTML='<div style="opacity:0.4;text-align:center;padding:20px">Fund floor first</div>';return}
    let h='';fd.mods.forEach((mod,mi)=>{const aff=canAfford(mod),sel=S.selMod&&S.selMod.id===mod.id;
      let costS=Object.entries(mod.cost).map(([r,a])=>{const ic=r==='energy'?'⚡':'💰';const ok2=r==='energy'?(S.res.energy+(mod.prod.energy||0)-(mod.cost.energy||0)>=0):(S.res.credits>=a);return`<span style="color:${ok2?'#aaa':'#ff6b35'}">${ic}${a}</span>`}).join(' ');
      let prodS=Object.entries(mod.prod||{}).map(([r,a])=>`<span style="color:#00ff88">${r==='energy'?'⚡':r==='population'?'👥':'💰'}+${a}</span>`).join(' ');
      h+=`<div class="mc${sel?' sel':''}${aff?'':' dis'}" data-mi="${mi}"><div class="mt"><span class="mi">${mod.ic}</span><span class="mn">${mod.nm}</span></div><div class="md">${mod.desc}</div><div class="mp">${costS} ${prodS?'→ '+prodS:''}</div></div>`});
    bpMob.innerHTML=h;
    bpMob.querySelectorAll('.mc').forEach(el=>{el.addEventListener('click',()=>{if(el.classList.contains('dis'))return;const mi=parseInt(el.dataset.mi),mod=fd.mods[mi];if(canAfford(mod)){S.selMod=(S.selMod&&S.selMod.id===mod.id)?null:mod;S.panelDirty=true;renderPanel()}})})}
}
