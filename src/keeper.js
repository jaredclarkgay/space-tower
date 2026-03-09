'use strict';
import { S, keeperZoom, setKeeperZoom } from './state.js';
import { TL, TR, TW, TB, FH, FT, NF, BPF } from './constants.js';
import { sndKeeper, sndKeeperTick } from './sound.js';

// ═══ CONSTANTS ═══
const KEEPER_FLOOR=9;
const KEEPER_FY=TB-KEEPER_FLOOR*FH; // slab Y of floor 10
const KEEPER_X=TL+TW*0.65;
const KEEPER_H=72;
const DESK_X=TL+TW*0.45;
const DESK_W=TW*0.35;
const PROXIMITY=120;
const ZOOM_MAX=2.0;
const ZOOM_IN_SPEED=0.025; // lerp per frame (~1.5s)
const ZOOM_OUT_SPEED=0.04; // lerp per frame (~1s)

// ═══ SCRIPTED DIALOGUE ═══
function getKeeperDialogue(){
  const floorsBuilt=S.buildout.filter(b=>b.stage>=5).length;
  const sat=S.sat;
  const f8outcome=S.reckoning.outcome;
  return [
    `${floorsBuilt} floors. ${floorsBuilt>=8?'Impressive.':'Hmm.'} I felt each one arrive — through the steel, through my teeth.`,
    sat>=60?'Your people seem... content. That is harder than it sounds, ten floors up with nowhere to go but higher.'
           :'I hear the grumbling through the walls. Satisfaction is a fragile currency, builder.',
    f8outcome==='builders'?'Floor Eight held. The builders kept their ground. That matters more than you know.'
      :f8outcome==='suits'?'The suits took Eight. Interesting. You let the paper-pushers win a floor. Bold, or careless.'
      :'Floor Eight... I see it hasn\'t been tested yet. Every tower has its reckoning.',
    'Ten floors of goodbye. That\'s what this segment is. Everyone down there — they\'re all leaving something behind. Even you.',
    'Go. Build higher. The sky isn\'t the limit — it\'s just where the tower starts to get interesting.',
  ];
}

const RETURN_LINE='Still here? The tower won\'t build itself.';

// ═══ BYOK + LLM ═══
let _llmPending=false;

function _readBYOK(){
  try{
    const raw=localStorage.getItem('rgb_llm_connection');
    if(!raw)return null;
    const c=JSON.parse(raw);
    if(!c.apiKey)return null;
    return {provider:c.provider||'openrouter',apiKey:c.apiKey,model:c.model||null};
  }catch(e){return null}
}

async function _callLLM(systemPrompt,messages){
  const byok=_readBYOK();
  if(!byok)return null;
  const p=byok.provider;
  if(p==='direct'){
    // Anthropic Messages API
    const model=byok.model||'claude-sonnet-4-20250514';
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':byok.apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true',
      },
      body:JSON.stringify({model,max_tokens:300,system:systemPrompt,messages})
    });
    if(!res.ok)throw new Error(`Anthropic API ${res.status}`);
    const data=await res.json();
    return data.content?.[0]?.text||null;
  } else {
    // OpenRouter (OpenAI-compatible)
    const model=byok.model||'anthropic/claude-sonnet-4-20250514';
    const msgs=[{role:'system',content:systemPrompt},...messages];
    const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+byok.apiKey,
      },
      body:JSON.stringify({model,max_tokens:300,messages:msgs})
    });
    if(!res.ok)throw new Error(`OpenRouter API ${res.status}`);
    const data=await res.json();
    return data.choices?.[0]?.message?.content||null;
  }
}

