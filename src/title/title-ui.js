'use strict';

/**
 * Title screen DOM creation and management.
 * Builds all UI into #title-overlay; game panel .slot is unaffected
 * because menu slots are scoped as #menu .slot in CSS.
 */

export function createTitleUI(saveData, onContinue, onNewGame) {
  const overlay = document.getElementById('title-overlay');
  if (!overlay) return;

  // Title
  const title = document.createElement('div');
  title.className = 'title-text';
  title.textContent = 'SPACE TOWER';
  overlay.appendChild(title);

  // Subtitle
  const sub = document.createElement('div');
  sub.className = 'title-sub';
  sub.textContent = 'Goodbye Earth';
  overlay.appendChild(sub);

  // Menu (vertical save slots)
  const menu = document.createElement('div');
  menu.id = 'menu';

  const hasSave = saveData && saveData.ts;

  // Slot 1: populated save or empty
  const slot1 = _makeSlot(
    hasSave ? 'Tower Alpha' : 'New Tower',
    hasSave ? _formatMeta(saveData) : 'Empty Slot',
    !hasSave
  );
  slot1.addEventListener('click', () => hasSave ? onContinue() : onNewGame());
  menu.appendChild(slot1);

  // Slot 2: empty
  const slot2 = _makeSlot('New Tower', 'Empty Slot', true);
  slot2.addEventListener('click', () => onNewGame());
  menu.appendChild(slot2);

  // Slot 3: empty
  const slot3 = _makeSlot('New Tower', 'Empty Slot', true);
  slot3.addEventListener('click', () => onNewGame());
  menu.appendChild(slot3);

  // Continue button (only if save exists)
  if (hasSave) {
    const cont = _makeSlot('Continue', 'Tower Alpha', false);
    cont.classList.add('primary');
    cont.addEventListener('click', () => onContinue());
    menu.appendChild(cont);
  }

  overlay.appendChild(menu);

  // Version
  const ver = document.createElement('div');
  ver.id = 'version';
  ver.textContent = 'v0.4 \u00b7 SEGMENT 1';
  document.body.appendChild(ver);

  // Hint
  const hint = document.createElement('div');
  hint.id = 'hint';
  document.body.appendChild(hint);

  // Constellations counter
  const cst = document.createElement('div');
  cst.id = 'constellations';
  document.body.appendChild(cst);

  // Zoom toggle
  const zoom = document.createElement('div');
  zoom.id = 'zoom-toggle';
  zoom.textContent = '\u25cb closer';
  document.body.appendChild(zoom);

  // Home button (hidden until transition completes)
  const home = document.createElement('div');
  home.id = 'home-btn';
  home.textContent = '\u2302 MENU';
  document.body.appendChild(home);

  // View tabs
  const tabs = document.createElement('div');
  tabs.id = 'view-tabs';
  const cityTab = document.createElement('div');
  cityTab.className = 'view-tab active';
  cityTab.textContent = 'City';
  cityTab.dataset.view = 'city';
  const orbTab = document.createElement('div');
  orbTab.className = 'view-tab';
  orbTab.textContent = 'Orbital';
  orbTab.dataset.view = 'orbital';
  tabs.appendChild(cityTab);
  tabs.appendChild(orbTab);
  document.body.appendChild(tabs);

  // Show hint after 4 seconds
  setTimeout(() => {
    hint.textContent = '\u2190 drag to orbit \u2192';
    hint.classList.add('visible');
    setTimeout(() => hint.classList.remove('visible'), 6000);
  }, 4000);
}

export function removeTitleUI() {
  const overlay = document.getElementById('title-overlay');
  if (overlay) overlay.innerHTML = '';
  for (const id of ['version', 'hint', 'constellations', 'zoom-toggle', 'home-btn', 'view-tabs', 'arrival-text', 'enter-tower-btn', 'ext-radio', 'ext-hints']) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
}

