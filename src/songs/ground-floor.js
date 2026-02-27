'use strict';
import * as Tone from 'tone';

export const meta = {
  name: 'Ground Floor',
  artist: 'Tower Radio',
  duration: 180,
};

export function create(outputNode) {
  // Warm FM pad
  const pad = new Tone.PolySynth(Tone.FMSynth, {
    volume: -22,
    modulationIndex: 1.5,
    harmonicity: 1.5,
    oscillator: { type: 'sine' },
    envelope: { attack: 3, decay: 1.5, sustain: 0.7, release: 4 },
    modulation: { type: 'triangle' },
    modulationEnvelope: { attack: 2, decay: 0.5, sustain: 0.6, release: 3 },
  }).connect(outputNode);

  // Reverb on pad
  const reverb = new Tone.Reverb({ decay: 10, wet: 0.55 });
  reverb.connect(outputNode);
  pad.connect(reverb);

  // Gentle bass pulse
  const bass = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.4, decay: 0.6, sustain: 0.5, release: 2 },
    volume: -20,
  }).connect(outputNode);

  // Soft hi-hat tick (filtered noise)
  const hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.03 },
    volume: -32,
  });
  const hatFilter = new Tone.Filter(6000, 'highpass');
  hat.connect(hatFilter);
  hatFilter.connect(outputNode);

  // Chord progression (warm, simple)
  const chords = [
    ['C3', 'E3', 'G3', 'B3'],
    ['A2', 'C3', 'E3', 'G3'],
    ['F2', 'A2', 'C3', 'E3'],
    ['G2', 'B2', 'D3', 'F3'],
  ];
  const bassNotes = ['C2', 'A1', 'F1', 'G1'];

  let padPart = null, bassPart = null, hatLoop = null;

  return {
    start() {
      const measureLen = Tone.Time('2m').toSeconds();

      padPart = new Tone.Part((time, chord) => {
        pad.triggerAttackRelease(chord, '2m', time, 0.25);
      }, chords.map((c, i) => [i * measureLen, c]));
      padPart.loop = true;
      padPart.loopEnd = chords.length * measureLen;
      padPart.start(0);

      bassPart = new Tone.Part((time, note) => {
        bass.triggerAttackRelease(note, '1m', time, 0.35);
      }, bassNotes.map((n, i) => [i * measureLen, n]));
      bassPart.loop = true;
      bassPart.loopEnd = bassNotes.length * measureLen;
      bassPart.start(0);

      hatLoop = new Tone.Loop((time) => {
        hat.triggerAttackRelease('16n', time, 0.15);
      }, '4n');
      hatLoop.start('1m'); // delayed entrance
    },

    stop() {
      padPart?.stop(); bassPart?.stop(); hatLoop?.stop();
      pad.releaseAll();
    },

    dispose() {
      padPart?.dispose(); bassPart?.dispose(); hatLoop?.dispose();
      pad.dispose(); bass.dispose(); hat.dispose();
      hatFilter.dispose(); reverb.dispose();
    }
  };
}
