'use strict';
import { peekSave } from './save.js';

const saveData = peekSave();

// Dev navigation (spacetower_devGoto) vs normal return (spacetower_gotoExterior)
const devGoto = localStorage.getItem('spacetower_devGoto');
const gotoExterior = localStorage.getItem('spacetower_gotoExterior');
localStorage.removeItem('spacetower_devGoto');
localStorage.removeItem('spacetower_gotoExterior');

// ═══ DYNAMIC MODE LOADING ═══
// Each mode boundary uses dynamic import() so the browser only downloads
// the code it needs. Title/exterior pulls in Three.js (~800KB), sim pulls
// in Canvas 2D + reckoning + keeper (~300KB). Neither pays for the other.

async function bootSim(initArg, thenControlRoom) {
  document.getElementById('titleCanvas').style.display = 'none';
  document.getElementById('gameCanvas').style.display = 'block';
  document.getElementById('game-ui').style.display = '';
  const { initGame, startGameLoop } = await import('./game-init.js');
  initGame(initArg);
  startGameLoop();
  if (thenControlRoom) {
    const { enterControlRoom } = await import('./control-room.js');
    enterControlRoom();
  }
}

async function bootTitle(save, skipToExt) {
  const { initTitle, skipToExterior } = await import('./title/title-main.js');
  initTitle(document.getElementById('titleCanvas'), save);
  if (skipToExt) requestAnimationFrame(() => { skipToExterior(); });
}

if (devGoto === 'interior' || devGoto === 'control-room' || devGoto === 'dozer') {
  bootSim(devGoto === 'dozer' ? 'dozer' : null, devGoto === 'control-room' || devGoto === 'dozer');
} else if (devGoto === 'exterior') {
  bootTitle(null, true);
} else {
  bootTitle(saveData, !!gotoExterior);
}

// When title screen signals game start
document.addEventListener('enter-game', async (e) => {
  const isNew = e.detail?.isNew;

  // Tear down title
  const { disposeTitle } = await import('./title/title-main.js');
  disposeTitle();
  document.getElementById('titleCanvas')?.remove();
  document.getElementById('title-overlay')?.remove();

  // Show game UI
  document.getElementById('gameCanvas').style.display = 'block';
  document.getElementById('game-ui').style.display = '';

  // Init and start game
  const { initGame, startGameLoop } = await import('./game-init.js');
  initGame(isNew ? null : saveData);
  startGameLoop();
});

// Dev menu wiring
document.querySelectorAll('#dev-nav button[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => {
    localStorage.setItem('spacetower_devGoto', btn.dataset.goto);
    location.reload();
  });
});

// PURGE button — full save wipe
document.getElementById('purge-btn')?.addEventListener('click', () => {
  if (!confirm('PURGE all save data and reset everything?')) return;
  [
    'spacetower_v15','spacetower_v14','spacetower_v13','spacetower_v12','spacetower_v11',
    'spacetower_music','spacetower_sound','spacetower_gotoExterior','spacetower_devGoto',
    'spacetower_testReckoning','spacetower_scaffolding','rgb_llm_connection',
  ].forEach(k => localStorage.removeItem(k));
  location.reload();
});
