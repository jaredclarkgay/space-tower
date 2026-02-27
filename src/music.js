'use strict';
import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

// ── MIDI track manifest ──
const MIDI_FILES = [
  '12 Days Of Christmas.mid',
  '2001 A Space Oddysey.mid',
  'A Thousand Miles.mid',
  'A Thousand Years.mid',
  'Addams Family.mid',
  'All I Want For Christmas Is You.mid',
  'American Idiot.mid',
  'Another Brick In The Wall.mid',
  'Axel F.mid',
  'B.Y.O.B..mid',
  'Baby.mid',
  'Back In Black.mid',
  'Back To The Future - Main Theme.mid',
  'Bad Moon Rising.mid',
  'Bad Romance.mid',
  'Bamboleo.mid',
  'Beat It.mid',
  'Beautiful Girls.mid',
  'Because Of You.mid',
  'Billie Jean.mid',
  'Black Magic Woman.mid',
  'Bohemian Rhapsody.mid',
  'Boulevard of Broken Dreams.mid',
  'Bring Me To Life.mid',
  'C.S.I - Criminal Scene Investigation.mid',
  'Californication.mid',
  'Can You Feel The Love Tonight.mid',
  'Candy Shop.mid',
  'Chasing Cars.mid',
  'Chiquitita.mid',
  'Chop Suey.mid',
  'Cliffs Of Dover.mid',
  'Clocks.mid',
  'Complicated.mid',
  'Concerning Hobbits.mid',
  'Dancing Queen.mid',
  "Don't Cha.mid",
  "Don't Matter.mid",
  "Don't Phunk With My Heart.mid",
  'Earth Song.mid',
  'Enter Sandman.mid',
  'Everything I Do.mid',
  'Everytime We Touch.mid',
  'Family Guy.mid',
  'Feel Good Inc.mid',
  'Feeling Good.mid',
  'Final Countdown.mid',
  'Fireflies.mid',
  'Firework.mid',
  'Fix You.mid',
  'Fresh Prince Of Bel Air.mid',
  'Friends.mid',
  'Gangnam Style.mid',
  'Girlfriend.mid',
  'Gladiator.mid',
  'Godfather.mid',
  'Grenade.mid',
  'Hail To The Chief.mid',
  'Hallelujah.mid',
  'Happy Birthday.mid',
  'Harry Potter.mid',
  'Heal The World.mid',
  'Here Without You.mid',
  'Hes a Pirate.mid',
  'Hey Jude.mid',
  'Hips Dont Lie.mid',
  'Home.mid',
  'Hot N Cold.mid',
  'Hotel California.mid',
  'How You Remind Me.mid',
  'I Got A Feeling.mid',
  'I Kissed A Girl.mid',
  'I Walk The Line.mid',
  "If I Ain't Got You.mid",
  'If I Were A Boy.mid',
  'Im Yours.mid',
  'Imagine.mid',
  'In Da Club.mid',
  'In The End (2).mid',
  'In The End (3).mid',
  'Indiana Jones.mid',
  "It's My Life.mid",
  'James Bond.mid',
  'Just Dance.mid',
  'Just The Way You Are.mid',
  'Just The Way you Are.with Lyric.mid',
  'Knocking On Heavens Door.mid',
  'Lets Get It Started.mid',
  'Lonely.mid',
  'Lord Of The Rings.mid',
  'Lose Yourself.mid',
  'Love Story.mid',
  'Marry You.mid',
  'Matrix.mid',
  'Mission Impossible.mid',
  'My Humps.mid',
  'My Immortal.mid',
  'My Way.mid',
  'No Woman No Cry.mid',
  'Nothing Else Matters.mid',
  'November Rain.mid',
  'Numb.mid',
  'P.I.M.P..mid',
  'Piano Man.mid',
  'Pink Panther.mid',
  'Poker Face.mid',
  'Quando, Quando, Quando.mid',
  'Ring Of Fire.mid',
  'Rocky.mid',
  'Rolling in the deep.mid',
  'Scooby-Doo, Where Are You!.mid',
  'Set Fire to the Rain.mid',
  'Seven Nation Army.mid',
  'Simpsons.mid',
  'Smack that.mid',
  'Smoke On The Water.mid',
  'Someone Like You.mid',
  'Someone like you wit lyric.mid',
  'Spong Bob Squar Pants Theme.mid',
  'Still Got The Blues.mid',
  'Sultans Of Swing.mid',
  'Super Mario Brothers.mid',
  'Superman.mid',
  'Sweet Child Of Mine.mid',
  'Sweet Home Alabama.mid',
  'Tears In Heaven.mid',
  'The Hobbit - Misty Mountain Cold.mid',
  'The lazy song.mid',
  'Theme A.mid',
  'Theme B.mid',
  'Theme.mid',
  'This Love.mid',
  'Thriller.mid',
  'Time Is Running Out.mid',
  'Titantic.mid',
  'UEFA - Champions League.mid',
  'Umbrella.mid',
  'Unfaithful.mid',
  'United States.mid',
  'Viva la Vida (2).mid',
  'Wake Me Up When September Ends.mid',
  'We Are The World.mid',
  'We Will Rock You.mid',
  'Where Is The Love.mid',
  'Wonderful Tonight.mid',
  'YMCA.mid',
  'Yesterday.mid',
  'You Belong With Me.mid',
  'You Raise Me Up.mid',
  "You're Beautiful.mid",
];

