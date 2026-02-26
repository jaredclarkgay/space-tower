'use strict';
import * as THREE from 'three';
import './title-styles.css';
import { buildCityScene, DIMS, updateBuildingHover, updateTowerHover } from './title-city.js';
import { createTitleUI, removeTitleUI } from './title-ui.js';
import { initConstellation, disposeConstellation, handleStarClick, updateConstellationLines } from './title-constellation.js';
import { playTransition, updateTransition, updateReverseTransition, isTransitionActive, getVisibleFloors, TRANSITION } from './title-transition.js';

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
    const sensitivity = 0.004 * (DIMS.cameraOrbitR / 260);
    orbitAngle += dx * sensitivity;
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
    const sensitivity = 0.004 * (DIMS.cameraOrbitR / 260);
    orbitAngle += dx * sensitivity;
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
    camera.position.x = Math.cos(orbitAngle) * DIMS.cameraOrbitR;
    camera.position.z = Math.sin(orbitAngle) * DIMS.cameraOrbitR;
    camera.position.y = DIMS.cameraHeight;
    const visFloors = getVisibleFloors();
    const visH = visFloors * 1.2 + 1.2 * 3; // floorH * floors + baseH
    const targetY = visH * 0.5;
    cameraLookY += (targetY - cameraLookY) * 0.05;
    camera.lookAt(0, cameraLookY, 0);

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

export function disposeTitle() {
  if (titleAnimId) cancelAnimationFrame(titleAnimId);
  titleAnimId = null;

  disposeConstellation();

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
