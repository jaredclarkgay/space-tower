'use strict';
import * as Tone from 'tone';

export const meta = {
  name: 'Thin Air',
  artist: 'Tower Radio',
  duration: 210,
};

export function create(outputNode) {
  // Sparse piano-like synth with long reverb tail
  const piano = new Tone.Synth({
    oscillator: { type: 'triangle', partialCount: 3 },
    envelope: { attack: 0.01, decay: 2, sustain: 0.1, release: 6 },
    volume: -16,
  });
  const pianoReverb = new Tone.Reverb({ decay: 14, wet: 0.7 });
  pianoReverb.connect(outputNode);
  piano.connect(pianoReverb);

  // Very quiet pad beneath
  const pad = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 6, decay: 2, sustain: 0.5, release: 8 },
    volume: -28,
  });
  const padDelay = new Tone.FeedbackDelay({ delayTime: '4n.', feedback: 0.3, wet: 0.4 });
  padDelay.connect(outputNode);
  pad.connect(padDelay);
  pad.connect(outputNode);

  // Note sequence — sparse, contemplative
  const notes = [
    [0, 'C4'], [3.5, 'E4'], [7, 'G4'], [9.5, 'B4'],
    [14, 'A4'], [18, 'F4'], [22, 'D4'], [25, 'E4'],
    [30, 'C5'], [34, 'G4'], [38, 'E4'], [42, 'C4'],
  ];
  const padNotes = [
    [0, 'C3'], [14, 'F3'], [28, 'G3'], [38, 'E3'],
  ];

  let notePart = null, padPart = null;

  return {
    start() {
      notePart = new Tone.Part((time, note) => {
        piano.triggerAttackRelease(note, '2n', time, 0.3 + Math.random() * 0.15);
      }, notes.map(([t, n]) => [t, n]));
      notePart.loop = true;
      notePart.loopEnd = 48;
      notePart.start(0);

      padPart = new Tone.Part((time, note) => {
        pad.triggerAttackRelease(note, '4m', time, 0.2);
      }, padNotes.map(([t, n]) => [t, n]));
      padPart.loop = true;
      padPart.loopEnd = 48;
      padPart.start(0);
    },

    stop() {
      notePart?.stop(); padPart?.stop();
    },

    dispose() {
      notePart?.dispose(); padPart?.dispose();
      piano.dispose(); pad.dispose();
      pianoReverb.dispose(); padDelay.dispose();
    }
  };
}
