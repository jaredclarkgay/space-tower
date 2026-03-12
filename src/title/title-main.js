'use strict';
import * as THREE from 'three';
import './title-styles.css';
import { buildCityScene, DIMS, updateBuildingHover, updateTowerHover, setSkyBlend, getEarthParams, setEarthVisible, updateMoon } from './title-city.js';
import { createTitleUI, removeTitleUI, showArrivalText, showHomeBtn, setCamDistCallbacks } from './title-ui.js';
import { initConstellation, disposeConstellation, handleStarClick, updateConstellationLines } from './title-constellation.js';
import { playTransition, playReverseTransition, updateTransition, updateReverseTransition, isTransitionActive, getVisibleFloors, TRANSITION, SKY, setTransitionRefs } from './title-transition.js';
import { setupExteriorInput, disposeExteriorInput, updateExterior, isExteriorActive, getPlayerPos, getPlayerVel, activateExterior, setBuiltHeight, isWalkingBackward, setEnterDoorCallback, setOnFloorBuilt, setOnBuiltHeightChange, setGroundNPCs, setBizPeople, setDoorMeshes, isDoorAnimActive, getCrane, getBulldozer, spawnBulldozer, getScaffolding, spawnScaffolding } from './title-exterior.js';
import { ThirdPersonCamera } from './third-person-camera.js';
import { initMusic, play, isInitialized as isMusicInitialized } from '../music.js';
import { ensureAudioCtx, getAudioCtx } from '../sound.js';
import { setupRadio, disposeRadio } from '../radio-ui.js';

let renderer, scene, camera;
let titleAnimId = null;
let cityData = null;

// Patch sim save with updated buildout from exterior building
function _syncBuildoutToSave(buildout) {
  const key = 'spacetower_v15';
  try {
    const raw = localStorage.getItem(key);
    const d = raw ? JSON.parse(raw) : { ts: Date.now() };
    d.buildout = buildout.slice(0, 10);
    localStorage.setItem(key, JSON.stringify(d));
  } catch { /* save failed — non-critical */ }
}

// ── Orbit state ──
let orbitAngle = 0;
let isDragging = false, dragStartX = 0, lastMouseX = 0, lastMouseY = 0, dragMoved = false;
let autoRotate = true, autoRotateSpeed = 0.04, idleTimer = 0;
let cameraLookY = 0;

// ── Zoom ──
let zoomClose = false, zoomTarget = 3250;

// ── Orbital (Earth) view ──
let orbitalView = false;
let orbitalCamY = 0, orbitalCamR = 0, orbitalLookY = 0; // lerp targets

// ── Mouse tracking ──
let mouseScreenX = -9999, mouseScreenY = -9999;

// ── Third-person camera ──
let tpCam = null;
let _scaffLookSmooth = null; // lerped lookAt for scaffolding camera
let wasExteriorActive = false; // detect activation edge