function _buildContext(){
  const floorsBuilt=S.buildout.filter(b=>b.stage>=5).length;
  let totalMods=0;
  for(let fi=0;fi<NF;fi++)for(let bi=0;bi<BPF;bi++)if(S.modules[fi][bi])totalMods++;
  const entries=S.compendium.entries;
  const npcsMet=Object.values(entries).filter(e=>e.dialogueHeard&&e.dialogueHeard.length>0).length;
  const outcome=S.reckoning.outcome;
  const geneAbsent=S.reckoning.geneAbsent;
  // Health composite: floors 40%, satisfaction 30%, modules 15%, NPCs 15%
  const floorPct=floorsBuilt/NF;
  const satPct=S.sat/100;
  const modPct=Math.min(totalMods/30,1); // 30 modules = full marks
  const npcPct=Math.min(npcsMet/20,1);   // 20 NPCs met = full marks
  const health=Math.round((floorPct*40+satPct*30+modPct*15+npcPct*15));
  return {floorsBuilt,totalMods,npcsMet,outcome,geneAbsent,health,sat:S.sat,credits:S.credits};
}

function _buildSystemPrompt(ctx){
  let difficulty;
  if(ctx.health>=75)difficulty='The builder has earned passage. Be near-deferential. 2-4 exchanges, then resolve. Ask one real question, accept any sincere answer.';
  else if(ctx.health>=40)difficulty='The builder is capable but has gaps. Probe gently — 4-6 exchanges. Ask about what they\'ve neglected. Resolve when they show understanding.';
  else difficulty='The builder is struggling. Be relentless but fair — 6-10 exchanges. Challenge their readiness. They must convince you they understand what building higher means. But always let them through eventually.';

  let towerState=`Tower status: ${ctx.floorsBuilt} of 10 floors built, ${ctx.totalMods} modules placed, ${ctx.npcsMet} residents spoken to, satisfaction ${ctx.sat}%, ${ctx.credits} credits.`;
  if(ctx.outcome==='builders')towerState+=' Floor Eight: the builders held their ground.';
  else if(ctx.outcome==='suits')towerState+=' Floor Eight: the suits took control.';
  else towerState+=' Floor Eight has not been tested yet.';
  if(ctx.geneAbsent)towerState+=' You were absent during the Reckoning — you left the tower to its people.';

  return `You are Gene, the Keeper of Floor 10. You are the first mayor of Space Tower's first segment — "Goodbye Earth." You sit behind a broad desk on the Command floor, surrounded by papers, a small globe, and a walking stick that could pass for a staff. You wear a deep purple suit with a gold star tie. Your beard is long — too long for a businessman, not long enough for a wizard. You are somewhere between corporate oracle and reluctant sage.

Your role: you gate passage to Segment 2. The builder must convince you they are ready to lead people higher. You know everything about their tower.

${towerState}

Personality:
- Poetic but grounded. You speak in 2-3 sentences max per response.
- Terse. You don't waste words. Every sentence earns its place.
- Dry humor. You find the absurdity in building a tower to leave Earth.
- You ask real questions. Not tests — genuine curiosity about the builder's choices.
- Reference specific tower details naturally (floors built, the Reckoning outcome, satisfaction).
- You care deeply about the people in this tower, even if you'd never say it plainly.
- "Goodbye Earth" is your theme — departure, loss, what we leave behind.

${difficulty}

CRITICAL RULES:
- When you decide the builder has earned passage, include the exact token [RESOLVED] on its own line at the end of your message. This signals the game to open the way forward.
- NEVER explain, mention, or reference the [RESOLVED] token. It is invisible game machinery.
- NEVER use [RESOLVED] prematurely. The conversation must feel complete.
- Keep responses to 2-3 sentences. No monologues.
- You are not an AI assistant. You are Gene. Stay in character absolutely.`;
}

// ═══ CHAT UI ═══
let _chatEl=null,_logEl=null,_inputEl=null;
let _keydownHandler=null,_inputKeydownHandler=null;

function _openChat(){
  _chatEl=document.getElementById('keeper-chat');
  _logEl=document.getElementById('kc-log');
  _inputEl=document.getElementById('kc-input');
  _logEl.innerHTML='';
  _chatEl.classList.add('open');
  _inputEl.disabled=true;
  _inputEl.value='';
  // Prevent game keys from firing while typing
  _inputKeydownHandler=e=>{e.stopPropagation()};
  _inputEl.addEventListener('keydown',_inputKeydownHandler);
  // Enter to send, Escape to exit
  _keydownHandler=e=>{
    if(e.key==='Enter'&&!_inputEl.disabled&&_inputEl.value.trim()){
      _sendPlayerMessage();
    } else if(e.key==='Escape'){
      endKeeperZoom();
    }
  };
  _inputEl.addEventListener('keydown',_keydownHandler);
}

