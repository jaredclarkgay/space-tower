'use strict';
import { S } from './state.js';

// ═══ COMPENDIUM ═══
// Total discoverable names: HN(16) + BN2(8) + CWN(6) + AN(6) = 36
const TOTAL = 36;
const TYPE_LABEL = { c:'Casual', b:'Business', w:'Worker', a:'Alien' };
const TYPE_COLOR = { c:'#7aaa8a', b:'#6090c0', w:'#e08c3a', a:'#cc60ff' };

let compPanel, compGrid, compDetail, compCountEl;
let activeTab = 'all';
let selectedName = null;

export function setupCompendium(){
  compPanel = document.getElementById('comp-panel');
  compGrid = document.getElementById('comp-grid');
  compDetail = document.getElementById('comp-detail');
  compCountEl = document.getElementById('comp-count');

  document.getElementById('comp-btn').addEventListener('click', toggleCompendium);
  document.getElementById('comp-close').addEventListener('click', closeCompendium);

  document.getElementById('comp-tabs').addEventListener('click', e=>{
    const tab = e.target.closest('.ctab');
    if(!tab) return;
    activeTab = tab.dataset.t;
    document.querySelectorAll('.ctab').forEach(el=>el.classList.toggle('on', el.dataset.t===activeTab));
    selectedName = null;
    _renderGrid();
    _renderDetail(null);
  });

  addEventListener('keydown', e=>{
    if(e.code==='Tab'){e.preventDefault();toggleCompendium()}
    else if(e.code==='Escape'&&isCompendiumOpen()) closeCompendium();
  });
}

export function isCompendiumOpen(){ return compPanel?.classList.contains('open') }

export function toggleCompendium(){
  if(isCompendiumOpen()) closeCompendium();
  else openCompendium();
}

function openCompendium(){
  compPanel.classList.add('open');
  selectedName = null;
  activeTab = 'all';
  document.querySelectorAll('.ctab').forEach(el=>el.classList.toggle('on', el.dataset.t==='all'));
  _renderGrid();
  _renderDetail(null);
}

function closeCompendium(){ compPanel.classList.remove('open') }

export function renderCompendium(){ if(isCompendiumOpen()) _renderGrid() }

function _renderGrid(){
  const entries = Object.values(S.compendium.entries);
  compCountEl.textContent = `${entries.length} / ${TOTAL}`;

  const filtered = activeTab==='all' ? entries : entries.filter(e=>e.type===activeTab);
  compGrid.innerHTML = '';

  if(filtered.length===0){
    compGrid.innerHTML = '<div class="comp-empty">No characters discovered<br>in this category yet.</div>';
    return;
  }

  filtered.sort((a,b)=>a.name.localeCompare(b.name));
  filtered.forEach(entry=>{
    const card = document.createElement('div');
    card.className = 'comp-card'+(selectedName===entry.name?' sel':'');

    const cv = document.createElement('canvas');
    cv.width=44; cv.height=56;
    _drawSprite(cv, entry);
    card.appendChild(cv);

    const nm = document.createElement('div');
    nm.className = 'comp-name';
    nm.textContent = entry.name;
    card.appendChild(nm);

    const tp = document.createElement('div');
    tp.className = 'comp-type-badge';
    tp.style.color = TYPE_COLOR[entry.type]||'#888';
    tp.textContent = TYPE_LABEL[entry.type]||'???';
    card.appendChild(tp);

    card.addEventListener('click',()=>{
      selectedName = entry.name;
      _renderGrid();
      _renderDetail(entry);
    });
    compGrid.appendChild(card);
  });
}

function _renderDetail(entry){
  if(!entry){ compDetail.innerHTML = '<div class="comp-empty">Select a character<br>to see details.</div>'; return }
  const col = TYPE_COLOR[entry.type]||'#fff';
  const heard = entry.dialogueHeard||[];
  let h = `<div class="comp-dname" style="color:${col}">${entry.name}</div>`;
  h += `<div class="comp-dtype">${TYPE_LABEL[entry.type]||'???'}</div>`;
  if(heard.length>0){
    h += '<div class="comp-dlabel">DIALOGUE HEARD</div>';
    heard.forEach(line=>{ h += `<div class="comp-dline">"${line}"</div>` });
  } else {
    h += '<div style="opacity:0.35;font-size:10px;margin-top:8px;line-height:1.5">Talk to this person<br>to hear their story.</div>';
  }
  compDetail.innerHTML = h;
}

