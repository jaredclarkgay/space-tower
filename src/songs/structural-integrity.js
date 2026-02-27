'use strict';
import * as Tone from 'tone';

export const meta = {
  name: 'Structural Integrity',
  artist: 'Tower Radio',
  duration: 210,
};

export function create(outputNode) {
  // Metallic percussion — industrial ambient
  const metalHit = new Tone.MetalSynth({
    frequency: 200,
    envelope: { attack: 0.001, decay: 0.4, release: 0.2 },
    harmonicity: 5.1,
    modulationIndex: 20,
    resonance: 4000,
    octaves: 1.5,
    volume: -28,
  }).connect(outputNode);

  // Deep sub-bass drone
  const drone = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 4, decay: 2, sustain: 0.8, release: 5 },
    volume: -18,
  }).connect(outputNode);

  // Filtered pad with slow LFO
  const pad = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 3, decay: 1, sustain: 0.6, release: 4 },
    volume: -26,
  });
  const padFilter = new Tone.AutoFilter({
    frequency: 0.08,
    baseFrequency: 200,
    octaves: 3,
    depth: 0.7,
  }).connect(outputNode).start();
  const padReverb = new Tone.Reverb({ decay: 12, wet: 0.5 });
  padReverb.connect(outputNode);
  pad.connect(padFilter);
  pad.connect(padReverb);

  // Rhythmic pattern — irregular, industrial
  const metalPattern = [0, 0.5, 1.5, 2.0, 2.75, 3.5];
  const droneNotes = ['C1', 'D1', 'C1', 'A0'];

  let metalPart = null, dronePart = null, padLoop = null;

  return {
    start() {
      const beatLen = Tone.Time('1m').toSeconds();

      metalPart = new Tone.Part((time) => {
        metalHit.triggerAttackRelease('16n', time, 0.12 + Math.random() * 0.08);
      }, metalPattern.map(t => [t * beatLen / 4]));
      metalPart.loop = true;
      metalPart.loopEnd = beatLen;
      metalPart.start(0);

      dronePart = new Tone.Part((time, note) => {
        drone.triggerAttackRelease(note, '2m', time, 0.3);
      }, droneNotes.map((n, i) => [i * beatLen * 2, n]));
      dronePart.loop = true;
      dronePart.loopEnd = droneNotes.length * beatLen * 2;
      dronePart.start(0);

      const padNotes = ['E2', 'F2', 'G2', 'E2'];
      padLoop = new Tone.Part((time, note) => {
        pad.triggerAttackRelease(note, '4m', time, 0.2);
      }, padNotes.map((n, i) => [i * beatLen * 2, n]));
      padLoop.loop = true;
      padLoop.loopEnd = padNotes.length * beatLen * 2;
      padLoop.start('2m');
    },

    stop() {
      metalPart?.stop(); dronePart?.stop(); padLoop?.stop();
    },

    dispose() {
      metalPart?.dispose(); dronePart?.dispose(); padLoop?.dispose();
      metalHit.dispose(); drone.dispose(); pad.dispose();
      padFilter.dispose(); padReverb.dispose();
    }
  };
}