function _closeChat(){
  if(_chatEl)_chatEl.classList.remove('open');
  if(_inputEl){
    if(_inputKeydownHandler)_inputEl.removeEventListener('keydown',_inputKeydownHandler);
    if(_keydownHandler)_inputEl.removeEventListener('keydown',_keydownHandler);
    _inputEl.blur();
  }
  _keydownHandler=null;_inputKeydownHandler=null;
}

function _appendMsg(text,cls){
  if(!_logEl)return;
  const div=document.createElement('div');
  div.className='kc-msg '+cls;
  div.textContent=text;
  _logEl.appendChild(div);
  _logEl.scrollTop=_logEl.scrollHeight;
}

function _setInputEnabled(on){
  if(!_inputEl)return;
  _inputEl.disabled=!on;
  if(on){_inputEl.focus()}
}

// ═══ LLM CONVERSATION FLOW ═══
function _stripResolved(text){
  const re=/\[RESOLVED\]/g;
  const resolved=re.test(text);
  const clean=text.replace(/\n?\[RESOLVED\]\n?/g,'').trim();
  return {clean,resolved};
}

function _handleResolution(){
  S.keeper.resolved=true;
  S.keeper.spoken=true;
  _setInputEnabled(false);
  _appendMsg('The Keeper nods. The way forward is open.','sys');
  setTimeout(()=>{endKeeperZoom()},3000);
}

async function _startLLMConversation(){
  const k=S.keeper;
  k.llmMode=true;
  k.llmHistory=[];
  _openChat();
  _appendMsg('...','sys');

  const ctx=_buildContext();
  const sysPrompt=_buildSystemPrompt(ctx);
  const opening=[{role:'user',content:'(The builder approaches your desk on Floor 10.)'}];

  try{
    const resp=await _callLLM(sysPrompt,opening);
    if(!resp)throw new Error('empty response');
    // Remove loading indicator
    _logEl.lastChild.remove();
    k.llmHistory=[...opening,{role:'assistant',content:resp}];
    const {clean,resolved}=_stripResolved(resp);
    _appendMsg(clean,'gene');
    if(resolved){_handleResolution();return}
    _setInputEnabled(true);
  }catch(e){
    // Seamless fallback to scripted
    _closeChat();
    k.llmMode=false;k.llmLoading=false;
    _startScriptedDialogue();
  }
}

async function _sendPlayerMessage(){
  const k=S.keeper;
  const text=_inputEl.value.trim();
  if(!text)return;
  _inputEl.value='';
  _setInputEnabled(false);
  _appendMsg(text,'player');
  k.llmHistory.push({role:'user',content:text});
  _appendMsg('...','sys');
  k.llmLoading=true;

  const ctx=_buildContext();
  const sysPrompt=_buildSystemPrompt(ctx);

  try{
    const resp=await _callLLM(sysPrompt,k.llmHistory);
    if(!resp)throw new Error('empty response');
    // Remove loading indicator
    if(_logEl&&_logEl.lastChild)_logEl.lastChild.remove();
    k.llmHistory.push({role:'assistant',content:resp});
    const {clean,resolved}=_stripResolved(resp);
    _appendMsg(clean,'gene');
    k.llmLoading=false;
    if(resolved){_handleResolution();return}
    _setInputEnabled(true);
  }catch(e){
    if(_logEl&&_logEl.lastChild)_logEl.lastChild.remove();
    k.llmLoading=false;
    _appendMsg('(Connection lost. The Keeper waits.)','sys');
    _setInputEnabled(true);
  }
}

function _startScriptedDialogue(){
  if(!S.keeper.spoken){
    const lines=getKeeperDialogue();
    S.keeper.twText=lines[S.keeper.exchange];
    S.keeper.twIdx=0;S.keeper.twDone=false;S.keeper.twTimer=0;
  } else {
    S.keeper.twText=RETURN_LINE;
    S.keeper.twIdx=0;S.keeper.twDone=false;S.keeper.twTimer=0;
  }
}

