'use strict';
import * as THREE from 'three';
import './title-styles.css';
import { buildCityScene, DIMS, updateBuildingHover, updateTowerHover, setSkyBlend } from './title-city.js';
import { createTitleUI, removeTitleUI, showArrivalText, showHomeBtn, setCamDistCallbacks } from './title-ui.js';
import { initConstellation, disposeConstellation, handleStarClick, updateConstellationLines } from './title-constellation.js';
import { playTransition, playReverseTransition, updateTransition, updateReverseTransition, isTransitionActive, getVisibleFloors, TRANSITION, SKY } from './title-transition.js';
import { setupExteriorInput, disposeExteriorInput, updateExterior, isExteriorActive, getPlayerPos, getPlayerVel, activateExterior, setBuiltHeight, isWalkingBackward, setEnterDoorCallback, setGroundNPCs, setBizPeople } from './title-exterior.js';
import { initMusic, play, isInitialized as isMusicInitialized } from '../music.js';
import { setupRadio, disposeRadio } from '../radio-ui.js';

let renderer, scene, camera;
let titleAnimId = null;
let cityData = null;

// ── Orbit state ──
let orbitAngle = 0;
let isDragging = false, dragStartX = 0, lastMouseX = 0, dragMoved = false;
let autoRotate = true, autoRotateSpeed = 0.04, idleTimer = 0;
let cameraLookY = 0;

// ── Zoom ──
let zoomClose = false, zoomTarget = 3250;

// ── Mouse tracking ──
let mouseScreenX = -9999, mouseScreenY = -9999;

// ── Exterior camera ──
let cameraLookTarget = new THREE.Vector3(0, 2, 0);
let camBehindAngle = 0;       // angle-based trailing (orbits behind player velocity)
let wasExteriorActive = false; // detect activation edge
const _camDir = new THREE.Vector3(); // reusable for camera direction
let extCamDist = 8;            // adjustable via slider (default: close to character)

// ── Listeners (stored for cleanup) ──
let resizeHandler, mouseDownHandler, mouseMoveHandler, mouseUpHandler;
let touchStartHandler, touchMoveHandler, touchEndHandler;

