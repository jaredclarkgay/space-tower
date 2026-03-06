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

if (devGoto === 'interior' || devGoto === 'control-room') {
  // Skip title entirely — straight to sim (fresh game)
  document.getElementById('titleCanvas').style.display = 'none';
  document.getElementById('gameCanvas').style.display = 'block';
  document.getElementById('game-ui').style.display = '';
  initGame(null);
  startGameLoop();
  if (devGoto === 'control-room') enterControlRoom();
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
document.querySelectorAll('#dev-nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    localStorage.setItem('spacetower_devGoto', btn.dataset.goto);
    location.reload();
  });
});
