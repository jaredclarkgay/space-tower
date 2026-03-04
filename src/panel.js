'use strict';
import { S, getActiveBuildFloor, placeModule, sellModule, canAfford, isBuildable } from './state.js';
import { FD, STAGES } from './floors.js';
import { NF, BPF, isWinBlock, isElevBlock } from './constants.js';
import { isReckoningActive } from './reckoning.js';

// ═══ BUILD PANEL ═══
let bpTitle, bpContent;

export function setupPanel(){
  bpTitle=document.getElementById('bp-ftitle');
  bpContent=document.getElementById('bp-content');
  document.getElementById('fn-prev').addEventListener('click',()=>{if(S.panelFloor>0){S.panelFloor--;S.panelDirty=true}});
  document.getElementById('fn-next').addEventListener('click',()=>{if(S.panelFloor<NF-1){S.panelFloor++;S.panelDirty=true}});

  // Delegated click handler for all dynamic panel content
  bpContent.addEventListener('click',(e)=>{
    // Floor row navigation
    const fpRow=e.target.closest('.fp-row');
    if(fpRow){
      S.panelFloor=parseInt(fpRow.dataset.fi);S.panelDirty=true;renderPanel();
      return;
    }

    // Module placement
    const modCard=e.target.closest('.mod-card');
    if(modCard){
      if(isReckoningActive())return;
      const mfi=parseInt(modCard.dataset.fi),mid=modCard.dataset.id;
      const mod=FD[mfi].mods.find(m=>m.id===mid);
      if(!mod||!canAfford(mod.cost))return;
      // Find first empty buildable block
      for(let bi=0;bi<BPF;bi++){
        if(!isBuildable(bi))continue;
        if(S.modules[mfi][bi])continue;
        placeModule(mfi,bi,mod);
        renderPanel();
        return;
      }
      return;
    }

    // Module selling (block team modules from Floor 8)
    const modPlaced=e.target.closest('.mod-placed');
    if(modPlaced){
      const mfi=parseInt(modPlaced.dataset.fi),mbi=parseInt(modPlaced.dataset.bi);
      const mod=S.modules[mfi]&&S.modules[mfi][mbi];
      if(mod&&mod.team)return; // can't sell Floor 8 game modules
      sellModule(mfi,mbi);
      renderPanel();
      return;
    }
  });
}