// ── Listeners (stored for cleanup) ──
let resizeHandler, mouseDownHandler, mouseMoveHandler, mouseUpHandler, wheelHandler;
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

  // Lighting (for Lambert materials — terrain depth shading)
  scene.add(new THREE.AmbientLight(0xcccccc, 1.2));
  const _sunLight = new THREE.DirectionalLight(0xffeedd, 0.8);
  _sunLight.position.set(100, 200, 80);
  scene.add(_sunLight);

  // Camera (FOV 50, near 0.1)
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1.0, 25000);
  camera.position.set(DIMS.cameraOrbitR, DIMS.cameraHeight, 0);
  cameraLookY = 200; // look at lower portion — tower extends off screen
  camera.lookAt(0, cameraLookY, 0);

  // Third-person camera controller (used in exterior mode)
  tpCam = new ThirdPersonCamera(camera);

  // Init orbital lerp values to city position
  orbitalCamR = DIMS.cameraOrbitR;
  orbitalCamY = DIMS.cameraHeight;
  orbitalLookY = cameraLookY;

  // Wire camera distance callbacks for UI slider
  setCamDistCallbacks(() => tpCam.distance, (v) => { tpCam.distance = v; });

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

  // Music — init on first interaction using shared AudioContext from sound.js
  const _initTitleMusic = async () => {
    if (isMusicInitialized()) return;
    try {
      ensureAudioCtx();
      const ctx = getAudioCtx();
      if (ctx) { await initMusic(ctx); play(); }
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

  // ── View tabs (City / Orbital) ──
  const tabs = document.getElementById('view-tabs');
  if (tabs) {
    tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.view-tab');
      if (!tab || isTransitionActive()) return;
      const view = tab.dataset.view;
      if (view === 'orbital' && !orbitalView) {
        orbitalView = true;
        setEarthVisible(true);
        autoRotate = true; idleTimer = 5;
        tabs.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'orbital'));
      } else if (view === 'city' && orbitalView) {
        orbitalView = false;
        setEarthVisible(false);
        autoRotate = true; idleTimer = 5;
        tabs.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'city'));
      }
    });
  }

  // ── Input: Mouse ──
  mouseDownHandler = (e) => {
    if (e.target.closest('#menu') || e.target.closest('#home-btn') || e.target.closest('.title-enter')) return;
    if (isTransitionActive() && TRANSITION.phase < 4) return;
    isDragging = true; dragStartX = e.clientX; lastMouseX = e.clientX; lastMouseY = e.clientY; dragMoved = false;
    autoRotate = false; idleTimer = 0;
    if (isExteriorActive()) tpCam.onMouseDown();
  };
  mouseMoveHandler = (e) => {
    mouseScreenX = e.clientX; mouseScreenY = e.clientY;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (!isDragging) return;
    if ((isExteriorActive() || isDoorAnimActive()) && tpCam.onDrag(dx, dy)) {
      dragMoved = true;
    } else if (!isExteriorActive() && !isDoorAnimActive()) {
      if (Math.abs(e.clientX - dragStartX) > 5) dragMoved = true;
      const sensitivity = 0.004 * (DIMS.cameraOrbitR / 3250);
      orbitAngle += dx * sensitivity;
    }
  };
  mouseUpHandler = (e) => {
    if (!dragMoved && !isTransitionActive()) handleStarClick(e.clientX, e.clientY);
    isDragging = false; dragMoved = false;
    if (isExteriorActive()) tpCam.onMouseUp();
  };
  document.addEventListener('mousedown', mouseDownHandler);
  document.addEventListener('mousemove', mouseMoveHandler);
  document.addEventListener('mouseup', mouseUpHandler);

  // ── Input: Wheel (exterior zoom) ──
  wheelHandler = (e) => {
    if (isExteriorActive() || isDoorAnimActive()) {
      tpCam.onWheel(e.deltaY);
      e.preventDefault();
    }
  };
  document.addEventListener('wheel', wheelHandler, { passive: false });

  // ── Input: Touch ──
  touchStartHandler = (e) => {
    if (e.target.closest('#menu') || e.target.closest('#home-btn') || e.target.closest('.title-enter')) return;
    if (isTransitionActive() && TRANSITION.phase < 4) return;
    isDragging = true; dragStartX = e.touches[0].clientX; lastMouseX = e.touches[0].clientX; lastMouseY = e.touches[0].clientY; dragMoved = false;
    autoRotate = false; idleTimer = 0;
  };
  touchMoveHandler = (e) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - lastMouseX;
    const dy = e.touches[0].clientY - lastMouseY;
    if (Math.abs(e.touches[0].clientX - dragStartX) > 10) dragMoved = true;
    if ((isExteriorActive() || isDoorAnimActive()) && tpCam.onDrag(dx, dy)) {
      dragMoved = true;
    } else if (!isExteriorActive() && !isDoorAnimActive()) {
      const sensitivity = 0.004 * (DIMS.cameraOrbitR / 3250);
      orbitAngle += dx * sensitivity;
    }
    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
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
      if (autoRotate) orbitAngle += (orbitalView ? 0.008 : autoRotateSpeed) * dt;
    }

    // Zoom lerp (only when not transitioning)
    if (!isTransitionActive()) {
      DIMS.cameraOrbitR += (zoomTarget - DIMS.cameraOrbitR) * 0.04;
    }

    // Transition updates
    updateTransition(dt, orbitAngle);
    updateReverseTransition(dt, (r) => { zoomTarget = r; zoomClose = false; });

    // Update camera
    const extActive = isExteriorActive() || isDoorAnimActive();

    // Detect exterior activation edge
    if (extActive && !wasExteriorActive) {
      tpCam.activate(getPlayerPos());
    }
    wasExteriorActive = extActive;

    if (extActive) {
      const fwd = tpCam.getCameraForward();
      updateExterior(dt, fwd.x, fwd.z);
      // Camera follows boom rotation when operating crane
      const _crane = getCrane();
      if (_crane?.isOperating) {
        const targetYaw = _crane.boomAngle - Math.PI / 2;
        let delta = targetYaw - tpCam.yaw;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        tpCam.yaw += delta * 0.06;
      }
      // Camera follows bulldozer heading + zooms out
      const _dozer = getBulldozer();
      if (_dozer?.isOperating) {
        const targetDist = 25;
        tpCam.distance += (targetDist - tpCam.distance) * 0.05;
        // Track behind the bulldozer
        if (Math.abs(_dozer.speed) > 1) {
          const targetYaw = _dozer.heading + Math.PI;
          let delta = targetYaw - tpCam.yaw;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          tpCam.yaw += delta * 0.04;
        }
      }
      // Scaffolding game: cinematic camera from getCameraTarget()
      const _scaff = getScaffolding();
      const scaffCam = _scaff?.isOperating ? _scaff.getCameraTarget() : null;
      if (scaffCam) {
        const cam = camera;
        const spd = scaffCam.lerp || 0.06;
        if (spd >= 1.0) {
          cam.position.copy(scaffCam.pos);
        } else {
          cam.position.x += (scaffCam.pos.x - cam.position.x) * spd;
          cam.position.y += (scaffCam.pos.y - cam.position.y) * spd;
          cam.position.z += (scaffCam.pos.z - cam.position.z) * spd;
        }
        // Screen shake on slam impact
        const shake = _scaff.shakeAmount;
        if (shake > 0) {
          cam.position.x += (Math.random() - 0.5) * shake;
          cam.position.y += (Math.random() - 0.5) * shake;
        }
        // Lerp the lookAt target — smooth transitions, snap when lerp is 1.0
        if (!_scaffLookSmooth) {
          _scaffLookSmooth = scaffCam.lookAt.clone();
        } else if (spd >= 1.0) {
          _scaffLookSmooth.copy(scaffCam.lookAt);
        } else {
          const lookSpd = Math.max(spd, 0.15);
          _scaffLookSmooth.x += (scaffCam.lookAt.x - _scaffLookSmooth.x) * lookSpd;
          _scaffLookSmooth.y += (scaffCam.lookAt.y - _scaffLookSmooth.y) * lookSpd;
          _scaffLookSmooth.z += (scaffCam.lookAt.z - _scaffLookSmooth.z) * lookSpd;
        }
        cam.lookAt(_scaffLookSmooth);
        // Keep tpCam synced for smooth handoff when exiting
        tpCam._lookX = _scaffLookSmooth.x;
        tpCam._lookY = _scaffLookSmooth.y;
        tpCam._lookZ = _scaffLookSmooth.z;
      } else {
        _scaffLookSmooth = null;
        tpCam.update(dt, getPlayerPos(), getPlayerVel(), isWalkingBackward());
      }
    } else if (orbitalView) {
      // Orbital view — camera above Earth, bottom third of globe visible
      const ep = getEarthParams();
      const targetR = ep.r * 1.8;  // orbit radius
      const targetH = ep.y + ep.r * 2.2;  // high above Earth
      const targetLookY = ep.y + ep.r * 0.7;  // look at top of Earth

      // Smooth lerp to orbital position
      orbitalCamR += (targetR - orbitalCamR) * 0.03;
      orbitalCamY += (targetH - orbitalCamY) * 0.03;
      orbitalLookY += (targetLookY - orbitalLookY) * 0.03;

      camera.position.x = Math.cos(orbitAngle) * orbitalCamR;
      camera.position.z = Math.sin(orbitAngle) * orbitalCamR;
      camera.position.y = orbitalCamY;
      camera.lookAt(0, orbitalLookY, 0);
    } else {
      // City orbit camera
      // Lerp back from orbital if we were just there
      orbitalCamR += (DIMS.cameraOrbitR - orbitalCamR) * 0.05;
      orbitalCamY += (DIMS.cameraHeight - orbitalCamY) * 0.05;

      const useR = Math.abs(orbitalCamR - DIMS.cameraOrbitR) > 10 ? orbitalCamR : DIMS.cameraOrbitR;
      const useY = Math.abs(orbitalCamY - DIMS.cameraHeight) > 5 ? orbitalCamY : DIMS.cameraHeight;

      camera.position.x = Math.cos(orbitAngle) * useR;
      camera.position.z = Math.sin(orbitAngle) * useR;
      camera.position.y = useY;
      const visFloors = getVisibleFloors();
      const visH = visFloors * 3.333 + 3.333 * 3; // floorH * floors + baseH
      const targetY = Math.min(visH * 0.15, 200); // look at base — tower extends off screen
      cameraLookY += (targetY - cameraLookY) * 0.05;
      orbitalLookY += (cameraLookY - orbitalLookY) * 0.05;
      camera.lookAt(0, Math.abs(orbitalLookY - cameraLookY) > 5 ? orbitalLookY : cameraLookY, 0);
    }

    // City update
    if (cityData) cityData.updateCity(t, camera.position);

    // Hover systems (skip in exterior and orbital views)
    if (frameCount % 3 === 0) {
      if (!extActive && !orbitalView) {
        updateBuildingHover(camera, mouseScreenX, mouseScreenY, isTransitionActive() && TRANSITION.phase < 4, t);
        updateTowerHover(camera, mouseScreenX, mouseScreenY);
      }
    }

    // Constellation lines fade — skip in exterior and orbital views
    if (!extActive && !orbitalView) updateConstellationLines();

    renderer.render(scene, camera);
  }
  animate();
}

