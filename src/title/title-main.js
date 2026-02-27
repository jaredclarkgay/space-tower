'use strict';
import * as THREE from 'three';
import './title-styles.css';
import { buildCityScene, DIMS, updateBuildingHover, updateTowerHover, setSkyBlend } from './title-city.js';
import { createTitleUI, removeTitleUI, showArrivalText, showHomeBtn, fadeOutUI } from './title-ui.js';
import { initConstellation, disposeConstellation, handleStarClick, updateConstellationLines } from './title-constellation.js';
import { playTransition, playReverseTransition, updateTransition, updateReverseTransition, isTransitionActive, getVisibleFloors, TRANSITION, SKY } from './title-transition.js';
import { setupExteriorInput, disposeExteriorInput, updateExterior, isExteriorActive, getPlayerPos, getPlayerVel, activateExterior } from './title-exterior.js';
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
let zoomClose = false, zoomTarget = 260;

// ── Mouse tracking ──
let mouseScreenX = -9999, mouseScreenY = -9999;

// ── Exterior camera ──
let cameraLookTarget = new THREE.Vector3(0, 2, 0);
let camBehindAngle = 0;       // angle-based trailing (orbits behind player velocity)
let wasExteriorActive = false; // detect activation edge
const _camDir = new THREE.Vector3(); // reusable for camera direction

// ── Listeners (stored for cleanup) ──
let resizeHandler, mouseDownHandler, mouseMoveHandler, mouseUpHandler;
let touchStartHandler, touchMoveHandler, touchEndHandler;

export function initTitle(canvas, saveData) {
  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060810);
  scene.fog = new THREE.FogExp2(0x060810, 0.0018);

  // Camera (FOV 50, near 0.1)
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(DIMS.cameraOrbitR, DIMS.cameraHeight, 0);
  cameraLookY = 65 * 1.2 * 0.35; // maxFloors * floorH * 0.35
  camera.lookAt(0, cameraLookY, 0);

  // Build city
  const litFloors = saveData?.litFloors || [0, 1];
  cityData = buildCityScene(scene, litFloors);

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
      zoomTarget = zoomClose ? 170 : 260;
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
      const sensitivity = 0.004 * (DIMS.cameraOrbitR / 260);
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
      const sensitivity = 0.004 * (DIMS.cameraOrbitR / 260);
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

  function animate() {
    titleAnimId = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const t = now * 0.001;
    frameCount++;

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
      const camDist = 6;
      const camHeight = 1.2;

      // Angle-based trailing: camera orbits behind player's velocity direction
      // Only updates when player is moving — stays put when idle
      const speed = Math.sqrt(pv.x * pv.x + pv.z * pv.z);
      if (speed > 0.01) {
        const targetAngle = Math.atan2(-pv.x, -pv.z); // behind velocity
        // Shortest-path angle interpolation (never swings through player)
        let delta = targetAngle - camBehindAngle;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        camBehindAngle += delta * 0.04;
      }

      // Camera position: behind player at camBehindAngle
      const targetX = pp.x + Math.sin(camBehindAngle) * camDist;
      const targetY = pp.y + camHeight;
      const targetZ = pp.z + Math.cos(camBehindAngle) * camDist;

      // Smooth position follow
      camera.position.x += (targetX - camera.position.x) * 0.06;
      camera.position.y += (targetY - camera.position.y) * 0.06;
      camera.position.z += (targetZ - camera.position.z) * 0.06;

      // Look above player — upward-facing angle to see the tower
      cameraLookTarget.x += (pp.x - cameraLookTarget.x) * 0.08;
      cameraLookTarget.y += ((pp.y + 2.0) - cameraLookTarget.y) * 0.08;
      cameraLookTarget.z += (pp.z - cameraLookTarget.z) * 0.08;

      camera.lookAt(cameraLookTarget);
    } else {
      // Original orbit camera — only runs when NOT in exterior mode
      camera.position.x = Math.cos(orbitAngle) * DIMS.cameraOrbitR;
      camera.position.z = Math.sin(orbitAngle) * DIMS.cameraOrbitR;
      camera.position.y = DIMS.cameraHeight;
      const visFloors = getVisibleFloors();
      const visH = visFloors * 1.2 + 1.2 * 3; // floorH * floors + baseH
      const targetY = visH * 0.5;
      cameraLookY += (targetY - cameraLookY) * 0.05;
      camera.lookAt(0, cameraLookY, 0);
    }

    // City update
    if (cityData) cityData.updateCity(t);

    // Hover systems (throttled to every 3rd frame)
    if (frameCount % 3 === 0) {
      updateBuildingHover(camera, mouseScreenX, mouseScreenY, isTransitionActive() && TRANSITION.phase < 4);
      updateTowerHover(camera, mouseScreenX, mouseScreenY);
    }

    // Constellation lines fade
    updateConstellationLines();

    renderer.render(scene, camera);
  }
  animate();
}

function _startTransition(isNew) {
  autoRotate = false;

  const setOrbitAngle = (fn) => { orbitAngle = fn(orbitAngle); };

  // onEnterGame: fired when user clicks "Enter Tower" after the cinematic
  const onEnterGame = () => {
    document.dispatchEvent(new CustomEvent('enter-game', { detail: { isNew } }));
  };

  playTransition(scene, camera, renderer, cityData, () => orbitAngle, setOrbitAngle, onEnterGame);
}

/**
 * Skip directly to exterior mode (used when returning from the sim).
 * Sets up the scene as if the forward transition had just completed.
 */
export function skipToExterior() {
  if (!cityData || !scene) return;
  const TC = cityData.TC;

  // Hide title UI immediately
  const overlay = document.getElementById('title-overlay');
  if (overlay) { overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
  ['version', 'hint', 'constellations', 'zoom-toggle', 'view-tabs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
  });

  // Camera to close-up position
  DIMS.cameraOrbitR = 80;
  DIMS.cameraHeight = 12;
  zoomTarget = 80;
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

  // Dissolve floors above 9
  for (let fi = TC.maxFloors - 1; fi > 9; fi--) {
    const fr = TC.floorMeshes[fi];
    if (fr && fr.beam) fr.beam.visible = false;
    cityData.dissolveTowerFloor(fi);
  }

  // Scale structural columns to visible height
  const fh = TC.floorH;
  const baseH = fh * 3;
  const fullH = baseH + TC.maxFloors * fh;
  const visH = baseH + 10 * fh;
  cityData.structColumns.forEach(c => {
    c.scale.y = visH / fullH;
    c.position.y = visH / 2;
  });

  // Set transition state so isTransitionActive() returns true at phase 4
  TRANSITION.active = true;
  TRANSITION.phase = 4;
  TRANSITION.dissolveFloor = 9;

  // Apply player lighting
  cityData.applyPlayerLighting();

  // Wire up onEnterGame for the "Enter Tower" button
  const onEnterGame = () => {
    document.dispatchEvent(new CustomEvent('enter-game', { detail: { isNew: false } }));
  };

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
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
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
