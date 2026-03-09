'use strict';
import { setMuted as setMusicMuted } from './music.js';

// ═══ SOUND ENGINE ═══
let audioCtx=null,masterGain=null;
export let soundOn=true;
const SOUND_KEY='spacetower_sound';
try{soundOn=localStorage.getItem(SOUND_KEY)!=='off'}catch(e){}

// Create/resume the single shared AudioContext (no masterGain, no ambient)
export function ensureAudioCtx(){
  if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
}
function initAudio(){
  ensureAudioCtx();
  if(masterGain)return;
  masterGain=audioCtx.createGain();masterGain.gain.value=soundOn?0.35:0;masterGain.connect(audioCtx.destination);
}
export function toggleSound(){
  soundOn=!soundOn;
  try{localStorage.setItem(SOUND_KEY,soundOn?'on':'off')}catch(e){}
  if(masterGain)masterGain.gain.setTargetAtTime(soundOn?0.35:0,audioCtx.currentTime,0.05);
  setMusicMuted(!soundOn);
  document.getElementById('snd-btn').textContent=soundOn?'🔊':'🔇';
}
// Playable tones
function playTone(freq,dur,type,vol,delay){
  if(!audioCtx)return;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=type||'sine';o.frequency.value=freq;
  g.gain.value=0;g.connect(masterGain);o.connect(g);
  const t=audioCtx.currentTime+(delay||0);
  g.gain.setTargetAtTime((vol||0.3)*0.5,t,0.01);
  g.gain.setTargetAtTime(0,t+dur*0.7,dur*0.3);
  o.start(t);o.stop(t+dur+0.1);
}
function playNoise(dur,vol){
  if(!audioCtx)return;
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*dur,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.3;
  const n=audioCtx.createBufferSource(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
  n.buffer=buf;f.type='lowpass';f.frequency.value=800;
  g.gain.value=(vol||0.1)*0.4;g.gain.setTargetAtTime(0,audioCtx.currentTime+dur*0.5,dur*0.4);
  n.connect(f);f.connect(g);g.connect(masterGain);n.start();n.stop(audioCtx.currentTime+dur+0.1);
}
// Sound presets
export function sndPlace(){playTone(520,0.08,'square',0.25);playTone(680,0.08,'square',0.2,0.06)}
export function sndSell(){playTone(440,0.06,'sawtooth',0.15);playTone(340,0.1,'sawtooth',0.12,0.05)}
export function sndFund(){playTone(440,0.12,'sine',0.3);playTone(554,0.12,'sine',0.25,0.1);playTone(660,0.15,'sine',0.3,0.2)}
export function sndTalk(){const f=280+Math.random()*180;playTone(f,0.04,'triangle',0.12);playTone(f*1.1,0.04,'triangle',0.1,0.03)}
export function sndStep(){playNoise(0.05,0.04)}
export function sndIncome(){playTone(880,0.05,'sine',0.1);playTone(1100,0.06,'sine',0.08,0.04)}
export function sndWarn(){playTone(220,0.15,'sawtooth',0.15);playTone(180,0.2,'sawtooth',0.12,0.12)}
export function sndElev(){playTone(880,0.12,'sine',0.2);playTone(1100,0.15,'sine',0.15,0.1)}
export function sndBuild(){playTone(330,0.1,'triangle',0.25);playTone(440,0.1,'triangle',0.2,0.08);playTone(550,0.12,'triangle',0.25,0.16);playNoise(0.08,0.06)}
export function sndTile(idx){const f=360+idx*35;playTone(f,0.06,'triangle',0.07);playNoise(0.02,0.02)}
// Activation sounds — unique per-floor character
export function sndWhoosh(){playNoise(0.2,0.12);playTone(200,0.25,'sine',0.1);playTone(400,0.15,'sine',0.06,0.1)}
export function sndChime(){playTone(660,0.2,'sine',0.2);playTone(880,0.15,'sine',0.15,0.12);playTone(1100,0.25,'sine',0.2,0.24)}
export function sndBoom(){playNoise(0.15,0.2);playTone(80,0.3,'sine',0.3);playTone(60,0.4,'sine',0.2,0.1)}
export function sndGrow(){playTone(220,0.15,'triangle',0.15);playTone(330,0.2,'sine',0.12,0.1);playTone(440,0.15,'sine',0.1,0.25)}
export function sndData(){playTone(800,0.04,'square',0.1);playTone(1000,0.04,'square',0.08,0.05);playTone(1200,0.04,'square',0.08,0.1);playTone(900,0.04,'square',0.06,0.15);playTone(1100,0.06,'square',0.1,0.2)}
export function sndAwe(){playTone(220,0.5,'sine',0.2);playTone(330,0.5,'sine',0.15,0.2);playTone(440,0.6,'sine',0.2,0.4);playTone(550,0.8,'sine',0.15,0.6)}

// Floor 8 sounds
export function sndSlam(){playNoise(0.08,0.15);playTone(180,0.1,'square',0.2);playTone(120,0.15,'square',0.15,0.05)}
export function sndTick(){playTone(1000,0.03,'sine',0.15)}
export function sndVictory(){playTone(440,0.15,'sine',0.25);playTone(554,0.15,'sine',0.2,0.12);playTone(660,0.15,'sine',0.25,0.24);playTone(880,0.3,'sine',0.3,0.36)}
export function sndDefeat(){playTone(440,0.2,'sawtooth',0.15);playTone(370,0.25,'sawtooth',0.12,0.15);playTone(330,0.35,'sawtooth',0.1,0.3)}
export function sndBell(){playTone(800,0.3,'sine',0.2);playTone(1200,0.2,'sine',0.15,0.05)}
export function sndReckoningClaim(){playTone(400,0.06,'triangle',0.15);playTone(520,0.08,'triangle',0.12,0.04);playTone(120,0.08,'square',0.14,0.02)}
export function sndRumble(){
  if(!audioCtx)return;
  const t=audioCtx.currentTime;
  // Layer 1: sub-bass sweep 80→40Hz
  const o1=audioCtx.createOscillator(),g1=audioCtx.createGain();
  o1.type='sine';o1.frequency.setValueAtTime(80,t);o1.frequency.exponentialRampToValueAtTime(40,t+0.4);
  g1.gain.setValueAtTime(0,t);g1.gain.linearRampToValueAtTime(0.15,t+0.03);g1.gain.setTargetAtTime(0,t+0.25,0.12);
  o1.connect(g1);g1.connect(masterGain);o1.start(t);o1.stop(t+0.5);
  // Layer 2: harmonic at 60Hz, slightly detuned
  const o2=audioCtx.createOscillator(),g2=audioCtx.createGain();
  o2.type='sine';o2.frequency.value=62;o2.detune.value=-8;
  g2.gain.setValueAtTime(0,t);g2.gain.linearRampToValueAtTime(0.1,t+0.02);g2.gain.setTargetAtTime(0,t+0.2,0.15);
  o2.connect(g2);g2.connect(masterGain);o2.start(t);o2.stop(t+0.5);
  // Layer 3: filtered noise burst with frequency sweep
  const dur=0.3,buf=audioCtx.createBuffer(1,audioCtx.sampleRate*dur,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.4;
  const n=audioCtx.createBufferSource(),gn=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
  n.buffer=buf;f.type='lowpass';f.frequency.setValueAtTime(600,t);f.frequency.exponentialRampToValueAtTime(80,t+0.25);f.Q.value=2;
  gn.gain.setValueAtTime(0.06,t);gn.gain.setTargetAtTime(0,t+0.1,0.08);
  n.connect(f);f.connect(gn);gn.connect(masterGain);n.start(t);n.stop(t+dur+0.1);
}
export function sndClaimTick(p){const f=200+p*400;playTone(f,0.03,'triangle',0.08+p*0.06)}
export function sndSuitClaim(){playTone(1200,0.01,'square',0.12);playNoise(0.02,0.1)}
export function sndReckoningWave(){playTone(330,0.1,'sine',0.2);playTone(440,0.1,'sine',0.18,0.08);playTone(550,0.12,'sine',0.2,0.16);playNoise(0.06,0.08)}
// Control room sounds
export function sndCrAlarm(){playTone(440,0.15,'square',0.2);playTone(880,0.15,'square',0.18,0.15);playTone(440,0.15,'square',0.15,0.3);playTone(880,0.15,'square',0.12,0.45)}
export function sndCrChunk(){playNoise(0.06,0.12);playTone(180,0.08,'triangle',0.15);playTone(120,0.1,'triangle',0.12,0.03)}
export function sndCrThud(){playNoise(0.08,0.1);playTone(100,0.12,'sine',0.15)}
// Keeper sounds
export function sndKeeper(){playTone(110,0.4,'sine',0.2);playTone(165,0.3,'sine',0.15,0.15);playTone(220,0.5,'sine',0.2,0.3)}
export function sndKeeperTick(){playTone(300+Math.random()*100,0.02,'triangle',0.05)}
// RGB door ambient hum
let _doorOsc=null,_doorGain=null;
export function sndDoorHumStart(){
  if(!audioCtx||_doorOsc)return;
  _doorOsc=audioCtx.createOscillator();_doorGain=audioCtx.createGain();
  _doorOsc.type='sine';_doorOsc.frequency.value=80;
  _doorGain.gain.value=0;_doorGain.connect(masterGain);_doorOsc.connect(_doorGain);
  _doorOsc.start();_doorGain.gain.setTargetAtTime(0.06,audioCtx.currentTime,0.5);
}
export function sndDoorHumStop(){
  if(!_doorGain||!_doorOsc)return;
  _doorGain.gain.setTargetAtTime(0,audioCtx.currentTime,0.3);
  const o=_doorOsc;setTimeout(()=>{try{o.stop()}catch(e){}},1000);
  _doorOsc=null;_doorGain=null;
}

// Bulldozer engine rumble
let _dozerOsc=null,_dozerGain=null;
export function sndDozerStart(){
  if(!audioCtx||_dozerOsc)return;
  _dozerOsc=audioCtx.createOscillator();_dozerGain=audioCtx.createGain();
  _dozerOsc.type='sawtooth';_dozerOsc.frequency.value=80;
  _dozerGain.gain.value=0;_dozerGain.connect(masterGain);_dozerOsc.connect(_dozerGain);
  _dozerOsc.start();_dozerGain.gain.setTargetAtTime(0.08,audioCtx.currentTime,0.3);
}
export function sndDozerStop(){
  if(!_dozerGain||!_dozerOsc)return;
  _dozerGain.gain.setTargetAtTime(0,audioCtx.currentTime,0.2);
  const o=_dozerOsc;setTimeout(()=>{try{o.stop()}catch(e){}},800);
  _dozerOsc=null;_dozerGain=null;
}
export function sndDozerUpdate(speed){
  if(!_dozerOsc||!audioCtx)return;
  const t=audioCtx.currentTime;
  _dozerOsc.frequency.setTargetAtTime(70+Math.abs(speed)*3,t,0.1);
  _dozerGain.gain.setTargetAtTime(0.05+Math.abs(speed)*0.005,t,0.1);
}

// Ambient drone — altitude-aware, continuous
let ambOsc1=null,ambOsc2=null,ambGain=null,ambFilt=null;
export function updateAmbient(altFrac2){
  if(!ambOsc1||!audioCtx)return;
  const t=audioCtx.currentTime;
  ambOsc1.frequency.setTargetAtTime(55+altFrac2*20,t,0.5);
  ambOsc2.frequency.setTargetAtTime(82.5+altFrac2*15,t,0.5);
  ambFilt.frequency.setTargetAtTime(300+altFrac2*600,t,0.5);
  ambGain.gain.setTargetAtTime(0.1+altFrac2*0.12,t,0.5);
}
// First interaction triggers AudioContext + masterGain + ambient
export function ensureAudio(){initAudio()}
export function getAudioCtx(){return audioCtx}
