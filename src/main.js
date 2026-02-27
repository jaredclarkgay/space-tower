'use strict';
import { initTitle, disposeTitle, skipToExterior } from './title/title-main.js';
import { initGame, startGameLoop, stopGameLoop } from './game-init.js';
import { peekSave } from './save.js';

const saveData = peekSave();

// Launch title screen
initTitle(document.getElementById('titleCanvas'), saveData);

// Check if returning to exterior from the sim
const gotoExterior = localStorage.getItem('spacetower_gotoExterior');
if (gotoExterior) {
  localStorage.removeItem('spacetower_gotoExterior');
  // Skip to exterior after a brief frame for the scene to initialize
  requestAnimationFrame(() => { skipToExterior(); });
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