export function fadeOutUI() {
  return new Promise(resolve => {
    const overlay = document.getElementById('title-overlay');
    const ver = document.getElementById('version');
    const hint = document.getElementById('hint');
    const cst = document.getElementById('constellations');
    const zoom = document.getElementById('zoom-toggle');
    if (overlay) { overlay.style.transition = 'opacity 1.5s ease'; overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
    if (ver) { ver.style.transition = 'opacity 1s ease'; ver.style.opacity = '0'; }
    if (hint) hint.classList.remove('visible');
    if (cst) cst.classList.remove('visible');
    if (zoom) { zoom.style.opacity = '0'; zoom.style.pointerEvents = 'none'; }
    const tabs = document.getElementById('view-tabs');
    if (tabs) { tabs.style.transition = 'opacity 1s ease'; tabs.style.opacity = '0'; tabs.style.pointerEvents = 'none'; }
    setTimeout(resolve, 1500);
  });
}

export function fadeInUI() {
  return new Promise(resolve => {
    const overlay = document.getElementById('title-overlay');
    const ver = document.getElementById('version');
    const zoom = document.getElementById('zoom-toggle');
    if (overlay) { overlay.style.transition = 'opacity 1.5s ease'; overlay.style.opacity = '1'; overlay.style.pointerEvents = ''; }
    if (ver) { ver.style.transition = 'opacity 1s ease'; ver.style.opacity = '1'; }
    if (zoom) { zoom.style.opacity = '1'; zoom.style.pointerEvents = 'auto'; }
    const tabs = document.getElementById('view-tabs');
    if (tabs) { tabs.style.opacity = '1'; tabs.style.pointerEvents = ''; }
    setTimeout(resolve, 1500);
  });
}

export function showArrivalText(onEnter) {
  const el = document.createElement('div');
  el.className = 'title-arrival';
  el.id = 'arrival-text';
  el.innerHTML = '<div class="title-arrival-main">Floors 1\u201310</div><div class="title-arrival-sub">Goodbye Earth</div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });

  // Auto-fade the arrival header after a few seconds
  setTimeout(() => { el.style.opacity = '0'; }, 5000);

  // Enter Tower button — separate fixed element (bottom-right, white)
  if (onEnter) {
    const btn = document.createElement('div');
    btn.className = 'title-enter';
    btn.id = 'enter-tower-btn';
    btn.textContent = 'Enter Tower';
    btn.addEventListener('click', () => onEnter());
    document.body.appendChild(btn);
  }

  // Show exterior radio
  showExteriorRadio();

  // Show movement instructions
  showMovementHints();
}

export function hideArrivalText() {
  const el = document.getElementById('arrival-text');
  if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 2000); }
  const btn = document.getElementById('enter-tower-btn');
  if (btn) { btn.style.opacity = '0'; setTimeout(() => btn.remove(), 2000); }
}

export function showHomeBtn(onHome) {
  const btn = document.getElementById('home-btn');
  if (!btn) return;
  btn.style.opacity = '1';
  btn.style.pointerEvents = 'auto';
  btn._handler = () => onHome();
  btn.addEventListener('click', btn._handler);
}

export function hideHomeBtn() {
  const btn = document.getElementById('home-btn');
  if (!btn) return;
  btn.style.opacity = '0';
  btn.style.pointerEvents = 'none';
  if (btn._handler) { btn.removeEventListener('click', btn._handler); btn._handler = null; }
}

// ── Exterior radio ──
export function showExteriorRadio() {
  if (document.getElementById('ext-radio')) return;
  const wrap = document.createElement('div');
  wrap.id = 'ext-radio';
  wrap.className = 'radio-wrap';
  wrap.style.cssText = 'position:fixed;bottom:90px;right:28px;z-index:60;width:220px';
  wrap.innerHTML = `
    <div class="radio-widget">
      <div class="radio-song">Tower Radio</div>
      <div class="radio-artist">TOWER RADIO</div>
      <div class="radio-controls">
        <button class="radio-prev" title="Previous">&laquo; Prev</button>
        <button class="radio-play" title="Play/Pause">&#9654;</button>
        <button class="radio-next" title="Next">Next &raquo;</button>
        <button class="radio-list" title="Track List">LIST</button>
      </div>
      <div class="radio-scrub">
        <div class="radio-scrub-bg"><div class="radio-scrub-fill"></div></div>
        <div class="radio-scrub-dot"></div>
        <div class="radio-time">0:00</div>
      </div>
      <div class="radio-vol">
        <span style="opacity:0.4">VOL</span>
        <input type="range" class="radio-vol-slider" min="0" max="100" value="40">
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

export function hideExteriorRadio() {
  const el = document.getElementById('ext-radio');
  if (el) el.remove();
}

// ── Movement hints ──
export function showMovementHints() {
  if (document.getElementById('ext-hints')) return;
  const el = document.createElement('div');
  el.id = 'ext-hints';
  el.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:60;color:rgba(255,255,255,0.4);font-family:monospace;font-size:9px;line-height:1.6;pointer-events:none;user-select:none;background:rgba(0,0,0,0.3);padding:6px 10px;border-radius:5px;backdrop-filter:blur(4px)';
  el.innerHTML = 'WASD \u2014 move<br>SPACE \u2014 jump (hold to charge)<br>CLIMB \u2014 walk into columns<br>E \u2014 interact';
  document.body.appendChild(el);
}

export function hideMovementHints() {
  const el = document.getElementById('ext-hints');
  if (el) el.remove();
}

// ── Helpers ──

function _makeSlot(label, meta, isEmpty) {
  const el = document.createElement('div');
  el.className = 'slot' + (isEmpty ? ' empty' : '');
  el.innerHTML = `<span class="label">${label}</span><span class="meta">${meta}</span>`;
  return el;
}

function _formatMeta(save) {
  const floors = save.litFloors ? save.litFloors.length : 0;
  let time = '';
  if (save.ts) {
    const diff = Date.now() - save.ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) time = `${mins}m ago`;
    else if (mins < 1440) time = `${Math.floor(mins / 60)}h ago`;
    else time = `${Math.floor(mins / 1440)}d ago`;
  }
  return `Floor ${floors}${time ? ' \u00b7 ' + time : ''}`;
}
