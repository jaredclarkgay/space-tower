'use strict';
import { initTitle, disposeTitle } from './title/title-main.js';
import { initGame, startGameLoop } from './game-init.js';
import { peekSave } from './save.js';

const saveData = peekSave();

// Launch title screen
initTitle(document.getElementById('titleCanvas'), saveData);

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