// ── Artist lookup ──
const _AD = `
12 Days Of Christmas=Traditional
2001 A Space Oddysey=Richard Strauss
A Thousand Miles=Vanessa Carlton
A Thousand Years=Christina Perri
Addams Family=Vic Mizzy
All I Want For Christmas Is You=Mariah Carey
American Idiot=Green Day
Another Brick In The Wall=Pink Floyd
Axel F=Harold Faltermeyer
B.Y.O.B.=System of a Down
Baby=Justin Bieber
Back In Black=AC/DC
Back To The Future - Main Theme=Alan Silvestri
Bad Moon Rising=CCR
Bad Romance=Lady Gaga
Bamboleo=Gypsy Kings
Beat It=Michael Jackson
Beautiful Girls=Sean Kingston
Because Of You=Kelly Clarkson
Billie Jean=Michael Jackson
Black Magic Woman=Santana
Bohemian Rhapsody=Queen
Boulevard of Broken Dreams=Green Day
Bring Me To Life=Evanescence
C.S.I - Criminal Scene Investigation=The Who
Californication=Red Hot Chili Peppers
Can You Feel The Love Tonight=Elton John
Candy Shop=50 Cent
Chasing Cars=Snow Patrol
Chiquitita=ABBA
Chop Suey=System of a Down
Cliffs Of Dover=Eric Johnson
Clocks=Coldplay
Complicated=Avril Lavigne
Concerning Hobbits=Howard Shore
Dancing Queen=ABBA
Don't Cha=Pussycat Dolls
Don't Matter=Akon
Don't Phunk With My Heart=Black Eyed Peas
Earth Song=Michael Jackson
Enter Sandman=Metallica
Everything I Do=Bryan Adams
Everytime We Touch=Cascada
Family Guy=Walter Murphy
Feel Good Inc=Gorillaz
Feeling Good=Nina Simone
Final Countdown=Europe
Fireflies=Owl City
Firework=Katy Perry
Fix You=Coldplay
Fresh Prince Of Bel Air=DJ Jazzy Jeff & The Fresh Prince
Friends=The Rembrandts
Gangnam Style=PSY
Girlfriend=Avril Lavigne
Gladiator=Hans Zimmer
Godfather=Nino Rota
Grenade=Bruno Mars
Hail To The Chief=Traditional
Hallelujah=Leonard Cohen
Happy Birthday=Traditional
Harry Potter=John Williams
Heal The World=Michael Jackson
Here Without You=3 Doors Down
Hes a Pirate=Hans Zimmer
Hey Jude=The Beatles
Hips Dont Lie=Shakira
Home=Michael Bubl\u00e9
Hot N Cold=Katy Perry
Hotel California=Eagles
How You Remind Me=Nickelback
I Got A Feeling=Black Eyed Peas
I Kissed A Girl=Katy Perry
I Walk The Line=Johnny Cash
If I Ain't Got You=Alicia Keys
If I Were A Boy=Beyonc\u00e9
Im Yours=Jason Mraz
Imagine=John Lennon
In Da Club=50 Cent
In The End (2)=Linkin Park
In The End (3)=Linkin Park
Indiana Jones=John Williams
It's My Life=Bon Jovi
James Bond=Monty Norman
Just Dance=Lady Gaga
Just The Way You Are=Bruno Mars
Just The Way you Are.with Lyric=Bruno Mars
Knocking On Heavens Door=Bob Dylan
Lets Get It Started=Black Eyed Peas
Lonely=Akon
Lord Of The Rings=Howard Shore
Lose Yourself=Eminem
Love Story=Taylor Swift
Marry You=Bruno Mars
Matrix=Don Davis
Mission Impossible=Lalo Schifrin
My Humps=Black Eyed Peas
My Immortal=Evanescence
My Way=Frank Sinatra
No Woman No Cry=Bob Marley
Nothing Else Matters=Metallica
November Rain=Guns N' Roses
Numb=Linkin Park
P.I.M.P.=50 Cent
Piano Man=Billy Joel
Pink Panther=Henry Mancini
Poker Face=Lady Gaga
Quando, Quando, Quando=Tony Renis
Ring Of Fire=Johnny Cash
Rocky=Bill Conti
Rolling in the deep=Adele
Scooby-Doo, Where Are You!=David Mook
Set Fire to the Rain=Adele
Seven Nation Army=The White Stripes
Simpsons=Danny Elfman
Smack that=Akon
Smoke On The Water=Deep Purple
Someone Like You=Adele
Someone like you wit lyric=Adele
Spong Bob Squar Pants Theme=Derek Drymon
Still Got The Blues=Gary Moore
Sultans Of Swing=Dire Straits
Super Mario Brothers=Koji Kondo
Superman=Five for Fighting
Sweet Child Of Mine=Guns N' Roses
Sweet Home Alabama=Lynyrd Skynyrd
Tears In Heaven=Eric Clapton
The Hobbit - Misty Mountain Cold=Howard Shore
The lazy song=Bruno Mars
This Love=Maroon 5
Thriller=Michael Jackson
Time Is Running Out=Muse
Titantic=James Horner
UEFA - Champions League=Tony Britten
Umbrella=Rihanna
Unfaithful=Rihanna
Viva la Vida (2)=Coldplay
Wake Me Up When September Ends=Green Day
We Are The World=USA for Africa
We Will Rock You=Queen
Where Is The Love=Black Eyed Peas
Wonderful Tonight=Eric Clapton
YMCA=Village People
Yesterday=The Beatles
You Belong With Me=Taylor Swift
You Raise Me Up=Josh Groban
You're Beautiful=James Blunt`.trim();
const ARTISTS = {};
_AD.split('\n').forEach(l => { const i = l.indexOf('='); if (i > 0) ARTISTS[l.slice(0, i)] = l.slice(i + 1); });