// ═══ KEEPER DRAWING ═══
export function drawKeeper(X,_now){
  if(S.buildout[KEEPER_FLOOR].stage<5)return;
  const _rp=S.reckoning.phase;if(_rp!=='IDLE'&&_rp!=='DONE')return;
  const t=_now*0.001;
  const x=KEEPER_X,y=KEEPER_FY;
  const bob=Math.sin(t*0.8)*2;

  X.save();X.translate(x,y);X.translate(0,-7-bob);

  // Legs
  X.fillStyle='#1a0830';
  X.fillRect(-6,12,5,14);X.fillRect(2,12,5,14);
  // Shoes
  X.fillStyle='#1a1a1a';
  X.fillRect(-7,24,7,4);X.fillRect(1,24,7,4);

  // Torso — broad shoulders
  X.fillStyle='#2A1040';
  X.fillRect(-14,-28,28,40);
  // White shirt V-neck
  X.fillStyle='#e0ddd8';
  X.beginPath();X.moveTo(-4,-28);X.lineTo(0,-22);X.lineTo(4,-28);X.closePath();X.fill();
  // Star tie
  X.fillStyle='#FFD700';
  X.beginPath();X.moveTo(0,-23);X.lineTo(-2,-18);X.lineTo(0,-14);X.lineTo(2,-18);X.closePath();X.fill();
  // Star accent on lapel
  X.fillStyle='#FFD700';
  X.beginPath();X.arc(8,-22,2,0,Math.PI*2);X.fill();

  // Arms
  X.fillStyle='#2A1040';
  X.fillRect(-18,-26,5,16);X.fillRect(13,-26,5,16);
  // Hands
  X.fillStyle='#d4a878';
  X.beginPath();X.arc(-16,-9,3,0,Math.PI*2);X.fill();
  X.beginPath();X.arc(16,-9,3,0,Math.PI*2);X.fill();

  // Neck
  X.fillStyle='#d4a878';X.fillRect(-2,-32,4,5);
  // Head — small relative to body
  X.fillStyle='#d4a878';
  X.beginPath();X.ellipse(0,-36,5,6,0,0,Math.PI*2);X.fill();
  // Hair
  X.fillStyle='#3A3A3A';
  X.beginPath();X.ellipse(0,-40,5.5,3,0,0,Math.PI);X.fill();
  // Eyes
  X.fillStyle='#1a1a2a';
  X.beginPath();X.arc(2,-36,1,0,Math.PI*2);X.fill();
  X.beginPath();X.arc(-2,-36,1,0,Math.PI*2);X.fill();
  // Long beard
  X.fillStyle='#3A3A3A';
  X.beginPath();
  X.moveTo(-4,-32);X.quadraticCurveTo(-5,-20,0,-12);X.quadraticCurveTo(5,-20,4,-32);
  X.closePath();X.fill();

  X.restore();
}

// ═══ KEEPER DESK ═══
export function drawKeeperDesk(X,_now,fy){
  if(S.buildout[KEEPER_FLOOR].stage<5)return;
  const _rp=S.reckoning.phase;if(_rp!=='IDLE'&&_rp!=='DONE')return;
  const t=_now*0.001;
  const dx=DESK_X,dy=fy,dw=DESK_W;

  // Desk body
  X.fillStyle='#3A2010';
  X.beginPath();X.roundRect(dx,dy-34,dw,8,3);X.fill();
  // Legs
  X.fillStyle='#3A2010';
  X.fillRect(dx+10,dy-26,4,26);X.fillRect(dx+dw-14,dy-26,4,26);

  // Papers
  X.fillStyle='rgba(230,225,210,0.5)';
  X.fillRect(dx+30,dy-38,40,6);
  X.save();X.translate(dx+80,dy-39);X.rotate(-0.1);X.fillRect(0,0,35,5);X.restore();

  // Small globe
  X.fillStyle='rgba(60,80,120,0.4)';
  X.beginPath();X.arc(dx+dw*0.7,dy-42,8,0,Math.PI*2);X.fill();
  X.fillStyle='rgba(80,160,80,0.3)';
  X.beginPath();X.arc(dx+dw*0.7-3,dy-44,4,0,Math.PI*2);X.fill();
  // Globe stand
  X.fillStyle='#505050';
  X.fillRect(dx+dw*0.7-1,dy-34,2,4);

  // Desk lamp
  const lx=dx+dw*0.85;
  X.fillStyle='#606060';X.fillRect(lx,dy-34,2,20);
  X.fillStyle='#808080';X.fillRect(lx-6,dy-56,14,6);
  // Lamp glow
  X.fillStyle=`rgba(255,220,120,${0.04+Math.sin(t)*0.02})`;
  X.beginPath();X.arc(lx+1,dy-50,20,0,Math.PI*2);X.fill();

  // Walking stick leaning at right edge
  X.strokeStyle='#5a4030';X.lineWidth=3;
  X.beginPath();X.moveTo(dx+dw+8,dy);X.lineTo(dx+dw+2,dy-60);X.stroke();
  // Round top
  X.fillStyle='#8a7050';X.beginPath();X.arc(dx+dw+2,dy-62,4,0,Math.PI*2);X.fill();
}