// ─── Mini sprite renderer ───
function _drawSprite(canvas, entry){
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const cx = canvas.width/2, cy = canvas.height-6;

  if(entry.type==='a'){
    const col = entry.color||'#3ddc84';
    // Antenna
    ctx.strokeStyle=col; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx,cy-34); ctx.lineTo(cx-3,cy-44); ctx.stroke();
    ctx.fillStyle=col; ctx.beginPath(); ctx.arc(cx-3,cy-46,3,0,Math.PI*2); ctx.fill();
    // Body
    ctx.fillStyle=col; ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(cx-10,cy-34,20,30,6);
    else ctx.rect(cx-10,cy-34,20,30);
    ctx.fill();
    // Eye
    ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(cx+2,cy-22,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='black'; ctx.beginPath(); ctx.arc(cx+3,cy-22,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(cx+4,cy-24,1,0,Math.PI*2); ctx.fill();
    // Legs
    ctx.fillStyle='#222'; ctx.fillRect(cx-6,cy-4,4,10); ctx.fillRect(cx+2,cy-4,4,10);
  } else if(entry.type==='c'&&entry.app){
    const a=entry.app;
    ctx.fillStyle='rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.ellipse(cx,cy,9,2.5,0,0,Math.PI*2); ctx.fill();
    // Legs
    ctx.fillStyle=a.bot; ctx.fillRect(cx-5,cy-14,4,13); ctx.fillRect(cx+1,cy-14,4,13);
    // Shoes
    ctx.fillStyle=a.sho; ctx.fillRect(cx-6,cy-2,5,3); ctx.fillRect(cx,cy-2,5,3);
    // Torso
    const tw=a.fem?12:14;
    ctx.fillStyle=a.top; ctx.fillRect(cx-tw/2,cy-31,tw,17);
    // Arms
    ctx.fillStyle=a.top; ctx.fillRect(cx-tw/2-5,cy-30,4,11); ctx.fillRect(cx+tw/2+1,cy-30,4,11);
    ctx.fillStyle=a.skin; ctx.beginPath(); ctx.arc(cx-tw/2-3,cy-19,2.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+tw/2+3,cy-19,2.5,0,Math.PI*2); ctx.fill();
    // Neck
    ctx.fillStyle=a.skin; ctx.fillRect(cx-2,cy-35,4,5);
    // Head
    ctx.fillStyle=a.skin; ctx.beginPath(); ctx.ellipse(cx,cy-39,5.5,6,0,0,Math.PI*2); ctx.fill();
    // Hair cap
    ctx.fillStyle=a.hair; ctx.beginPath(); ctx.ellipse(cx,cy-43,6,3,0,0,Math.PI); ctx.fill();
    ctx.fillRect(cx-6,cy-44,12,3);
    // Eyes
    ctx.fillStyle='#1a1a2a'; ctx.beginPath(); ctx.arc(cx-2,cy-39,1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+2,cy-39,1,0,Math.PI*2); ctx.fill();
  } else if(entry.type==='b'&&entry.pal){
    const pl=entry.pal;
    ctx.fillStyle='rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.ellipse(cx,cy,9,2.5,0,0,Math.PI*2); ctx.fill();
    // Legs
    ctx.fillStyle=pl.sh; ctx.fillRect(cx-4,cy-14,3,13); ctx.fillRect(cx+1,cy-14,3,13);
    // Suit
    ctx.fillStyle=pl.cl; ctx.fillRect(cx-7,cy-31,14,17);
    // Arms
    ctx.fillStyle=pl.cl; ctx.fillRect(cx-12,cy-30,4,11); ctx.fillRect(cx+8,cy-30,4,11);
    ctx.fillStyle=pl.h; ctx.beginPath(); ctx.arc(cx-10,cy-19,2.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+10,cy-19,2.5,0,Math.PI*2); ctx.fill();
    // Head
    ctx.fillStyle=pl.h; ctx.beginPath(); ctx.ellipse(cx,cy-39,5.5,6.5,0,0,Math.PI*2); ctx.fill();
    // Hair as cap
    ctx.fillStyle=pl.b; ctx.beginPath(); ctx.ellipse(cx,cy-43,5.5,3.5,0,0,Math.PI*2); ctx.fill();
    // Eyes
    ctx.fillStyle='#1a1a2a'; ctx.beginPath(); ctx.arc(cx-2,cy-39,1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+2,cy-39,1,0,Math.PI*2); ctx.fill();
  } else {
    // Worker (type 'w' or unknown)
    ctx.fillStyle='rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.ellipse(cx,cy,9,2.5,0,0,Math.PI*2); ctx.fill();
    // Legs
    ctx.fillStyle='#3a5070'; ctx.fillRect(cx-4,cy-14,3,13); ctx.fillRect(cx+1,cy-14,3,13);
    // Boots
    ctx.fillStyle='#5a4030'; ctx.fillRect(cx-5,cy-2,5,4); ctx.fillRect(cx,cy-2,5,4);
    // Vest
    ctx.fillStyle='#FF6600'; ctx.fillRect(cx-7,cy-31,14,18);
    ctx.fillStyle='rgba(255,255,0,0.6)'; ctx.fillRect(cx-7,cy-25,14,2); ctx.fillRect(cx-7,cy-20,14,2);
    // Arms
    ctx.fillStyle='#FF6600'; ctx.fillRect(cx-11,cy-30,4,11); ctx.fillRect(cx+7,cy-30,4,11);
    ctx.fillStyle='#d4a878'; ctx.beginPath(); ctx.arc(cx-9,cy-19,2.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+9,cy-19,2.5,0,Math.PI*2); ctx.fill();
    // Head
    ctx.fillStyle='#d4a878'; ctx.beginPath(); ctx.ellipse(cx,cy-38,5.5,6,0,0,Math.PI*2); ctx.fill();
    // Hard hat
    ctx.fillStyle='#FFD700'; ctx.beginPath(); ctx.ellipse(cx,cy-45,7.5,4,0,0,Math.PI*2); ctx.fill();
    ctx.fillRect(cx-7.5,cy-45,15,4);
    ctx.fillStyle='#E8C020'; ctx.fillRect(cx-8,cy-42,16,2);
    // Eyes
    ctx.fillStyle='#1a1a2a'; ctx.beginPath(); ctx.arc(cx-2,cy-38,1.2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+2,cy-38,1.2,0,Math.PI*2); ctx.fill();
  }
}
