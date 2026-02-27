'use strict';
import * as THREE from 'three';
import { setSkyBlend } from './title-city.js';
import { showArrivalText, hideArrivalText, showHomeBtn, hideHomeBtn, fadeOutUI, fadeInUI, hideExteriorRadio, hideMovementHints } from './title-ui.js';
import { activateExterior, deactivateExterior } from './title-exterior.js';
import { setupRadio, disposeRadio } from '../radio-ui.js';

/**
 * Forward and reverse cinematic transitions between title menu and game entry.
 */

// ── Sky state ──
export const SKY = {
  state: 'night', blend: 0, targetBlend: 0, speed: 0.15,
  night: { bg: new THREE.Color(0x060810), fog: new THREE.Color(0x060810), fogDensity: 0.0018 },
  day: { bg: new THREE.Color(0x6ea8d4), fog: new THREE.Color(0x8cbde0), fogDensity: 0.0012 },
  transitionTo(t) { this.state = 'transitioning'; this.targetBlend = t === 'day' ? 1 : 0; },
  update(dt, scene) {
    if (this.state !== 'transitioning') return;
    this.blend += (this.targetBlend - this.blend) * this.speed * dt * 3;
    if (Math.abs(this.blend - this.targetBlend) < 0.001) {
      this.blend = this.targetBlend;
      this.state = this.targetBlend > 0.5 ? 'day' : 'night';
    }
    scene.background.copy(this.night.bg).lerp(this.day.bg, this.blend);
    scene.fog.color.copy(this.night.fog).lerp(this.day.fog, this.blend);
    scene.fog.density = this.night.fogDensity + (this.day.fogDensity - this.night.fogDensity) * this.blend;
    setSkyBlend(this.blend);
  }
};

// ── Transition state ──
export const TRANSITION = {
  active: false, phase: 0, elapsed: 0,
  startR: 260, targetR: 80, startH: 55, targetH: 12,
  dissolveFloor: 64, targetFloor: 9, lastDissolveFloor: 64
};

let _scene, _camera, _renderer, _cityData;
let _orbitAngleFn; // function to mutate orbit angle
let _onEnterGame = null;

/**
 * Play forward transition (menu → game entry).
 * onEnterGame is called when the user clicks "Enter Tower" after the cinematic.
 */
export function playTransition(scene, camera, renderer, cityData, getOrbitAngle, setOrbitAngle, onEnterGame) {
  _scene = scene; _camera = camera; _renderer = renderer; _cityData = cityData;
  _orbitAngleFn = setOrbitAngle;
  _onEnterGame = onEnterGame;

  const TC = cityData.TC;
  const DIMS = cityData.DIMS;

  TRANSITION.active = true;
  TRANSITION.phase = 1;
  TRANSITION.elapsed = 0;
  TRANSITION.dissolveFloor = TC.maxFloors - 1;
  TRANSITION.lastDissolveFloor = TC.maxFloors - 1;
  TRANSITION.startR = DIMS.cameraOrbitR;
  TRANSITION.startH = DIMS.cameraHeight;

  // Hide crane/elevator/extensions (keep structColumns visible for tower structure)
  cityData.craneParts.forEach(p => { p.visible = false; });
  if (cityData.elevMesh) cityData.elevMesh.visible = false;
  if (cityData.elevTrack) cityData.elevTrack.visible = false;
  cityData.extColumns.forEach(e => { e.visible = false; });

  // Fade out UI
  fadeOutUI();

  // After UI fades, begin camera + sky transition
  setTimeout(() => {
    TRANSITION.phase = 2;
    SKY.transitionTo('day');
  }, 1200);
}

/**
 * Called each frame from the main loop during transition.
 * Returns true if transition is active.
 */
