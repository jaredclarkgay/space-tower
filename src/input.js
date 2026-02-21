'use strict';
import { S } from './state.js';
import { setTZoom } from './state.js';
import { ensureAudio } from './sound.js';

export let mobTab='res';
export function setMobTab(t){mobTab=t}

// ═══ INPUT ═══
export function setupInput(){
  addEventListener('keydown',e=>{ensureAudio();if(!S.keys[e.code])S.jp[e.code]=true;S.keys[e.code]=true});
  addEventListener('keyup',e=>{S.keys[e.code]=false});

  const tcMap={tl:'ArrowLeft',tr:'ArrowRight',tu:'ArrowUp',td:'ArrowDown',te:'KeyE',tf:'KeyF'};
  Object.entries(tcMap).forEach(([id,code])=>{const el=document.getElementById(id);if(!el)return;
    const dn=()=>{ensureAudio();if(!S.keys[code])S.jp[code]=true;S.keys[code]=true;el.classList.add('on')};
    const up=()=>{S.keys[code]=false;el.classList.remove('on')};
    el.addEventListener('touchstart',e=>{e.preventDefault();dn()},{passive:false});el.addEventListener('touchend',e=>{e.preventDefault();up()},{passive:false});el.addEventListener('touchcancel',up);
    el.addEventListener('mousedown',e=>{e.preventDefault();dn()});el.addEventListener('mouseup',e=>{e.preventDefault();up()});el.addEventListener('mouseleave',up);
  });

  document.getElementById('bp-tabs')?.addEventListener('click',e=>{const t=e.target.closest('.bpt');if(!t)return;mobTab=t.dataset.t;document.querySelectorAll('.bpt').forEach(el=>el.classList.toggle('on',el.dataset.t===mobTab));S.panelDirty=true});

  // Zoom slider
  const zSl=document.getElementById('zoom-sl'),zLb=document.getElementById('zoom-lbl');
  zSl.addEventListener('input',()=>{setTZoom(parseFloat(zSl.value));zLb.textContent=Math.round(parseFloat(zSl.value)*100)+'%'});
}