// ── Build playlist from MIDI files ──
const PLAYLIST = MIDI_FILES.map(f => {
  const name = f.replace(/\.mid$/, '');
  return { file: f, name, artist: ARTISTS[name] || 'Tower Radio', duration: 0 };
});

let musicGain = null;
let initialized = false;
let playing = false;
let currentIndex = 0;
let volume = 0.4;
let activeSynths = [];
let activeParts = [];
let endEventId = null;
let _loading = false;
let _failCount = 0;
let _pendingSeek = 0;
let _musicMuted = false;
const BASE = import.meta.env.BASE_URL || '/';
const MUSIC_STATE_KEY = 'spacetower_music';

// ── Public getters ──
export function getPlaylist() { return PLAYLIST; }
export function getCurrentIndex() { return currentIndex; }

// ── Save/restore music state across page reloads ──
export function saveMusicState() {
  try {
    localStorage.setItem(MUSIC_STATE_KEY, JSON.stringify({
      trackIndex: currentIndex,
      position: getPosition(),
      volume: volume,
    }));
  } catch (_) {}
}

function _restoreMusicState() {
  try {
    const raw = localStorage.getItem(MUSIC_STATE_KEY);
    if (!raw) return null;
    localStorage.removeItem(MUSIC_STATE_KEY);
    return JSON.parse(raw);
  } catch (_) { return null; }
}

// ── Init ──
export async function initMusic(existingAudioCtx) {
  if (initialized) return;
  try {
    Tone.setContext(existingAudioCtx);
    await Tone.start();
    musicGain = new Tone.Gain(0).toDestination();
    initialized = true;

    // Restore saved state, or default to Superman
    const saved = _restoreMusicState();
    if (saved) {
      currentIndex = saved.trackIndex;
      volume = saved.volume;
      _pendingSeek = saved.position || 0;
    } else {
      const supIdx = PLAYLIST.findIndex(t => t.name === 'Superman');
      currentIndex = supIdx >= 0 ? supIdx : 0;
    }
  } catch (e) {
    console.warn('Music init failed:', e);
  }
}

// ── Cleanup active playback ──
function _cleanup() {
  if (endEventId !== null) {
    try { Tone.getTransport().clear(endEventId); } catch (_) {}
    endEventId = null;
  }
  activeParts.forEach(p => { try { p.stop(0); p.dispose(); } catch (_) {} });
  activeSynths.forEach(s => { try { s.disconnect(); s.dispose(); } catch (_) {} });
  activeParts = [];
  activeSynths = [];
  try {
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    Tone.getTransport().cancel();
  } catch (_) {}
}