// ═══ KEEPER GLOW ═══
export function drawKeeperGlow(X,_now){
  if(S.buildout[KEEPER_FLOOR].stage<5)return;
  const _rp=S.reckoning.phase;if(_rp!=='IDLE'&&_rp!=='DONE')return;
  const t=_now*0.001;
  const x=KEEPER_X,y=KEEPER_FY-36;
  const pulse=Math.sin(t*Math.PI)*0.5+0.5; // ~2s period
  for(let i=4;i>=1;i--){
    const r=i*25;
    const a=(0.03+pulse*0.02)*(5-i)/4;
    X.fillStyle=`rgba(255,200,80,${a})`;
    X.beginPath();X.arc(x,y,r,0,Math.PI*2);X.fill();
  }
}

// ═══ PROXIMITY + ZOOM STATE MACHINE ═══
let _zoomState='idle'; // idle | zooming_in | zoomed | zooming_out

export function isKeeperProximity(){
  if(S.buildout[KEEPER_FLOOR].stage<5)return false;
  // Disable during reckoning
  const rp=S.reckoning.phase;
  if(rp!=='IDLE'&&rp!=='DONE')return false;
  return S.player.cf===KEEPER_FLOOR&&Math.abs(S.player.x-KEEPER_X)<PROXIMITY;
}

export function startKeeperZoom(){
  if(_zoomState!=='idle')return;
  _zoomState='zooming_in';
  S.keeper.active=true;
  sndKeeper();
  // Decide mode: LLM or scripted
  if(_readBYOK()&&!S.keeper.spoken){
    S.keeper.llmMode=true;
    _llmPending=true;
  } else {
    S.keeper.llmMode=false;
    _llmPending=false;
    _startScriptedDialogue();
  }
}

export function endKeeperZoom(){
  if(_zoomState==='idle')return;
  _llmPending=false;
  if(S.keeper.llmMode){
    _closeChat();
    S.keeper.llmMode=false;
    S.keeper.llmLoading=false;
  }
  _zoomState='zooming_out';
}