function _startTransition(isNew) {
  autoRotate = false;
  orbitalView = false;

  const setOrbitAngle = (fn) => { orbitAngle = fn(orbitAngle); };

  // onEnterGame: fired when user clicks "Enter Tower" or walks to the door
  const onEnterGame = () => {
    document.dispatchEvent(new CustomEvent('enter-game', { detail: { isNew } }));
  };

  // Wire door interaction — pressing E at the door enters the tower
  setEnterDoorCallback(onEnterGame);
  if (cityData.semiWorkers) setGroundNPCs(cityData.semiWorkers);
  if (cityData.bizPeople) setBizPeople(cityData.bizPeople);
  if (cityData.doorLeft) setDoorMeshes(cityData.doorLeft, cityData.doorRight);

  playTransition(scene, camera, renderer, cityData, () => orbitAngle, setOrbitAngle, onEnterGame);
}

/**
 * Skip directly to exterior mode (used when returning from the sim).
 * Sets up the scene as if the forward transition had just completed.
 */
export function skipToExterior(placeAtDozer) {
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
  orbitalView = false;

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

  // Scale structural columns to match highest built floor (hide when zero)
  const fh = TC.floorH;
  const baseH = fh * 3;
  const fullH = baseH + TC.maxFloors * fh;
  const visH = baseH + Math.max(1, topBuilt) * fh;
  cityData.structColumns.forEach(c => {
    c.visible = topBuilt > 0;
    c.scale.y = visH / fullH;
    c.position.y = visH / 2;
  });

  // Foundation: show pad when zero floors, show stepped base when >= 1
  if (TC.foundationParts) TC.foundationParts.forEach(m => { m.visible = topBuilt > 0; });
  if (TC.padMesh) TC.padMesh.visible = topBuilt === 0;

  // Beam mesh: hide entirely when zero floors
  if (cityData.TC.group) {
    cityData.TC.group.children.forEach(child => {
      if (child.isInstancedMesh) child.visible = topBuilt > 0;
    });
  }

  // Register built-height callback so tower base appears when first floor is built
  setOnBuiltHeightChange((newTop) => {
    const fhC = TC.floorH, baseHC = fhC * 3, fullHC = baseHC + TC.maxFloors * fhC;
    const visHC = baseHC + Math.max(1, newTop) * fhC;
    // Foundation: stepped base vs flat pad
    if (TC.foundationParts) TC.foundationParts.forEach(m => { m.visible = newTop > 0; });
    if (TC.padMesh) TC.padMesh.visible = newTop === 0;
    // Structural columns
    cityData.structColumns.forEach(c => {
      c.visible = newTop > 0;
      c.scale.y = visHC / fullHC;
      c.position.y = visHC / 2;
    });
    // Instanced beam meshes
    if (TC.group) {
      TC.group.children.forEach(child => {
        if (child.isInstancedMesh) child.visible = newTop > 0;
      });
    }
    // Show/hide "Enter Tower" button
    const btn = document.getElementById('enter-tower-btn');
    if (btn) btn.style.display = newTop > 0 ? '' : 'none';
  });

  // Wire transition refs so reverse transition can access scene/camera/cityData
  const setOrbitAngle = (fn) => { orbitAngle = fn(orbitAngle); };
  setTransitionRefs(scene, camera, renderer, cityData, setOrbitAngle, null);

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
  if (cityData.doorLeft) setDoorMeshes(cityData.doorLeft, cityData.doorRight);

  // Wire floor-built callback so exterior builds sync to sim save + 3D tower
  setOnFloorBuilt((newTopBuilt) => {
    const TC = cityData.TC;
    // Advance sim buildout for newly built floor (stage 1 = funded)
    while (TC.buildout.length < newTopBuilt) TC.buildout.push(0);
    const fi = newTopBuilt - 1;
    if ((TC.buildout[fi] || 0) < 1) TC.buildout[fi] = 1;
    // Restore the new floor visually
    cityData.restoreTowerFloor(fi);
    TC.playerFloor = Math.max(0, fi);
    // Scale structural columns
    const fhC = TC.floorH, baseHC = fhC * 3, fullHC = baseHC + TC.maxFloors * fhC;
    const visHC = baseHC + Math.max(1, newTopBuilt) * fhC;
    cityData.structColumns.forEach(c => { c.scale.y = visHC / fullHC; c.position.y = visHC / 2; });
    cityData.applyPlayerLighting();
    // Update sim save
    _syncBuildoutToSave(TC.buildout);
  });

  // Spawn bulldozer only if unlocked (or dev dozer mode)
  let _dozerUnlocked = placeAtDozer;
  if (!_dozerUnlocked) {
    try {
      const _sv = localStorage.getItem('spacetower_v15');
      if (_sv) { const _sd = JSON.parse(_sv); _dozerUnlocked = _sd.bulldozer?.unlocked; }
    } catch {}
  }
  const dozer = _dozerUnlocked ? spawnBulldozer(scene) : null;
  spawnScaffolding(scene);

  // If dev dozer mode, place player next to the bulldozer
  if (placeAtDozer && dozer) {
    const dozerPos = dozer.getWorldPos();
    const pp = getPlayerPos();
    pp.set(dozerPos.x + 6, 0, dozerPos.z);
  }

  // Show arrival text, home button, and activate exterior
  showArrivalText(onEnterGame);
  // Hide "Enter Tower" button until at least 1 floor is built
  if (topBuilt < 1) {
    const btn = document.getElementById('enter-tower-btn');
    if (btn) btn.style.display = 'none';
  }
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
  document.removeEventListener('wheel', wheelHandler);
  document.removeEventListener('touchstart', touchStartHandler);
  document.removeEventListener('touchmove', touchMoveHandler);
  document.removeEventListener('touchend', touchEndHandler);

  renderer = null;
  scene = null;
  camera = null;
  cityData = null;
  tpCam = null;
}
