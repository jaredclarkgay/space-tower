'use strict';
import { initTitle, disposeTitle, skipToExterior } from './title/title-main.js';
import { initGame, startGameLoop } from './game-init.js';
import { peekSave } from './save.js';
import { enterControlRoom } from './control-room.js';

const saveData = peekSave();

// Dev navigation (spacetower_devGoto) vs normal return (spacetower_gotoExterior)
const devGoto = localStorage.getItem('spacetower_devGoto');
const gotoExterior = localStorage.getItem('spacetower_gotoExterior');
localStorage.removeItem('spacetower_devGoto');
localStorage.removeItem('spacetower_gotoExterior');

if (devGoto === 'interior' || devGoto === 'control-room' || devGoto === 'dozer') {
  // Skip title entirely — straight to sim
  document.getElementById('titleCanvas').style.display = 'none';
  document.getElementById('gameCanvas').style.display = 'block';
  document.getElementById('game-ui').style.display = '';
  initGame(devGoto === 'dozer' ? 'dozer' : null);
  startGameLoop();
  if (devGoto === 'control-room' || devGoto === 'dozer') enterControlRoom();
} else if (devGoto === 'exterior') {
  // Fresh exterior — no buildout
  initTitle(document.getElementById('titleCanvas'), null);
  requestAnimationFrame(() => { skipToExterior(); });
} else {
  // Normal flow: launch title screen
  initTitle(document.getElementById('titleCanvas'), saveData);
  if (gotoExterior) {
    requestAnimationFrame(() => { skipToExterior(); });
  }
}

// When title screen signals game start
document.addEventListener('enter-game', (e) => {
  const isNew = e.detail?.isNew;

  // Tear down title
  disposeTitle();
  document.getElementById('titleCanvas')?.remove();
  document.getElementById('title-overlay')?.remove();

  // Show game UI
  document.getElementById('gameCanvas').style.display = 'block';
  document.getElementById('game-ui').style.display = '';

  // Init and start game
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