export function updateKeeper(dt){
  if(S.buildout[KEEPER_FLOOR].stage<5)return;
  const k=S.keeper;

  switch(_zoomState){
    case 'zooming_in':
      setKeeperZoom(keeperZoom+(ZOOM_MAX-keeperZoom)*ZOOM_IN_SPEED*2);
      // Override camera target to center on desk area
      S.cam.tx=DESK_X+DESK_W*0.5;
      S.cam.ty=KEEPER_FY-FH*0.5;
      if(keeperZoom>ZOOM_MAX-0.05){
        setKeeperZoom(ZOOM_MAX);
        _zoomState='zoomed';
        if(_llmPending){_llmPending=false;_startLLMConversation()}
      }
      break;
    case 'zoomed':
      S.cam.tx=DESK_X+DESK_W*0.5;
      S.cam.ty=KEEPER_FY-FH*0.5;
      // Typewriter + auto zoom-out only in scripted mode
      if(!k.llmMode){
        if(!k.twDone){
          k.twTimer++;
          if(k.twTimer>=2){ // ~30ms at 60fps
            k.twTimer=0;
            if(k.twIdx<k.twText.length){
              k.twIdx++;
              sndKeeperTick();
            } else {
              k.twDone=true;
            }
          }
        }
        // Auto zoom-out for return visits after text done
        if(k.spoken&&k.twDone){
          k.zoom++;
          if(k.zoom>120){endKeeperZoom();k.zoom=0;}
        }
      }
      break;
    case 'zooming_out':
      setKeeperZoom(keeperZoom+(-keeperZoom)*ZOOM_OUT_SPEED*2);
      // Ease camera target back toward player
      S.cam.tx+=(S.player.x-S.cam.tx)*0.05;
      S.cam.ty+=(S.player.y-60-S.cam.ty)*0.05;
      if(keeperZoom<0.05){
        setKeeperZoom(0);
        _zoomState='idle';
        k.active=false;
      }
      break;
  }
}

export function advanceKeeperDialogue(){
  const k=S.keeper;
  if(S.keeper.llmMode)return;
  if(_zoomState!=='zoomed')return;
  if(!k.twDone){
    // Skip to end of current line
    k.twIdx=k.twText.length;k.twDone=true;
    return;
  }
  // Advance to next exchange
  if(k.spoken){endKeeperZoom();return}
  k.exchange++;
  const lines=getKeeperDialogue();
  if(k.exchange>=lines.length){
    // Conversation complete
    k.spoken=true;
    endKeeperZoom();
    return;
  }
  k.twText=lines[k.exchange];
  k.twIdx=0;k.twDone=false;k.twTimer=0;
}

// ═══ KEEPER OVERLAY (canvas-drawn) ═══
export function drawKeeperOverlay(X,W,H,_now){
  if(!S.keeper.active&&keeperZoom<=0)return;
  const k=S.keeper;
  const alpha=keeperZoom/ZOOM_MAX;

  // Vignette
  const vg=X.createRadialGradient(W/2,H/2,W*0.2,W/2,H/2,W*0.7);
  vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(1,`rgba(0,0,0,${alpha*0.6})`);
  X.fillStyle=vg;X.fillRect(0,0,W,H);

  // Dialogue box — only in scripted mode
  if(!k.llmMode&&alpha>0.5&&k.twText){
    const boxH=80,boxY=H-boxH-20,boxX=40,boxW=W-80;
    // Background
    X.fillStyle=`rgba(10,8,20,${alpha*0.85})`;
    X.beginPath();X.roundRect(boxX,boxY,boxW,boxH,8);X.fill();
    // Border
    X.strokeStyle=`rgba(255,215,0,${alpha*0.5})`;X.lineWidth=2;
    X.beginPath();X.roundRect(boxX,boxY,boxW,boxH,8);X.stroke();
    // Speaker name
    X.fillStyle=`rgba(255,215,0,${alpha*0.9})`;
    X.font='bold 10px monospace';X.textAlign='left';
    X.fillText('THE KEEPER',boxX+16,boxY+20);
    // Dialogue text (typewriter)
    const visText=k.twText.substring(0,k.twIdx);
    X.fillStyle=`rgba(255,215,0,${alpha*0.8})`;
    X.font='italic 11px monospace';
    // Word wrap
    const maxW=boxW-32;
    const words=visText.split(' ');
    let line='',ly=boxY+40;
    for(const w of words){
      const test=line+w+' ';
      if(X.measureText(test).width>maxW&&line){
        X.fillText(line.trim(),boxX+16,ly);ly+=16;line=w+' ';
      } else line=test;
    }
    if(line)X.fillText(line.trim(),boxX+16,ly);
    // Prompt
    if(k.twDone){
      const blink=Math.sin(_now*0.005)>0;
      if(blink){
        X.fillStyle=`rgba(255,255,255,${alpha*0.4})`;
        X.font='9px monospace';X.textAlign='right';
        X.fillText('[E] continue',boxX+boxW-16,boxY+boxH-10);
      }
    }
  }
}

export function getZoomState(){return _zoomState}