export function initTitle(canvas, saveData) {
  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060810);
  scene.fog = new THREE.FogExp2(0x060810, 0.000144); // 0.0018 / S

  // Camera (FOV 50, near 0.1)
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1.0, 25000);
  camera.position.set(DIMS.cameraOrbitR, DIMS.cameraHeight, 0);
  cameraLookY = 200; // look at lower portion — tower extends off screen
  camera.lookAt(0, cameraLookY, 0);

  // Wire camera distance callbacks for UI slider
  setCamDistCallbacks(() => extCamDist, (v) => { extCamDist = v; });

  // Build city
  const buildout = saveData?.buildout || [];
  cityData = buildCityScene(scene, buildout);

  // Constellation
  initConstellation(renderer, camera, cityData.starMeshes, scene, cityData, () => ({ isDragging, dragMoved }));

  // UI
  const enterGame = (isNew) => { _startTransition(isNew); };
  createTitleUI(
    saveData,
    () => enterGame(false),
    () => enterGame(true)
  );

  // Exterior input
  setupExteriorInput();

  // Music — init on first interaction, then auto-play
  const _initTitleMusic = async () => {
    if (isMusicInitialized()) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      await initMusic(ctx);
      play();
    } catch (e) { /* music init failed, non-critical */ }
    document.removeEventListener('click', _initTitleMusic);
    document.removeEventListener('touchstart', _initTitleMusic);
  };
  document.addEventListener('click', _initTitleMusic);
  document.addEventListener('touchstart', _initTitleMusic);

  // ── Zoom toggle ──
  const zoomBtn = document.getElementById('zoom-toggle');
  if (zoomBtn) {
    zoomBtn.addEventListener('click', () => {
      if (isTransitionActive()) return;
      zoomClose = !zoomClose;
      zoomTarget = zoomClose ? 2125 : 3250;
      zoomBtn.textContent = zoomClose ? '\u25c9 closer' : '\u25cb closer';
    });
  }

  // ── View tabs (orbital = stub) ──
  const tabs = document.getElementById('view-tabs');
  if (tabs) {
    tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.view-tab');
      if (!tab) return;
      // City is always active; orbital is a stub
      if (tab.dataset.view === 'orbital') {
        // Stub: no-op for now
      }
    });
  }

  // ── Input: Mouse ──
  mouseDownHandler = (e) => {
    if (e.target.closest('#menu') || e.target.closest('#home-btn') || e.target.closest('.title-enter')) return;
    if (isTransitionActive() && TRANSITION.phase < 4) return;
    isDragging = true; dragStartX = e.clientX; lastMouseX = e.clientX; dragMoved = false;
    autoRotate = false; idleTimer = 0;
  };
  mouseMoveHandler = (e) => {
    mouseScreenX = e.clientX; mouseScreenY = e.clientY;
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    if (Math.abs(e.clientX - dragStartX) > 5) dragMoved = true;
    if (isExteriorActive()) {
      // Drag rotates camera around player
      camBehindAngle += dx * 0.005;
    } else {
      const sensitivity = 0.004 * (DIMS.cameraOrbitR / 3250);
      orbitAngle += dx * sensitivity;
    }
    lastMouseX = e.clientX;
  };
  mouseUpHandler = (e) => {
    if (!dragMoved && !isTransitionActive()) handleStarClick(e.clientX, e.clientY);
    isDragging = false; dragMoved = false;
  };
  document.addEventListener('mousedown', mouseDownHandler);
  document.addEventListener('mousemove', mouseMoveHandler);
  document.addEventListener('mouseup', mouseUpHandler);

  // ── Input: Touch ──
  touchStartHandler = (e) => {
    if (e.target.closest('#menu') || e.target.closest('#home-btn') || e.target.closest('.title-enter')) return;
    if (isTransitionActive() && TRANSITION.phase < 4) return;
    isDragging = true; dragStartX = e.touches[0].clientX; lastMouseX = e.touches[0].clientX; dragMoved = false;
    autoRotate = false; idleTimer = 0;
  };
  touchMoveHandler = (e) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - lastMouseX;
    if (Math.abs(e.touches[0].clientX - dragStartX) > 10) dragMoved = true;
    if (isExteriorActive()) {
      camBehindAngle += dx * 0.005;
    } else {
      const sensitivity = 0.004 * (DIMS.cameraOrbitR / 3250);
      orbitAngle += dx * sensitivity;
    }
    lastMouseX = e.touches[0].clientX;
  };
  touchEndHandler = (e) => {
    if (!dragMoved && !isTransitionActive()) {
      const ct = e.changedTouches[0];
      handleStarClick(ct.clientX, ct.clientY);
    }
    isDragging = false; dragMoved = false;
  };
  document.addEventListener('touchstart', touchStartHandler, { passive: true });
  document.addEventListener('touchmove', touchMoveHandler, { passive: true });
  document.addEventListener('touchend', touchEndHandler, { passive: true });

  // ── Resize ──
  resizeHandler = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resizeHandler);

  // ── Animation loop ──
  let lastTime = performance.now();
  let frameCount = 0;

  // FPS counter (temporary debug)
  let _fpsFrames = 0, _fpsLast = performance.now();
  const _fpsEl = document.createElement('div');
  _fpsEl.style.cssText = 'position:fixed;top:4px;left:4px;z-index:9999;color:lime;font:bold 14px monospace;background:rgba(0,0,0,0.7);padding:2px 6px;pointer-events:none';
  document.body.appendChild(_fpsEl);

  function animate() {
    titleAnimId = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const t = now * 0.001;
    frameCount++;

    // FPS display
    _fpsFrames++;
    if (now - _fpsLast >= 500) {
      const fps = (_fpsFrames / ((now - _fpsLast) / 1000)).toFixed(0);
      const info = renderer.info.render;
      _fpsEl.textContent = `${fps} FPS | ${info.calls} draws | ${info.triangles} tris`;
      _fpsFrames = 0; _fpsLast = now;
    }

    // Auto-rotate with idle timer
    if (!isDragging && !isTransitionActive()) {
      idleTimer += dt;
      if (idleTimer > 4) autoRotate = true;
      if (autoRotate) orbitAngle += autoRotateSpeed * dt;
    }

    // Zoom lerp (only when not transitioning)
    if (!isTransitionActive()) {
      DIMS.cameraOrbitR += (zoomTarget - DIMS.cameraOrbitR) * 0.04;
    }

    // Transition updates
    updateTransition(dt, orbitAngle);
    updateReverseTransition(dt, (r) => { zoomTarget = r; zoomClose = false; });

    // Update camera
    const extActive = isExteriorActive();

    // Detect exterior activation edge — initialize camera angle
    if (extActive && !wasExteriorActive) {
      const pp = getPlayerPos();
      camBehindAngle = Math.atan2(camera.position.x - pp.x, camera.position.z - pp.z);
      cameraLookTarget.set(pp.x, pp.y + 0.5, pp.z);
    }
    wasExteriorActive = extActive;

    if (extActive) {
      // Get camera forward direction for camera-relative controls
      camera.getWorldDirection(_camDir);
      updateExterior(dt, _camDir.x, _camDir.z);

      const pp = getPlayerPos();
      const pv = getPlayerVel();
      const camDist = extCamDist;
      const camHeight = camDist * 0.15; // scales with distance — consistent angle
      const lookAbove = camDist * 0.2;  // how far above player feet to look

      // Angle-based trailing: camera orbits behind player's velocity direction
      // Only updates when player is moving — stays put when idle
      const speed = Math.sqrt(pv.x * pv.x + pv.z * pv.z);
      if (speed > 0.01) {
        // Forward: trail behind velocity. Backward: trail behind facing (negate velocity)
        // Pure backward = camera stays put; strafing while backing up gently orbits
        const bk = isWalkingBackward();
        const targetAngle = Math.atan2(bk ? pv.x : -pv.x, bk ? pv.z : -pv.z);
        // Shortest-path angle interpolation (never swings through player)
        let delta = targetAngle - camBehindAngle;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        // Flip strafe direction when backing up so L/R feel natural
        camBehindAngle += delta * 0.014 * (bk ? -1 : 1);
      }

      // Camera position: behind player at camBehindAngle
      const targetX = pp.x + Math.sin(camBehindAngle) * camDist;
      const targetY = pp.y + camHeight;
      const targetZ = pp.z + Math.cos(camBehindAngle) * camDist;

      // Smooth position follow
      camera.position.x += (targetX - camera.position.x) * 0.12;
      camera.position.y += (targetY - camera.position.y) * 0.12;
      camera.position.z += (targetZ - camera.position.z) * 0.12;

      // Look above player — scales with distance so angle stays consistent
      cameraLookTarget.x += (pp.x - cameraLookTarget.x) * 0.15;
      cameraLookTarget.y += ((pp.y + lookAbove) - cameraLookTarget.y) * 0.15;
      cameraLookTarget.z += (pp.z - cameraLookTarget.z) * 0.15;

      camera.lookAt(cameraLookTarget);
    } else {
      // Original orbit camera — only runs when NOT in exterior mode
      camera.position.x = Math.cos(orbitAngle) * DIMS.cameraOrbitR;
      camera.position.z = Math.sin(orbitAngle) * DIMS.cameraOrbitR;
      camera.position.y = DIMS.cameraHeight;
      const visFloors = getVisibleFloors();
      const visH = visFloors * 3.333 + 3.333 * 3; // floorH * floors + baseH
      const targetY = Math.min(visH * 0.15, 200); // look at base — tower extends off screen
      cameraLookY += (targetY - cameraLookY) * 0.05;
      camera.lookAt(0, cameraLookY, 0);
    }

    // City update
    if (cityData) cityData.updateCity(t, camera.position);

    // Hover systems
    if (frameCount % 3 === 0) {
      if (!extActive) {
        updateBuildingHover(camera, mouseScreenX, mouseScreenY, isTransitionActive() && TRANSITION.phase < 4, t);
        // Tower window toggle: only in orbit mode (don't toggle while walking)
        updateTowerHover(camera, mouseScreenX, mouseScreenY);
      }
    }

    // Constellation lines fade — skip in exterior mode
    if (!extActive) updateConstellationLines();

    renderer.render(scene, camera);
  }
  animate();
}

