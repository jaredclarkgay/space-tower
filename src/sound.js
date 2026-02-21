'use strict';

// ═══ SOUND ENGINE ═══
let audioCtx=null,masterGain=null;
export let soundOn=true;
const SOUND_KEY='spacetower_sound';
try{soundOn=localStorage.getItem(SOUND_KEY)!=='off'}catch(e){}

function initAudio(){
  if(audioCtx)return;
  audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  masterGain=audioCtx.createGain();masterGain.gain.value=soundOn?0.35:0;masterGain.connect(audioCtx.destination);
}
export function toggleSound(){
  soundOn=!soundOn;
  try{localStorage.setItem(SOUND_KEY,soundOn?'on':'off')}catch(e){}
  if(masterGain)masterGain.gain.setTargetAtTime(soundOn?0.35:0,audioCtx.currentTime,0.05);
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

// Ambient drone — altitude-aware, continuous
let ambOsc1=null,ambOsc2=null,ambGain=null,ambFilt=null;
function startAmbient(){
  if(!audioCtx||ambOsc1)return;
  ambGain=audioCtx.createGain();ambGain.gain.value=0;
  ambFilt=audioCtx.createBiquadFilter();ambFilt.type='lowpass';ambFilt.frequency.value=300;
  ambOsc1=audioCtx.createOscillator();ambOsc1.type='sine';ambOsc1.frequency.value=55;
  ambOsc2=audioCtx.createOscillator();ambOsc2.type='sine';ambOsc2.frequency.value=82.5;
  const g2=audioCtx.createGain();g2.gain.value=0.4;
  ambOsc1.connect(ambGain);ambOsc2.connect(g2);g2.connect(ambGain);
  ambGain.connect(ambFilt);ambFilt.connect(masterGain);
  ambOsc1.start();ambOsc2.start();
  ambGain.gain.setTargetAtTime(0.15,audioCtx.currentTime,2);
}
export function updateAmbient(altFrac2){
  if(!ambOsc1||!audioCtx)return;
  const t=audioCtx.currentTime;
  ambOsc1.frequency.setTargetAtTime(55+altFrac2*20,t,0.5);
  ambOsc2.frequency.setTargetAtTime(82.5+altFrac2*15,t,0.5);
  ambFilt.frequency.setTargetAtTime(300+altFrac2*600,t,0.5);
  ambGain.gain.setTargetAtTime(0.1+altFrac2*0.12,t,0.5);
}
// First interaction triggers AudioContext (browser policy)
export function ensureAudio(){if(!audioCtx){initAudio();startAmbient()}}