export function renderPanel(){
  if(!S.panelDirty)return;S.panelDirty=false;
  const fi=S.panelFloor,fd=FD[fi],stg=S.buildout[fi].stage;
  const abf=getActiveBuildFloor();

  document.getElementById('fn-prev').className='nav'+(fi===0?' dis':'');
  document.getElementById('fn-next').className='nav'+(fi===NF-1?' dis':'');
  bpTitle.textContent=`FLOOR ${fi+1} · ${fd.name}`;
  bpTitle.style.color=stg>=5?'#00ff88':stg>0?'#ffd700':'#ff6b35';

  let h='';

  // Credits display
  h+=`<div style="text-align:center;margin:6px 0;font-size:13px;color:#ffd700;letter-spacing:1px">$${S.credits}</div>`;

  // Stage progress dots
  h+='<div style="display:flex;gap:6px;justify-content:center;margin:10px 0">';
  const labels=['POWER','STRUCTURE','SYSTEMS','FURNISH','ACTIVATE'];
  for(let s=0;s<5;s++){
    const done=stg>s,cur=stg===s&&fi===abf;
    const c=done?'#00ff88':cur?'#ffd700':'rgba(255,255,255,0.15)';
    h+=`<div style="display:flex;flex-direction:column;align-items:center;gap:3px">`;
    h+=`<div style="width:${cur?14:10}px;height:${cur?14:10}px;border-radius:50%;background:${c};${cur?'box-shadow:0 0 8px rgba(255,215,0,0.5);':''}transition:all 0.3s"></div>`;
    h+=`<div style="font-size:7px;letter-spacing:0.5px;opacity:${done?0.6:cur?0.9:0.2};color:${cur?'#ffd700':'#fff'}">${labels[s]}</div>`;
    h+=`</div>`;
  }
  h+='</div>';

  // Status text + module UI for complete floors
  if(stg>=5){
    // Count placed modules
    let placed=0,total=0;
    for(let bi=0;bi<BPF;bi++){
      if(!isBuildable(bi))continue;
      total++;
      if(S.modules[fi][bi])placed++;
    }

    // Installed modules
    h+=`<div style="font-size:8px;opacity:0.4;letter-spacing:1.5px;margin:6px 0 4px;text-align:center">INSTALLED (${placed}/${total})</div>`;
    let hasInstalled=false;
    for(let bi=0;bi<BPF;bi++){
      if(!isBuildable(bi))continue;
      const mod=S.modules[fi][bi];
      if(!mod)continue;
      hasInstalled=true;
      h+=`<div class="mod-placed" data-fi="${fi}" data-bi="${bi}" style="display:flex;align-items:center;gap:6px;padding:3px 6px;margin:2px 0;border-radius:3px;cursor:pointer;background:rgba(255,255,255,0.04)">`;
      h+=`<span style="font-size:14px">${mod.ic}</span>`;
      h+=`<span style="font-size:10px;flex:1;opacity:0.7">${mod.nm}</span>`;
      h+=mod.team?`<span style="font-size:9px;color:${mod.team==='b'?'#FF6600':'#4060a0'};opacity:0.6">${mod.team==='b'?'BUILDER':'SUIT'}</span>`:`<span style="font-size:9px;color:#ff6b6b;opacity:0.6">SELL $${mod.sell}</span>`;
      h+=`</div>`;
    }
    if(!hasInstalled)h+=`<div style="text-align:center;font-size:9px;opacity:0.25;margin:4px 0">No modules installed</div>`;

    // Divider
    h+=`<div style="border-top:1px solid rgba(255,255,255,0.06);margin:8px 0"></div>`;

    // Available modules
    if(placed>=total){
      h+=`<div style="text-align:center;color:#00ff88;font-size:10px;margin:8px 0;opacity:0.6">All blocks occupied</div>`;
    } else {
      h+=`<div style="font-size:8px;opacity:0.4;letter-spacing:1.5px;margin:6px 0 4px;text-align:center">AVAILABLE</div>`;
      h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:4px 0">`;
      for(const mod of fd.mods){
        const afford=canAfford(mod.cost);
        h+=`<div class="mod-card" data-fi="${fi}" data-id="${mod.id}" style="padding:6px;border-radius:4px;cursor:${afford?'pointer':'default'};background:rgba(255,255,255,${afford?'0.05':'0.02'});opacity:${afford?1:0.35};border:1px solid rgba(255,255,255,${afford?'0.08':'0.03'})">`;
        h+=`<div style="text-align:center;font-size:16px;margin-bottom:2px">${mod.ic}</div>`;
        h+=`<div style="font-size:9px;text-align:center;opacity:0.7;margin-bottom:2px">${mod.nm}</div>`;
        h+=`<div style="font-size:9px;text-align:center;color:#ffd700">$${mod.cost}</div>`;
        h+=`<div style="font-size:7px;text-align:center;opacity:0.3;margin-top:2px">${mod.desc}</div>`;
        h+=`</div>`;
      }
      h+=`</div>`;
    }
  } else if(fi===abf){
    const def=STAGES[fi][stg];
    h+=`<div style="text-align:center;margin:8px 0">`;
    h+=`<div style="color:#ffd700;font-size:11px;margin-bottom:4px">Next: ${def.label}</div>`;
    h+=`<div style="color:rgba(255,255,255,0.35);font-size:9px">Walk to the build point and press E</div>`;
    h+=`</div>`;
  } else if(abf===-1){
    h+=`<div style="text-align:center;color:#00ff88;font-size:10px;margin:8px 0;letter-spacing:1px">ALL FLOORS COMPLETE</div>`;
  } else {
    h+=`<div style="text-align:center;color:rgba(255,255,255,0.25);font-size:10px;margin:8px 0">Complete floors below first</div>`;
  }

  // Divider
  h+=`<div style="border-top:1px solid rgba(255,255,255,0.08);margin:10px 0"></div>`;

  // Floor overview
  h+=`<div style="font-size:8px;opacity:0.3;letter-spacing:2px;margin-bottom:6px;text-align:center">ALL FLOORS</div>`;
  for(let i=0;i<NF;i++){
    const s=S.buildout[i].stage,isCur=i===fi;
    const c=s>=5?'#00ff88':s>0?'#ffd700':'rgba(255,255,255,0.2)';
    h+=`<div class="fp-row" data-fi="${i}" style="display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:3px;cursor:pointer;${isCur?'background:rgba(255,255,255,0.06);':''}margin-bottom:1px">`;
    h+=`<div style="font-size:9px;opacity:0.4;width:20px">F${i+1}</div>`;
    h+=`<div style="font-size:10px;flex:1;opacity:${isCur?1:0.5}">${FD[i].name}</div>`;
    h+=`<div style="display:flex;gap:3px">`;
    for(let d=0;d<5;d++){
      h+=`<div style="width:6px;height:6px;border-radius:50%;background:${s>d?c:'rgba(255,255,255,0.1)'}"></div>`;
    }
    h+=`</div>`;
    h+=`<div style="font-size:8px;opacity:0.3;width:30px;text-align:right">${s>=5?'★':s>0?s+'/5':''}</div>`;
    h+=`</div>`;
  }

  bpContent.innerHTML=h;
}