function _startTransition(isNew) {
  autoRotate = false;

  const setOrbitAngle = (fn) => { orbitAngle = fn(orbitAngle); };

  // onEnterGame: fired when user clicks "Enter Tower" or walks to the door
  const onEnterGame = () => {
    document.dispatchEvent(new CustomEvent('enter-game', { detail: { isNew } }));
  };

  // Wire door interaction — pressing E at the door enters the tower
  setEnterDoorCallback(onEnterGame);
  if (cityData.semiWorkers) setGroundNPCs(cityData.semiWorkers);
  if (cityData.bizPeople) setBizPeople(cityData.bizPeople);

  playTransition(scene, camera, renderer, cityData, () => orbitAngle, setOrbitAngle, onEnterGame);
}

/**
 * Skip directly to exterior mode (used when returning from the sim).
 * Sets up the scene as if the forward transition had just completed.
 */
export function skipToExterior() {
  if (!cityData || !scene) return;
  const TC = cityData.TC;

  // Hide title UI immediately (cancel animations — forwards fill overrides inline opacity)
  const overlay = document.getElementById('title-overlay');
  if (overlay) { overlay.style.animation = 'none'; overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
  ['version', 'hint', 'constellations', 'zoom-toggle', 'view-tabs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.animation = 'none'; el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
  });

  // Camera to close-up position
  DIMS.cameraOrbitR = 1000;
  DIMS.cameraHeight = 150;
  zoomTarget = 1000;
  zoomClose = false;
  autoRotate = false;

  // Sky to day instantly
  SKY.blend = 1;
  SKY.state = 'day';
  scene.background.copy(SKY.day.bg);
  scene.fog.color.copy(SKY.day.fog);
  scene.fog.density = SKY.day.fogDensity;
  setSkyBlend(1);

  // Hide crane, elevator, extensions
  cityData.craneParts.forEach(p => { p.visible = false; });
  if (cityData.elevMesh) cityData.elevMesh.visible = false;
  if (cityData.elevTrack) cityData.elevTrack.visible = false;
  cityData.extColumns.forEach(e => { e.visible = false; });

  // Calculate highest built floor
  const bo = TC.buildout || [];
  let topBuilt = 0;
  for (let fi = 0; fi < 10; fi++) if ((bo[fi] || 0) >= 1) topBuilt = fi + 1;

  // Set player floor so applyPlayerLighting keeps windows visible up to built height
  TC.playerFloor = Math.max(0, topBuilt - 1);

  // Set exterior built height — repositions roof plate, limits climbing/collision
  setBuiltHeight(topBuilt);

  // Dissolve ALL floors above the built range (beams + windows + walls)
  for (let fi = TC.maxFloors - 1; fi >= topBuilt; fi--) {
    cityData.dissolveTowerFloor(fi);
  }

  // Scale structural columns to match highest built floor
  const fh = TC.floorH;
  const baseH = fh * 3;
  const fullH = baseH + TC.maxFloors * fh;
  const visH = baseH + Math.max(1, topBuilt) * fh;
  cityData.structColumns.forEach(c => {
    c.scale.y = visH / fullH;
    c.position.y = visH / 2;
  });

  // Set transition state so isTransitionActive() returns true at phase 4
  TRANSITION.active = true;
  TRANSITION.phase = 4;
  TRANSITION.dissolveFloor = Math.max(0, topBuilt - 1);

  // Apply player lighting (hides windows above TC.playerFloor)
  cityData.applyPlayerLighting();

  // Wire up onEnterGame for the "Enter Tower" button and door interaction
  const onEnterGame = () => {
    document.dispatchEvent(new CustomEvent('enter-game', { detail: { isNew: false } }));
  };
  setEnterDoorCallback(onEnterGame);
  if (cityData.semiWorkers) setGroundNPCs(cityData.semiWorkers);
  if (cityData.bizPeople) setBizPeople(cityData.bizPeople);

  // Show arrival text, home button, and activate exterior
  showArrivalText(onEnterGame);
  showHomeBtn(() => { playReverseTransition(); });
  activateExterior();

  // Setup exterior radio (DOM was just created by showArrivalText)
  setupRadio('#ext-radio');
}

export function disposeTitle() {
  if (titleAnimId) cancelAnimationFrame(titleAnimId);
  titleAnimId = null;

  disposeConstellation();
  disposeExteriorInput();
  disposeRadio();

  // Dispose all scene objects
  if (scene) {
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
  }

  removeTitleUI();

  // Clean up listeners
  window.removeEventListener('resize', resizeHandler);
  document.removeEventListener('mousedown', mouseDownHandler);
  document.removeEventListener('mousemove', mouseMoveHandler);
  document.removeEventListener('mouseup', mouseUpHandler);
  document.removeEventListener('touchstart', touchStartHandler);
  document.removeEventListener('touchmove', touchMoveHandler);
  document.removeEventListener('touchend', touchEndHandler);

  renderer = null;
  scene = null;
  camera = null;
  cityData = null;
}