export function updateTransition(dt, orbitAngle) {
  if (!TRANSITION.active) return false;
  TRANSITION.elapsed += dt;

  if (TRANSITION.phase >= 2 && TRANSITION.phase < 4) {
    const TC = _cityData.TC;
    const DIMS = _cityData.DIMS;
    const dur = 5;
    const t = Math.min(1, (TRANSITION.elapsed - 1.2) / dur);
    // Cubic ease in-out
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    DIMS.cameraOrbitR = TRANSITION.startR + (TRANSITION.targetR - TRANSITION.startR) * ease;
    DIMS.cameraHeight = TRANSITION.startH + (TRANSITION.targetH - TRANSITION.startH) * ease;

    if (_orbitAngleFn) _orbitAngleFn(a => a + 0.06 * dt);

    // Floor dissolve
    const totalToDissolve = (TC.maxFloors - 1) - TRANSITION.targetFloor;
    const floorsGone = Math.floor(ease * totalToDissolve);
    const currentVisible = (TC.maxFloors - 1) - floorsGone;
    while (TRANSITION.lastDissolveFloor > currentVisible && TRANSITION.lastDissolveFloor >= TRANSITION.targetFloor) {
      const fr = TC.floorMeshes[TRANSITION.lastDissolveFloor];
      if (fr && fr.beam) fr.beam.visible = false;
      _cityData.dissolveTowerFloor(TRANSITION.lastDissolveFloor);
      TRANSITION.lastDissolveFloor--;
    }
    TRANSITION.dissolveFloor = currentVisible;

    // Scale structural columns to match visible tower height
    const fh = TC.floorH;
    const baseH = fh * 3;
    const fullH = baseH + TC.maxFloors * fh;
    const visH = baseH + (currentVisible + 1) * fh;
    _cityData.structColumns.forEach(c => {
      c.scale.y = visH / fullH;
      c.position.y = visH / 2;
    });

    if (t >= 1) {
      TRANSITION.phase = 4;
      _cityData.applyPlayerLighting();
      showArrivalText(_onEnterGame);
      showHomeBtn(() => { playReverseTransition(); });
      setupRadio('#ext-radio');

      // Activate exterior gameplay after a brief delay
      setTimeout(() => { activateExterior(); }, 500);
    }
  }

  SKY.update(dt, _scene);
  return true;
}

// ── Reverse transition (game entry → back to menu) ──
const REVERSE = { active: false, elapsed: 0, dur: 5, startR: 80, startH: 12, targetR: 260, targetH: 55 };

export function playReverseTransition() {
  if (REVERSE.active || !TRANSITION.phase) return;
  deactivateExterior();
  REVERSE.active = true;
  REVERSE.elapsed = 0;
  REVERSE.startR = _cityData.DIMS.cameraOrbitR;
  REVERSE.startH = _cityData.DIMS.cameraHeight;

  hideHomeBtn();
  hideArrivalText();
  hideExteriorRadio();
  hideMovementHints();
  disposeRadio();
  SKY.transitionTo('night');
}

export function updateReverseTransition(dt, setZoom) {
  if (!REVERSE.active) return false;
  REVERSE.elapsed += dt;
  const TC = _cityData.TC;
  const DIMS = _cityData.DIMS;

  const t = Math.min(1, REVERSE.elapsed / REVERSE.dur);
  const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  DIMS.cameraOrbitR = REVERSE.startR + (REVERSE.targetR - REVERSE.startR) * ease;
  DIMS.cameraHeight = REVERSE.startH + (REVERSE.targetH - REVERSE.startH) * ease;

  if (_orbitAngleFn) _orbitAngleFn(a => a + 0.06 * dt);

  // Restore floors
  const totalToRestore = (TC.maxFloors - 1) - TRANSITION.targetFloor;
  const floorsRestored = Math.floor(ease * totalToRestore);
  const showUpTo = TRANSITION.targetFloor + floorsRestored;
  for (let fi = TRANSITION.targetFloor; fi <= showUpTo && fi < TC.floorMeshes.length; fi++) {
    const fr = TC.floorMeshes[fi];
    if (fr && fr.beam) fr.beam.visible = true;
    _cityData.restoreTowerFloor(fi);
  }
  TRANSITION.dissolveFloor = showUpTo;

  // Scale structural columns to match visible tower height
  const fh = TC.floorH;
  const baseH = fh * 3;
  const fullH = baseH + TC.maxFloors * fh;
  const visH = baseH + (showUpTo + 1) * fh;
  _cityData.structColumns.forEach(c => {
    c.scale.y = visH / fullH;
    c.position.y = visH / 2;
  });

  if (t >= 1) {
    REVERSE.active = false;
    TRANSITION.active = false;
    TRANSITION.phase = 0;

    // Restore all floors
    for (const fr of TC.floorMeshes) {
      if (fr && fr.beam) fr.beam.visible = true;
    }
    _cityData.restoreAllTowerFloors();
    // Restore crane, elevator, extensions
    _cityData.craneParts.forEach(p => { p.visible = true; });
    if (_cityData.elevMesh) _cityData.elevMesh.visible = true;
    if (_cityData.elevTrack) _cityData.elevTrack.visible = true;
    _cityData.extColumns.forEach(e => { e.visible = true; });

    // Restore columns to full height
    _cityData.structColumns.forEach(c => {
      c.scale.y = 1;
      c.position.y = fullH / 2;
    });

    // Reset zoom
    if (setZoom) setZoom(260);

    const zt = document.getElementById('zoom-toggle');
    if (zt) { zt.textContent = '\u25cb closer'; }

    // Fade in UI
    fadeInUI();
  }

  SKY.update(dt, _scene);
  return true;
}

export function isTransitionActive() {
  return TRANSITION.active || REVERSE.active;
}

export function getVisibleFloors() {
  if (!TRANSITION.active) return _cityData?.TC?.maxFloors || 65;
  return Math.max(10, TRANSITION.dissolveFloor + 1);
}