// ── Load and play a MIDI track ──
async function _loadAndPlay(index) {
  if (_loading) return getMeta();
  _loading = true;

  _cleanup();
  currentIndex = ((index % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
  const track = PLAYLIST[currentIndex];

  try {
    const url = `${BASE}assets/music/${encodeURIComponent(track.file)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const midi = new Midi(arrayBuffer);

    track.duration = midi.duration;

    let synthCount = 0;
    midi.tracks.forEach(midiTrack => {
      if (midiTrack.notes.length === 0) return;
      if (midiTrack.channel === 9) return; // skip drums
      if (synthCount >= 6) return; // limit active synths for performance

      const synth = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 8,
        options: {
          oscillator: { type: 'triangle8' },
          envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.8 },
        },
      }).connect(musicGain);

      const notes = midiTrack.notes.map(n => ({
        time: n.time,
        note: n.name,
        duration: n.duration,
        velocity: n.velocity,
      }));

      const part = new Tone.Part((time, ev) => {
        try {
          synth.triggerAttackRelease(ev.note, ev.duration, time, ev.velocity * 0.7);
        } catch (_) {}
      }, notes);
      part.start(0);

      activeParts.push(part);
      activeSynths.push(synth);
      synthCount++;
    });

    // Schedule auto-advance at end of track
    if (midi.duration > 0) {
      endEventId = Tone.getTransport().schedule(() => {
        _loading = false;
        nextTrack();
      }, midi.duration + 1);
    }

    Tone.getTransport().start();
    // Resume from saved position if applicable
    if (_pendingSeek > 0 && _pendingSeek < (midi.duration - 1)) {
      try { Tone.getTransport().seconds = _pendingSeek; } catch (_) {}
      _pendingSeek = 0;
    }
    playing = true;
    musicGain.gain.rampTo(_musicMuted ? 0 : volume * 0.25, 0.5);
    _loading = false;
    _failCount = 0;
    return { name: track.name, artist: track.artist, duration: track.duration };
  } catch (e) {
    console.warn('Failed to load MIDI:', track.file, e);
    _loading = false;
    _failCount++;
    if (_failCount >= 5) {
      console.warn('Too many MIDI load failures, stopping.');
      _failCount = 0;
      return getMeta();
    }
    // Skip to next track on error
    currentIndex = (currentIndex + 1) % PLAYLIST.length;
    return _loadAndPlay(currentIndex);
  }
}

// ── Playback controls ──
export async function play() {
  if (!initialized || !musicGain) return null;
  return _loadAndPlay(currentIndex);
}

export function pause() {
  if (!playing) return;
  playing = false;
  musicGain.gain.rampTo(0, 0.3);
  setTimeout(() => {
    if (!playing) {
      try { Tone.getTransport().pause(); } catch (_) {}
    }
  }, 350);
}

export function togglePlayPause() {
  if (playing) { pause(); return false; }
  else { play(); return true; }
}

export async function nextTrack() {
  const wasPlaying = playing;
  _cleanup();
  playing = false;
  currentIndex = (currentIndex + 1) % PLAYLIST.length;
  if (wasPlaying) return play();
  return getMeta();
}

export async function prevTrack() {
  const wasPlaying = playing;
  _cleanup();
  playing = false;
  currentIndex = (currentIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
  if (wasPlaying) return play();
  return getMeta();
}

export async function playTrack(index) {
  playing = false;
  return _loadAndPlay(index);
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (musicGain && playing && !_musicMuted) musicGain.gain.rampTo(volume * 0.25, 0.1);
}

export function getVolume() { return volume; }

export function getMeta() {
  const t = PLAYLIST[currentIndex];
  return t ? { name: t.name, artist: t.artist, duration: t.duration } : { name: '\u2014', artist: '', duration: 0 };
}

export function getPosition() {
  if (!initialized) return 0;
  try { return Tone.getTransport().seconds; } catch (_) { return 0; }
}

export function seek(seconds) {
  if (!initialized) return;
  try { Tone.getTransport().seconds = seconds; } catch (_) {}
}

export function isPlaying() { return playing; }
export function isInitialized() { return initialized; }

export function fadeOut() {
  if (musicGain) musicGain.gain.rampTo(0, 2);
}

export function fadeIn() {
  if (musicGain && playing && !_musicMuted) musicGain.gain.rampTo(volume * 0.25, 1);
}

export function setMuted(muted) {
  _musicMuted = muted;
  if (!musicGain) return;
  musicGain.gain.rampTo(muted ? 0 : (playing ? volume * 0.25 : 0), 0.3);
}
