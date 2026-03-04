'use strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildPlayer, buildConstructionSite } from './title-exterior.js';

/**
 * 3D city scene for the title screen.
 * Uses InstancedMesh + merged geometry for performance (~160 draw calls vs ~12,000).
 */

// ── Seeded RNG ──
let seed = 42;
function sr() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

// ── Config ──
// Scale factor: 12.5 (new tower 75 / old tower 6)
const S = 12.5;

// Shared tower geometry constants (imported by title-exterior.js for collision)
export const TOWER_WIDTH = 75;
export const TOWER_DEPTH = 75;
export const TOWER_FLOOR_H = 3.333;

const TC = {
  width: TOWER_WIDTH, depth: TOWER_DEPTH, floorH: TOWER_FLOOR_H, maxFloors: 600,
  litFloors: [], group: null, floorMeshes: [], playerFloor: 0
};
export const DIMS = { groundRadius: 3750, buildingRingR: 2250, treeRingR: 1250, cameraOrbitR: 3250, cameraHeight: 687 };

// ── Shared refs ──
const extColumns = [];
const structColumns = [];
const craneParts = [];
let cableMesh = null;
let elevMesh = null, elevTrack = null;
let elevFloor = 5, elevTarget = 5, elevWait = 3;
let doorLeft = null, doorRight = null;
const elevSpeed = 8;
const sats = [];

// ── Stars ──
let starPoints = null;
const starData = [];

// ── Tower beams (InstancedMesh — 1 draw call for all floor beams) ──
let towerBeamMesh = null;
const towerBeamData = []; // { idx, floorIdx, hidden, originalMatrix }

// ── Tower windows (InstancedMesh + built-in instanceColor) ──
let towerWinMesh = null;
const towerWinData = []; // { idx, floorIdx, toggled, wasHovered, litR, litG, litB, worldPos, hidden, originalMatrix }
const towerFlickerList = []; // { idx, baseBright, speed, phase, amt }

// ── Building windows (InstancedMesh + additive blending for hover glow) ──
let bldgHoverMesh = null;
const bldgWinData = []; // { idx, worldPos, baseBright }

// ── Building blink lights (red aviation LEDs on tall buildings) ──
let bldgBlinkMesh = null;
const bldgBlinkData = []; // { idx, phase }

// ── Vertex color helper (for merged geometry) ──
function _colorGeo(geo, color) {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  for (let i = 0; i < count; i++) {
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// ── Temp objects (reused) ──
const _obj = new THREE.Object3D();
const _zeroScale = new THREE.Matrix4().makeScale(0, 0, 0);
const _v3 = new THREE.Vector3();
const _c = new THREE.Color();

export function buildCityScene(scene, buildout) {
  // Reset module-level arrays to prevent double-population on re-entry
  extColumns.length = 0;
  structColumns.length = 0;
  craneParts.length = 0;
  cableMesh = null;
  elevMesh = null; elevTrack = null;
  doorLeft = null; doorRight = null;
  sats.length = 0;
  starPoints = null;
  starData.length = 0;
  towerBeamMesh = null;
  towerBeamData.length = 0;
  towerWinMesh = null;
  towerWinData.length = 0;
  towerFlickerList.length = 0;
  bldgHoverMesh = null;
  bldgWinData.length = 0;
  bldgBlinkMesh = null;
  bldgBlinkData.length = 0;
  TC.buildout = buildout || [];
  TC.litFloors = []; TC.group = null; TC.floorMeshes = [];
  vehicleState.semis.length = 0; vehicleState.semiWorkers.length = 0;
  vehicleState.bizPeople.length = 0; vehicleState.elapsed = 0;

  buildGround(scene);
  buildTower(scene);
  buildEntrance(scene);
  buildVehicles(scene);
  buildBuildings(scene);
  buildTrees(scene);
  buildStars(scene);
  buildCrane(scene);
  buildElevator(scene);
  buildTowerGlow(scene);

  // Exterior: player character + construction site
  buildPlayer(scene);
  buildConstructionSite(scene);

  // Earth globe (visible from orbital view)
  buildEarth(scene);

  function updateCity(t, cameraPos) {
    const dt = 1 / 60;
    updateStars(t);
    updateTowerWindowFlicker(t);
    updateBuildingBlink(t);
    updateVehicles(dt);
    updateTreeBillboards(cameraPos);
    if (cableMesh && cableMesh.visible) {
      const p = cableMesh.geometry.attributes.position.array;
      const sw = Math.sin(t * 0.35) * 18.75; // 1.5 × S
      p[3] = p[0] + sw; p[5] = sw * 0.5;
      cableMesh.geometry.attributes.position.needsUpdate = true;
    }
    updateElevator(dt);
    updateSats(scene, dt);
    if (earthMesh) earthMesh.rotation.y = t * 0.03;
    updateMoon(t);
  }

  return {
    updateCity,
    starMeshes: starPoints,
    starData,
    TC,
    DIMS,
    craneParts,
    extColumns,
    structColumns,
    elevMesh,
    elevTrack,
    cableMesh,
    sats,
    dissolveTowerFloor,
    restoreTowerFloor,
    restoreAllTowerFloors,
    applyPlayerLighting,
    getStarPoints() { return starPoints; },
    semiWorkers: vehicleState.semiWorkers,
    bizPeople: vehicleState.bizPeople,
    doorLeft,
    doorRight,
  };
}

// ═══ GROUND ═══
function buildGround(scene) {
  const g = new THREE.Mesh(new THREE.CircleGeometry(DIMS.groundRadius, 96), new THREE.MeshBasicMaterial({ color: 0x0e120a }));
  g.rotation.x = -Math.PI / 2; g.position.y = -0.1; scene.add(g);
  const g2 = new THREE.Mesh(new THREE.CircleGeometry(750, 64), new THREE.MeshBasicMaterial({ color: 0x12160e }));
  g2.rotation.x = -Math.PI / 2; scene.add(g2);
  const roadMat = new THREE.MeshBasicMaterial({ color: 0x1a1e24, side: THREE.DoubleSide });
  const roadW = 50; // road width
  // Outer ring (building ring) — raised to avoid z-fighting with ground plane
  const road = new THREE.Mesh(new THREE.RingGeometry(1850, 1900, 96), roadMat);
  road.rotation.x = -Math.PI / 2; road.position.y = 0.3; scene.add(road);
  // Inner ring (wraps around the tower)
  const innerR = TC.width / 2 + 80; // ~117.5 from center
  const road2 = new THREE.Mesh(new THREE.RingGeometry(innerR, innerR + roadW, 64), roadMat);
  road2.rotation.x = -Math.PI / 2; road2.position.y = 0.05; scene.add(road2);
  // Connecting spokes (4 roads from inner ring to outer ring)
  const spokeLen = 1875 - (innerR + roadW);
  const spokeMat = new THREE.MeshBasicMaterial({ color: 0x1a1e24 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4; // 45°, 135°, 225°, 315°
    const midR = innerR + roadW + spokeLen / 2;
    const spoke = new THREE.Mesh(new THREE.PlaneGeometry(roadW * 0.7, spokeLen), spokeMat);
    spoke.rotation.x = -Math.PI / 2;
    spoke.rotation.z = -angle;
    spoke.position.set(Math.cos(angle) * midR, 0.05, Math.sin(angle) * midR);
    scene.add(spoke);
  }
}

// ═══ TOWER (perimeter scaffold beams, open center elevator shaft, instanced windows + walls) ═══
export const BEAM_DEPTH = 0.5; // depth of perimeter beams (walkable width)

function buildTower(scene) {
  const tw = TC.width, td = TC.depth, fh = TC.floorH, nf = TC.maxFloors;
  const totalH = nf * fh, baseH = fh * 3;
  TC.group = new THREE.Group();
  seed = 999;

  // Determine lit floors — first 10 from buildout, rest random for title screen
  TC.litFloors = [];
  for (let i = 0; i < nf; i++) {
    if (i < 10) {
      TC.litFloors.push((TC.buildout[i] || 0) >= 2);
    } else {
      const ch = i < 12 ? 0.9 : i < 25 ? 0.75 : i < 40 ? 0.5 : i < 55 ? 0.25 : 0.05;
      TC.litFloors.push(sr() < ch);
    }
  }

  // ── Foundation with vestibule interior ──
  const vestW = 20, vestD = 15;
  const doorH = baseH * 0.75, doorW = 6;
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x1a1e28 });
  const vestMat = new THREE.MeshBasicMaterial({ color: 0x0e1218 });

  // Back section: full width, stops before vestibule
  const backD = td - vestD;
  const backSec = new THREE.Mesh(new THREE.BoxGeometry(tw, baseH, backD), baseMat);
  backSec.position.set(0, baseH / 2, -vestD / 2); TC.group.add(backSec);

  // Left section: fills +Z zone left of vestibule opening
  const sideW = (tw - vestW) / 2;
  const leftSec = new THREE.Mesh(new THREE.BoxGeometry(sideW, baseH, vestD), baseMat);
  leftSec.position.set(-(vestW / 2 + sideW / 2), baseH / 2, td / 2 - vestD / 2); TC.group.add(leftSec);

  // Right section
  const rightSec = new THREE.Mesh(new THREE.BoxGeometry(sideW, baseH, vestD), baseMat);
  rightSec.position.set(vestW / 2 + sideW / 2, baseH / 2, td / 2 - vestD / 2); TC.group.add(rightSec);

  // Top section: above vestibule opening
  const topH = baseH - doorH;
  const topSec = new THREE.Mesh(new THREE.BoxGeometry(vestW, topH, vestD), baseMat);
  topSec.position.set(0, doorH + topH / 2, td / 2 - vestD / 2); TC.group.add(topSec);

  // ── Vestibule interior walls (slightly different shade for depth) ──
  const vBack = new THREE.Mesh(new THREE.PlaneGeometry(vestW, doorH), vestMat);
  vBack.position.set(0, doorH / 2, td / 2 - vestD + 0.05); TC.group.add(vBack);

  const vLeftWall = new THREE.Mesh(new THREE.PlaneGeometry(vestD, doorH), vestMat);
  vLeftWall.rotation.y = Math.PI / 2;
  vLeftWall.position.set(-vestW / 2 + 0.05, doorH / 2, td / 2 - vestD / 2); TC.group.add(vLeftWall);

  const vRightWall = new THREE.Mesh(new THREE.PlaneGeometry(vestD, doorH), vestMat);
  vRightWall.rotation.y = -Math.PI / 2;
  vRightWall.position.set(vestW / 2 - 0.05, doorH / 2, td / 2 - vestD / 2); TC.group.add(vRightWall);

  const vCeil = new THREE.Mesh(new THREE.PlaneGeometry(vestW, vestD), vestMat);
  vCeil.rotation.x = Math.PI / 2;
  vCeil.position.set(0, doorH - 0.05, td / 2 - vestD / 2); TC.group.add(vCeil);

  const vFloorMat = new THREE.MeshBasicMaterial({ color: 0x151a22 });
  const vFloor = new THREE.Mesh(new THREE.PlaneGeometry(vestW, vestD), vFloorMat);
  vFloor.rotation.x = -Math.PI / 2;
  vFloor.position.set(0, 0.05, td / 2 - vestD / 2); TC.group.add(vFloor);

  // ── Industrial pendant lights (work-zone feel) ──
  const lightFixMat = new THREE.MeshBasicMaterial({ color: 0xffe8b0 });
  const lightWireMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const lightGlowFloor = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.25 });
  const lightCeilGlow = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.15 });
  const nLights = 4, lightSpace = vestD / (nLights + 1);
  for (let li = 0; li < nLights; li++) {
    const lz = td / 2 - vestD + lightSpace * (li + 1);
    // Wire
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), lightWireMat);
    wire.position.set(0, doorH - 0.3, lz); TC.group.add(wire);
    // Fixture housing
    const fix = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 1.4), lightFixMat);
    fix.position.set(0, doorH - 0.8, lz); TC.group.add(fix);
    // Ceiling glow halo
    const cGlow = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), lightCeilGlow.clone());
    cGlow.rotation.x = Math.PI / 2;
    cGlow.position.set(0, doorH - 0.06, lz); TC.group.add(cGlow);
    // Floor glow patch
    const fGlow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), lightGlowFloor.clone());
    fGlow.rotation.x = -Math.PI / 2;
    fGlow.position.set(0, 0.06, lz); TC.group.add(fGlow);
  }

  // ── Doors (narrower, more door-like) ──
  const doorMat = new THREE.MeshBasicMaterial({ color: 0x2a2e3a });
  const doorGlowMat = new THREE.MeshBasicMaterial({ color: 0xdcbe82, transparent: true, opacity: 0.15 });
  const doorFrameMat = new THREE.MeshBasicMaterial({ color: 0x323846 });
  const doorHandleMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
  for (const side of [-4.5, 4.5]) {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), doorMat);
    door.position.set(side, doorH / 2, td / 2 + 0.2); TC.group.add(door);
    // Subtle glow behind each door
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 0.85, doorH * 0.9), doorGlowMat.clone());
    glow.position.set(side, doorH / 2, td / 2 + 0.15); TC.group.add(glow);
    // Door handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), doorHandleMat);
    handle.position.set(side + (side < 0 ? doorW / 2 - 0.8 : -doorW / 2 + 0.8), doorH * 0.45, td / 2 + 0.35);
    TC.group.add(handle);
    if (side < 0) doorLeft = door; else doorRight = door;
  }
  // Door frame
  const frameW = doorW * 2 + 5;
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(frameW, 1.2, 0.8), doorFrameMat);
  frameTop.position.set(0, doorH + 0.6, td / 2 + 0.2); TC.group.add(frameTop);
  // Frame sides
  for (const sx of [-(frameW / 2 - 0.4), frameW / 2 - 0.4]) {
    const frameSide = new THREE.Mesh(new THREE.BoxGeometry(0.8, doorH, 0.8), doorFrameMat);
    frameSide.position.set(sx, doorH / 2, td / 2 + 0.2); TC.group.add(frameSide);
  }
  // Transom window above doors
  const transom = new THREE.Mesh(new THREE.PlaneGeometry(frameW - 2, 3), new THREE.MeshBasicMaterial({ color: 0xdcbe82, transparent: true, opacity: 0.25 }));
  transom.position.set(0, doorH + 3, td / 2 + 0.3); TC.group.add(transom);

  // Corner columns
  const colThick = 3.125; // 0.25 × S
  const colGeo = new THREE.BoxGeometry(colThick, totalH + baseH, colThick);
  const colMat = new THREE.MeshBasicMaterial({ color: 0x252a3a });
  const hw = tw / 2, hd = td / 2;
  [[-hw, -hd], [-hw, hd], [hw, -hd], [hw, hd]].forEach(([px, pz]) => {
    const c = new THREE.Mesh(colGeo, colMat);
    c.position.set(px, (totalH + baseH) / 2, pz);
    TC.group.add(c); structColumns.push(c);
  });

  // Floor beams → InstancedMesh (1 draw call instead of 260 groups)
  const beamH = 1.5; // 0.12 × S
  const halfBeam = BEAM_DEPTH / 2;
  const beamCount = nf * 4; // 65 floors × 4 beams = 260
  // Use a unit box, scale per-instance
  const nsBeamGeo = new THREE.BoxGeometry(1, 1, 1);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x2a3048 });
  towerBeamMesh = new THREE.InstancedMesh(nsBeamGeo, beamMat, beamCount);
  towerBeamMesh.frustumCulled = false;

  let beamIdx = 0;
  for (let fi = 0; fi < nf; fi++) {
    const fy = baseH + fi * fh;
    // N beam (z = -hd)
    _obj.position.set(0, fy, -hd);
    _obj.rotation.set(0, 0, 0);
    _obj.scale.set(tw + BEAM_DEPTH, beamH, BEAM_DEPTH);
    _obj.updateMatrix();
    towerBeamMesh.setMatrixAt(beamIdx, _obj.matrix);
    towerBeamData.push({ idx: beamIdx, floorIdx: fi, hidden: false, originalMatrix: _obj.matrix.clone() });
    beamIdx++;
    // S beam (z = +hd)
    _obj.position.set(0, fy, hd);
    _obj.rotation.set(0, 0, 0);
    _obj.scale.set(tw + BEAM_DEPTH, beamH, BEAM_DEPTH);
    _obj.updateMatrix();
    towerBeamMesh.setMatrixAt(beamIdx, _obj.matrix);
    towerBeamData.push({ idx: beamIdx, floorIdx: fi, hidden: false, originalMatrix: _obj.matrix.clone() });
    beamIdx++;
    // E beam (x = +hw)
    _obj.position.set(hw, fy, 0);
    _obj.rotation.set(0, 0, 0);
    _obj.scale.set(BEAM_DEPTH, beamH, td + BEAM_DEPTH);
    _obj.updateMatrix();
    towerBeamMesh.setMatrixAt(beamIdx, _obj.matrix);
    towerBeamData.push({ idx: beamIdx, floorIdx: fi, hidden: false, originalMatrix: _obj.matrix.clone() });
    beamIdx++;
    // W beam (x = -hw)
    _obj.position.set(-hw, fy, 0);
    _obj.rotation.set(0, 0, 0);
    _obj.scale.set(BEAM_DEPTH, beamH, td + BEAM_DEPTH);
    _obj.updateMatrix();
    towerBeamMesh.setMatrixAt(beamIdx, _obj.matrix);
    towerBeamData.push({ idx: beamIdx, floorIdx: fi, hidden: false, originalMatrix: _obj.matrix.clone() });
    beamIdx++;

    // Track floor index for dissolve (no separate beam group needed)
    TC.floorMeshes.push({ beamStartIdx: (fi * 4), beamCount: 4 });
  }
  towerBeamMesh.instanceMatrix.needsUpdate = true;
  TC.group.add(towerBeamMesh);

  // Tower windows → InstancedMesh (10 per face, original warm-glass style)
  const winCount = nf * 4 * 10; // 600 floors × 4 faces × 10 windows = 24,000
  const segW = tw / 10;
  const winGeo = new THREE.PlaneGeometry(segW * 0.85, fh * 0.8);
  const towerWinMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide
  });
  towerWinMesh = new THREE.InstancedMesh(winGeo, towerWinMat, winCount);
  towerWinMesh.frustumCulled = false;

  const faces = [
    { axis: 'z', dir: 1, w: tw }, { axis: 'z', dir: -1, w: tw },
    { axis: 'x', dir: 1, w: td }, { axis: 'x', dir: -1, w: td }
  ];
  let winIdx = 0;
  for (let fi = 0; fi < nf; fi++) {
    const fy = baseH + fi * fh;
    const lit = TC.litFloors[fi];
    for (const face of faces) {
      const fSegW = face.w / 10;
      for (let wi = 0; wi < 10; wi++) {
        const wLit = lit && sr() < 0.8;
        const bright = sr() * 0.5 + 0.4;

        let r, g, b;
        if (wLit) {
          r = (180 + bright * 60 | 0) / 255;
          g = (140 + bright * 40 | 0) / 255;
          b = (70 + bright * 25 | 0) / 255;
        } else {
          r = 0x14 / 255; g = 0x18 / 255; b = 0x20 / 255;
        }

        _c.setRGB(r, g, b);
        towerWinMesh.setColorAt(winIdx, _c);

        const off = -face.w / 2 + fSegW * (wi + 0.5);
        const yp = fy + fh * 0.5;
        if (face.axis === 'z') {
          _obj.position.set(off, yp, face.dir * (td / 2 + halfBeam + 0.01));
          _obj.rotation.set(0, face.dir < 0 ? Math.PI : 0, 0);
        } else {
          _obj.position.set(face.dir * (tw / 2 + halfBeam + 0.01), yp, off);
          _obj.rotation.set(0, face.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        }
        _obj.scale.set(1, 1, 1);
        _obj.updateMatrix();
        towerWinMesh.setMatrixAt(winIdx, _obj.matrix);

        const litR = wLit ? r : 0xdc / 255;
        const litG = wLit ? g : 0xbe / 255;
        const litB = wLit ? b : 0x82 / 255;
        towerWinData.push({
          idx: winIdx, floorIdx: fi, toggled: wLit, wasHovered: false,
          litR, litG, litB,
          worldPos: _obj.position.clone(),
          hidden: false, originalMatrix: _obj.matrix.clone()
        });

        if (wLit) {
          towerFlickerList.push({
            idx: winIdx, baseBright: bright,
            speed: sr() * 2 + 0.5, phase: sr() * Math.PI * 2, amt: sr() * 0.12
          });
        }
        winIdx++;
      }
    }
  }

  towerWinMesh.instanceMatrix.needsUpdate = true;
  if (towerWinMesh.instanceColor) towerWinMesh.instanceColor.needsUpdate = true;
  TC.group.add(towerWinMesh);

  // Extension columns
  const extH = 500; // 40 × S
  const extMat = new THREE.MeshBasicMaterial({ color: 0x1e2230, transparent: true, opacity: 0.15 });
  const extGeo = new THREE.BoxGeometry(1.875, extH, 1.875); // 0.15 × S
  [[-hw, -hd], [-hw, hd], [hw, -hd], [hw, hd]].forEach(([px, pz]) => {
    const e = new THREE.Mesh(extGeo, extMat);
    e.position.set(px, totalH + baseH + extH / 2, pz);
    TC.group.add(e); extColumns.push(e);
  });

  scene.add(TC.group);
}

// ═══ ENTRANCE ═══
function buildEntrance(scene) {
  const td = TC.depth;
  // Walkway from building ring to tower doors — flat, ground-level
  const pathW = 31.25, pathLen = DIMS.buildingRingR - td / 2;
  const path = new THREE.Mesh(new THREE.PlaneGeometry(pathW, pathLen), new THREE.MeshBasicMaterial({ color: 0x1e2228 }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, td / 2 + pathLen / 2); scene.add(path);
  const borderMat = new THREE.MeshBasicMaterial({ color: 0x282e38 });
  for (const side of [-1, 1]) {
    const border = new THREE.Mesh(new THREE.PlaneGeometry(1.875, pathLen), borderMat);
    border.rotation.x = -Math.PI / 2; border.position.set(side * pathW / 2, 0.03, td / 2 + pathLen / 2); scene.add(border);
  }
}

// ═══ VEHICLES & BUSINESS PEOPLE ═══
const vehicleState = { semis: [], bizPeople: [], semiWorkers: [], elapsed: 0 };

function buildVehicles(scene) {
  const innerR = TC.width / 2 + 80;
  const roadMidR = innerR + 25;

  // ── 2 semi trucks + 4 workers + 12 crates → 1 merged mesh ──
  const semiPositions = [
    { x: -60, z: -(innerR + 25), angle: Math.PI * 0.5 },
    { x: 40, z: -(innerR + 25), angle: Math.PI * 0.5 },
  ];
  const semiWorkerNames = ['Garcia', 'Tanaka', 'Novak', 'Osei'];
  const semiWorkerDialogue = [
    ['Got another shipment of I-beams.', 'You know how many bolts are in one floor? Thousands.', 'This tower eats steel like nothing I\'ve seen.'],
    ['Hey, careful with those. They\'re load-bearing.', 'We run three trucks a day up here.', 'Back when it was five floors, one truck was enough.'],
    ['Manifest says forty crates.', 'Half of this is insulation. Other half is hope.', 'My kids think I deliver pizza. Close enough.'],
    ['Forklift\'s down again.', 'We\'re doing this the old-fashioned way today.', 'At least the weather\'s holding. Rain makes everything heavier.'],
  ];
  const mergedSemiGeos = [];
  let workerIdx = 0;

  semiPositions.forEach((sp) => {
    // Build a rotation matrix for the semi's orientation
    const rot = new THREE.Matrix4().makeRotationY(sp.angle);
    const pos = new THREE.Matrix4().makeTranslation(sp.x, 0, sp.z);
    const semiWorld = pos.multiply(rot);

    // Cab
    const cabGeo = _colorGeo(new THREE.BoxGeometry(4, 3.5, 6), 0x4a5568);
    cabGeo.translate(0, 1.75, 3); cabGeo.applyMatrix4(semiWorld); mergedSemiGeos.push(cabGeo);
    // Cab window (opaque approximation at distance)
    const cabWinGeo = _colorGeo(new THREE.BoxGeometry(3.5, 1.8, 0.05), 0x5a8aaa);
    cabWinGeo.translate(0, 2.8, 6.01); cabWinGeo.applyMatrix4(semiWorld); mergedSemiGeos.push(cabWinGeo);
    // Trailer
    const trailerGeo = _colorGeo(new THREE.BoxGeometry(4.5, 4, 14), 0x6a7080);
    trailerGeo.translate(0, 2, -5); trailerGeo.applyMatrix4(semiWorld); mergedSemiGeos.push(trailerGeo);
    // Wheels
    [1, -3, -9, -11].forEach(wz => {
      const wGeo = _colorGeo(new THREE.BoxGeometry(4.8, 1, 1), 0x1a1a1a);
      wGeo.translate(0, 0.5, wz); wGeo.applyMatrix4(semiWorld); mergedSemiGeos.push(wGeo);
    });

    // Workers beside each semi
    for (let wi = 0; wi < 2; wi++) {
      const wx = sp.x + (wi === 0 ? -8 : 8);
      const wz = sp.z - 2;
      const wRot = wi === 0 ? -Math.PI / 2 : Math.PI / 2;
      const wMat = new THREE.Matrix4().makeTranslation(wx, 0, wz).multiply(new THREE.Matrix4().makeRotationY(wRot));
      // Worker figure parts (inline, no _makeWorkerFigure needed)
      const parts = [
        [new THREE.BoxGeometry(0.22, 0.24, 0.14), 0xFF6600, 0, 0.45, 0],   // vest torso
        [new THREE.BoxGeometry(0.14, 0.14, 0.14), 0xd4a878, 0, 0.68, 0],   // head
        [new THREE.BoxGeometry(0.18, 0.06, 0.18), 0xFFD700, 0, 0.78, 0],   // hat
        [new THREE.BoxGeometry(0.08, 0.18, 0.08), 0xd4a878, -0.15, 0.42, 0], // left arm
        [new THREE.BoxGeometry(0.08, 0.18, 0.08), 0xd4a878, 0.15, 0.42, 0],  // right arm
        [new THREE.BoxGeometry(0.08, 0.18, 0.09), 0x3a5070, -0.06, 0.18, 0], // left leg
        [new THREE.BoxGeometry(0.08, 0.18, 0.09), 0x3a5070, 0.06, 0.18, 0],  // right leg
        [new THREE.BoxGeometry(0.09, 0.07, 0.11), 0x5a4030, -0.06, 0.04, 0.01], // left boot
        [new THREE.BoxGeometry(0.09, 0.07, 0.11), 0x5a4030, 0.06, 0.04, 0.01],  // right boot
      ];
      for (const [geo, col, px, py, pz] of parts) {
        _colorGeo(geo, col);
        geo.translate(px, py, pz);
        geo.applyMatrix4(wMat);
        mergedSemiGeos.push(geo);
      }
      // Crates
      for (let ci = 0; ci < 3; ci++) {
        const crateGeo = _colorGeo(new THREE.BoxGeometry(0.5, 0.35, 0.4), 0x6a5030);
        crateGeo.translate(wx + (wi === 0 ? -1.5 : 1.5), 0.175 + ci * 0.36, wz + (ci - 1) * 0.5);
        mergedSemiGeos.push(crateGeo);
      }
      vehicleState.semiWorkers.push({
        name: semiWorkerNames[workerIdx],
        dialogue: semiWorkerDialogue[workerIdx],
        ci: 0, wx, wz,
      });
      workerIdx++;
    }
  });
  if (mergedSemiGeos.length) {
    const merged = mergeGeometries(mergedSemiGeos, false);
    scene.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true })));
    mergedSemiGeos.forEach(g => g.dispose());
  }

  // ── Business people: 6 people with insane personalities ──
  const bizData = [
    { name: 'Vanessa Crowe', color: 0x2a2e3a, carColor: 0x2a2a2a,
      dialogue: ['Do you know what I see when I look at this tower? VERTICAL REAL ESTATE.', 'I\'m putting a juice bar on every floor. Cold-pressed. Astronaut-grade.', 'My investors said I was crazy. I said honey, crazy is a BRAND.'] },
    { name: 'Maximilian Tusk', color: 0x3a3e4a, carColor: 0x3a3a4a,
      dialogue: ['I\'ve been circling this tower for WEEKS. The zoning potential is OBSCENE.', 'Floor 6 could be a co-working space. Floor 7, a cryptocurrency lounge.', 'When this thing reaches orbit, the tax implications alone will make me weep with joy.'] },
    { name: 'Delphine Glass', color: 0x1a2030, carColor: 0x1a1a2a,
      dialogue: ['I represent seventeen venture capital firms and they ALL want in.', 'We\'re calling it SpaceTowerCoin. No, wait — TowerDAO. No — BOTH.', 'Every floor is a startup incubator. Every window is a billboard. I can SMELL the revenue.'] },
    { name: 'Chester Beaumont III', color: 0x40444a, carColor: 0x4a4a5a,
      dialogue: ['My family has invested in every great structure. The Pyramids. The Chunnel. This is NEXT.', 'I\'ve already trademarked "Space Tower" for a perfume line. And a sandwich.', 'The penthouse suite will have a butler who is also a rocket scientist. I\'ve placed the ad.'] },
    { name: 'Suki Neon', color: 0x303848, carColor: 0x2a3040,
      dialogue: ['Pop-up nightclub. Floor 8. Zero gravity dance floor. Are you HEARING me?', 'The DJ booth will literally be in space. The bass drops will cause ORBITAL DECAY.', 'I need 40,000 square feet of LED panels and a liquor license that works in the mesosphere.'] },
    { name: 'Reginald Flux', color: 0x2e3240, carColor: 0x404050,
      dialogue: ['I\'m installing a revolving restaurant that spins so fast you lose your appetite. GENIUS.', 'My business model is simple: charge people to look DOWN at Earth. Premium melancholy.', 'I\'ve run the numbers. Sadness at altitude is a 14 billion dollar market.'] },
    { name: 'Priya Argent', color: 0x2a3448, carColor: 0x3a3a48,
      dialogue: ['I\'m scouting this for the world\'s first vertical marathon. Staircase only. No elevator. PURITY.', 'Every floor gets a hydration station and a motivational hologram. The holograms CRY if you stop.', 'Registration is already open. Five thousand runners. In SPACE. Insurance said no but I said YES.'] },
    { name: 'Wendell Brink', color: 0x34384a, carColor: 0x2e2e3a,
      dialogue: ['I want to put a golf course on floor 9. A REAL one. Eighteen holes. In a tower.', 'The ball trajectory in low gravity is going to be MAGNIFICENT. I\'ve done the math on a napkin.', 'My caddy will need a spacesuit. I\'ve already designed the polo shirt. It has FLAMES.'] },
  ];
  const vcMat = new THREE.MeshBasicMaterial({ vertexColors: true });

  for (let i = 0; i < bizData.length; i++) {
    const bd = bizData[i];
    // Merge person parts into 1 vertex-colored mesh
    const personParts = [
      [new THREE.BoxGeometry(0.22, 0.28, 0.14), bd.color, 0, 0.50, 0],
      [new THREE.BoxGeometry(0.14, 0.14, 0.14), 0xd4a574, 0, 0.75, 0],
      [new THREE.BoxGeometry(0.08, 0.20, 0.09), bd.color, -0.06, 0.20, 0],
      [new THREE.BoxGeometry(0.08, 0.20, 0.09), bd.color, 0.06, 0.20, 0],
      [new THREE.BoxGeometry(0.07, 0.22, 0.07), bd.color, -0.15, 0.46, 0],
      [new THREE.BoxGeometry(0.07, 0.22, 0.07), bd.color, 0.15, 0.46, 0],
      [new THREE.BoxGeometry(0.18, 0.12, 0.04), 0x3a2a1a, 0.18, 0.30, 0],
      [new THREE.BoxGeometry(0.09, 0.06, 0.12), 0x1a1a1a, -0.06, 0.03, 0.01],
      [new THREE.BoxGeometry(0.09, 0.06, 0.12), 0x1a1a1a, 0.06, 0.03, 0.01],
    ];
    const pGeos = personParts.map(([geo, col, x, y, z]) => { _colorGeo(geo, col); geo.translate(x, y, z); return geo; });
    const bizMesh = new THREE.Mesh(mergeGeometries(pGeos, false), vcMat);
    bizMesh.visible = false;
    scene.add(bizMesh);
    pGeos.forEach(g => g.dispose());

    // Merge car parts into 1 vertex-colored mesh
    const carParts = [
      [new THREE.BoxGeometry(3, 1.5, 6), bd.carColor, 0, 0.9, 0],
      [new THREE.BoxGeometry(2.6, 1.0, 3.2), bd.carColor, 0, 1.9, -0.2],
      [new THREE.BoxGeometry(2.4, 0.8, 0.05), 0x5a8aaa, 0, 1.9, 1.41],   // front window (opaque)
      [new THREE.BoxGeometry(2.4, 0.8, 0.05), 0x5a8aaa, 0, 1.9, -1.81],  // rear window (opaque)
      [new THREE.BoxGeometry(3.2, 0.7, 0.8), 0x1a1a1a, 0, 0.4, 1.8],
      [new THREE.BoxGeometry(3.2, 0.7, 0.8), 0x1a1a1a, 0, 0.4, -1.8],
    ];
    const cGeos = carParts.map(([geo, col, x, y, z]) => { _colorGeo(geo, col); geo.translate(x, y, z); return geo; });
    const carMesh = new THREE.Mesh(mergeGeometries(cGeos, false), vcMat);
    carMesh.visible = false;
    scene.add(carMesh);
    cGeos.forEach(g => g.dispose());

    const approachAngle = Math.PI * 0.3 + (i / bizData.length) * Math.PI * 1.4;
    const parkAngle = Math.PI / 2 + (i - 4) * 0.06;
    const parkX = Math.cos(parkAngle) * roadMidR;
    const parkZ = Math.sin(parkAngle) * roadMidR;

    // Precompute driving route along roads: spoke → inner ring arc → parking spot
    const route = _buildDriveRoute(approachAngle, parkAngle, parkX, parkZ, roadMidR);

    vehicleState.bizPeople.push({
      group: bizMesh, car: carMesh, approachAngle, parkAngle, parkX, parkZ, route,
      name: bd.name, dialogue: bd.dialogue, ci: 0,
      startTime: i * 25, cycleLen: 110, phase: 'waiting',
    });
  }
}

// ── Route building: cars follow spoke roads then inner ring ──
const SPOKE_ANGLES = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
const OUTER_ROAD_R = 1875;
const INNER_ROAD_R = TC.width / 2 + 80 + 25; // middle of inner ring road

function _buildDriveRoute(approachAngle, parkAngle, parkX, parkZ, roadMidR) {
  // Find nearest spoke to approach angle
  let nearestSpoke = SPOKE_ANGLES[0];
  let minDiff = Math.PI * 2;
  for (const sa of SPOKE_ANGLES) {
    let diff = Math.abs(approachAngle - sa);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < minDiff) { minDiff = diff; nearestSpoke = sa; }
  }

  const pts = [];

  // Segment 1: start at spoke top (outer ring)
  pts.push({ x: Math.cos(nearestSpoke) * OUTER_ROAD_R, z: Math.sin(nearestSpoke) * OUTER_ROAD_R });

  // Segment 2: spoke bottom (inner ring)
  pts.push({ x: Math.cos(nearestSpoke) * INNER_ROAD_R, z: Math.sin(nearestSpoke) * INNER_ROAD_R });

  // Segment 3: arc along inner ring from spoke to parking angle
  let arcDelta = parkAngle - nearestSpoke;
  while (arcDelta > Math.PI) arcDelta -= Math.PI * 2;
  while (arcDelta < -Math.PI) arcDelta += Math.PI * 2;
  const arcSteps = Math.max(2, Math.ceil(Math.abs(arcDelta) / (Math.PI / 12)));
  for (let j = 1; j <= arcSteps; j++) {
    const a = nearestSpoke + arcDelta * (j / arcSteps);
    pts.push({ x: Math.cos(a) * roadMidR, z: Math.sin(a) * roadMidR });
  }

  // Final: parking spot
  pts.push({ x: parkX, z: parkZ });

  // Calculate cumulative distances
  let totalDist = 0;
  const dists = [0];
  for (let j = 1; j < pts.length; j++) {
    const dx = pts[j].x - pts[j - 1].x;
    const dz = pts[j].z - pts[j - 1].z;
    totalDist += Math.sqrt(dx * dx + dz * dz);
    dists.push(totalDist);
  }

  return { pts, dists, totalDist };
}

function _sampleRoute(route, p) {
  const targetDist = Math.max(0, Math.min(1, p)) * route.totalDist;
  for (let j = 1; j < route.pts.length; j++) {
    if (route.dists[j] >= targetDist) {
      const segLen = route.dists[j] - route.dists[j - 1];
      const segP = segLen > 0 ? (targetDist - route.dists[j - 1]) / segLen : 0;
      const a = route.pts[j - 1], b = route.pts[j];
      return {
        x: a.x + (b.x - a.x) * segP,
        z: a.z + (b.z - a.z) * segP,
        angle: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
  }
  const last = route.pts[route.pts.length - 1];
  return { x: last.x, z: last.z, angle: 0 };
}

function updateVehicles(dt) {
  vehicleState.elapsed += dt;
  const t = vehicleState.elapsed;
  const totalCycle = 200;

  const towerFrontZ = TC.depth / 2 + 12;
  const DRIVE_SPEED = 80; // units per second (along road)

  for (const bp of vehicleState.bizPeople) {
    const localT = ((t - bp.startTime) % totalCycle + totalCycle) % totalCycle;
    const cl = bp.cycleLen;

    if (localT >= cl) {
      bp.group.visible = false;
      bp.car.visible = false;
      bp.phase = 'waiting';
      continue;
    }

    // Compute drive times from route distance and speed
    const driveInTime = bp.route.totalDist / DRIVE_SPEED;
    const driveOutTime = bp.route.totalDist / (DRIVE_SPEED * 1.3); // slightly faster leaving

    // Dynamic timeline based on route length
    const T_DRIVE_IN = driveInTime;                      // ~22s
    const T_PARK = T_DRIVE_IN + 2;                       // +2s
    const T_WALK = T_PARK + 30;                          // +30s
    const T_NOTE = T_WALK + 15;                          // +15s
    const T_BACK = T_NOTE + 23;                          // +23s
    const T_GETIN = T_BACK + 2;                          // +2s
    const T_DRIVEOUT = T_GETIN + driveOutTime;           // ~17s

    bp.car.visible = true;

    if (localT < T_DRIVE_IN) {
      // Drive in along road route
      bp.phase = 'driving_in';
      bp.group.visible = false;
      const p = localT / T_DRIVE_IN;
      // Ease: slow start, cruise, slow at end
      const ease = p < 0.1 ? p * p * 50 : p > 0.9 ? 1 - (1 - p) * (1 - p) * 50 : p;
      const pos = _sampleRoute(bp.route, ease);
      bp.car.position.set(pos.x, 0.3, pos.z);
      bp.car.rotation.y = pos.angle;
    } else if (localT < T_PARK) {
      bp.phase = 'parked';
      bp.car.position.set(bp.parkX, 0.3, bp.parkZ);
      bp.group.visible = true;
      bp.group.position.set(bp.parkX + 5, 0, bp.parkZ);
      bp.group.rotation.y = Math.atan2(-bp.parkX, towerFrontZ - bp.parkZ);
    } else if (localT < T_WALK) {
      bp.phase = 'walking_to';
      bp.group.visible = true;
      const p = (localT - T_PARK) / 30;
      const destX = (bp.parkAngle - Math.PI / 2) * 8;
      bp.group.position.set((bp.parkX + 5) * (1 - p) + destX * p, 0, bp.parkZ * (1 - p) + towerFrontZ * p);
      bp.group.rotation.y = Math.atan2(destX - bp.parkX, towerFrontZ - bp.parkZ);
    } else if (localT < T_NOTE) {
      bp.phase = 'noting';
      bp.group.visible = true;
      const destX = (bp.parkAngle - Math.PI / 2) * 8;
      bp.group.position.set(destX, 0, towerFrontZ);
      bp.group.rotation.y = Math.PI;
      bp.group.position.y = Math.sin(localT * 2) * 0.015;
    } else if (localT < T_BACK) {
      bp.phase = 'walking_back';
      bp.group.visible = true;
      const p = (localT - T_NOTE) / 23;
      const destX = (bp.parkAngle - Math.PI / 2) * 8;
      bp.group.position.set(destX * (1 - p) + (bp.parkX + 5) * p, 0, towerFrontZ * (1 - p) + bp.parkZ * p);
      bp.group.rotation.y = Math.atan2(bp.parkX - destX, bp.parkZ - towerFrontZ);
    } else if (localT < T_GETIN) {
      bp.phase = 'parked';
      bp.group.visible = false;
    } else if (localT < T_DRIVEOUT) {
      // Drive out — reverse route
      bp.phase = 'driving_out';
      bp.group.visible = false;
      const p = (localT - T_GETIN) / driveOutTime;
      const ease = p < 0.1 ? p * p * 50 : p;
      const pos = _sampleRoute(bp.route, 1 - ease);
      bp.car.position.set(pos.x, 0.3, pos.z);
      bp.car.rotation.y = pos.angle + Math.PI; // facing away
    } else {
      bp.car.visible = false;
      bp.group.visible = false;
      bp.phase = 'waiting';
    }
  }
}

// ═══ BUILDINGS (merged statics + instanced windows with additive hover) ═══
function buildBuildings(scene) {
  seed = 777;
  const count = 240;
  const staticGeos = [];
  const winInstances = []; // { px, py, pz, nx, nz, baseBright }
  const blinkInstances = []; // { px, py, pz, phase }

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (sr() - 0.5) * 0.04;
    const radius = DIMS.buildingRingR + (sr() - 0.5) * 500; // ±40 × S
    const bw = (sr() * 8 + 4) * S, bd = (sr() * 6 + 3) * S, bh = (sr() * 35 + 8) * S;
    const bx = Math.cos(angle) * radius, bz = Math.sin(angle) * radius;

    // Building body → merge
    sr(); // consume body color RNG
    const bodyGeo = new THREE.BoxGeometry(bw, bh, bd);
    _obj.position.set(bx, bh / 2, bz);
    _obj.rotation.set(0, 0, 0);
    _obj.lookAt(0, bh / 2, 0);
    _obj.updateMatrix();
    bodyGeo.applyMatrix4(_obj.matrix);
    staticGeos.push(bodyGeo);

    // Floor beams → merge
    sr(); // consume beam color RNG
    const beamStep = 50; // 4 × S
    for (let by = beamStep; by < bh; by += beamStep) {
      const beamGeo = new THREE.BoxGeometry(bw + 1.25, 1.0, bd + 1.25); // 0.1/0.08 × S
      _obj.position.set(bx, by, bz);
      _obj.rotation.set(0, 0, 0);
      _obj.lookAt(0, by, 0);
      _obj.updateMatrix();
      beamGeo.applyMatrix4(_obj.matrix);
      staticGeos.push(beamGeo);
    }

    // Rooftop → merge
    const hasRooftop = sr() > 0.75;
    let rooftopH = 0;
    if (hasRooftop) {
      rooftopH = (sr() * 4 + 2) * S;
      const rtGeo = new THREE.BoxGeometry(bw * 0.3, rooftopH, bd * 0.3);
      rtGeo.translate(bx, bh + rooftopH / 2, bz);
      staticGeos.push(rtGeo);
    }

    // Blinking aviation LED on tallest buildings
    const blinkPhase = (Math.abs(bx * 37.1 + bz * 71.3) % 100) / 100 * Math.PI * 2;
    if (bh > 475) { // 38 × S
      const topY = hasRooftop ? bh + rooftopH + 3.75 : bh + 3.75; // 0.3 × S
      blinkInstances.push({ px: bx, py: topY, pz: bz, phase: blinkPhase });
    }

    // 4-face windows → collect ALL for InstancedMesh (maintain RNG pattern)
    const inward = new THREE.Vector3(-bx, 0, -bz).normalize();
    const outward = inward.clone().negate();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), inward).normalize();
    const wr = Math.floor(bh / (4 * S)), wc = Math.max(1, Math.floor(bw / (2.5 * S)));
    const faceDefs = [
      { normal: inward, halfDepth: bd / 2, width: bw, cols: wc },
      { normal: outward, halfDepth: bd / 2, width: bw, cols: wc },
      { normal: right, halfDepth: bw / 2, width: bd, cols: Math.max(1, Math.floor(bd / (2.5 * S))) },
      { normal: right.clone().negate(), halfDepth: bw / 2, width: bd, cols: Math.max(1, Math.floor(bd / (2.5 * S))) }
    ];
    for (const face of faceDefs) {
      const faceRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), face.normal).normalize();
      for (let r = 0; r < wr; r++) {
        for (let c = 0; c < face.cols; c++) {
          if (sr() > 0.35) continue;
          const isLit = sr() < 0.25;
          const baseBright = isLit ? (sr() * 0.3 + 0.2) : 0;
          sr(); sr(); sr(); // consume RNG to maintain sequence stability

          const lx = -face.width / 2 + face.width * (c + 0.5) / face.cols;
          const ly = (2 + r * 4) * S; // 25 + r*50
          const wx = bx + face.normal.x * (face.halfDepth + 0.625) + faceRight.x * lx; // 0.05 × S
          const wz = bz + face.normal.z * (face.halfDepth + 0.625) + faceRight.z * lx;
          winInstances.push({ px: wx, py: ly, pz: wz, nx: face.normal.x, nz: face.normal.z, baseBright });
        }
      }
    }
  }

  // Merge building statics into one mesh
  if (staticGeos.length) {
    const mergedGeo = mergeGeometries(staticGeos, false);
    const staticMesh = new THREE.Mesh(mergedGeo, new THREE.MeshBasicMaterial({ color: 0x1e2230 }));
    scene.add(staticMesh);
    staticGeos.forEach(g => g.dispose());
  }

  // Building windows → InstancedMesh with additive blending (black = invisible, warm = glow)
  if (winInstances.length) {
    const winGeo = new THREE.PlaneGeometry(10, 10); // 0.8 × S
    bldgHoverMesh = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }), winInstances.length);
    bldgHoverMesh.frustumCulled = false;

    for (let i = 0; i < winInstances.length; i++) {
      const wp = winInstances[i];
      _obj.position.set(wp.px, wp.py, wp.pz);
      _obj.rotation.set(0, 0, 0);
      _obj.lookAt(wp.px + wp.nx, wp.py, wp.pz + wp.nz);
      _obj.updateMatrix();
      bldgHoverMesh.setMatrixAt(i, _obj.matrix);

      // Lit windows get a warm base glow, unlit are black (invisible with additive blend)
      const b = wp.baseBright;
      _c.setRGB(0.9 * b, 0.7 * b, 0.4 * b);
      bldgHoverMesh.setColorAt(i, _c);

      bldgWinData.push({ idx: i, worldPos: new THREE.Vector3(wp.px, wp.py, wp.pz), baseBright: b });
    }

    bldgHoverMesh.instanceMatrix.needsUpdate = true;
    if (bldgHoverMesh.instanceColor) bldgHoverMesh.instanceColor.needsUpdate = true;
    scene.add(bldgHoverMesh);
  }

  // Blinking red aviation LEDs on tall buildings
  if (blinkInstances.length) {
    const ledGeo = new THREE.SphereGeometry(3.75, 6, 6); // 0.3 × S
    bldgBlinkMesh = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }), blinkInstances.length);
    bldgBlinkMesh.frustumCulled = false;

    for (let i = 0; i < blinkInstances.length; i++) {
      const bl = blinkInstances[i];
      _obj.position.set(bl.px, bl.py, bl.pz);
      _obj.rotation.set(0, 0, 0);
      _obj.updateMatrix();
      bldgBlinkMesh.setMatrixAt(i, _obj.matrix);
      _c.setRGB(0.9, 0.1, 0.1);
      bldgBlinkMesh.setColorAt(i, _c);
      bldgBlinkData.push({ idx: i, phase: bl.phase });
    }

    bldgBlinkMesh.instanceMatrix.needsUpdate = true;
    if (bldgBlinkMesh.instanceColor) bldgBlinkMesh.instanceColor.needsUpdate = true;
    scene.add(bldgBlinkMesh);
  }
}

// ═══ TREES (70 → 1 InstancedMesh with per-frame billboard) ═══
let treeMesh = null;
const treeInstanceData = []; // { x, y, z, w, h, color }

function buildTrees(scene) {
  seed = 333;
  const count = 70;
  // Shared tree canvas texture (one for all trees)
  const cvs = document.createElement('canvas'); cvs.width = 64; cvs.height = 64;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = 'rgb(8,25,8)';
  ctx.beginPath(); ctx.ellipse(32, 28, 28, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0e140e'; ctx.fillRect(30, 42, 4, 20);
  const tex = new THREE.CanvasTexture(cvs);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(1, 1);
  treeMesh = new THREE.InstancedMesh(geo, mat, count);
  treeMesh.frustumCulled = false;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (sr() - 0.5) * 0.1;
    const radius = DIMS.treeRingR + (sr() - 0.5) * 312;
    const tx = Math.cos(angle) * radius, tz = Math.sin(angle) * radius;
    const th = (sr() * 12 + 6) * S, tw = (sr() * 8 + 5) * S;
    const shade = 10 + sr() * 20;
    const r = (shade * 0.4 | 0) / 255, g = ((shade + 10) | 0) / 255, b = (shade * 0.3 | 0) / 255;
    _c.setRGB(r, g, b);
    treeMesh.setColorAt(i, _c);
    treeInstanceData.push({ x: tx, y: th * 0.5, z: tz, w: tw, h: th });
    // Set initial matrix (will be updated per frame for billboard)
    _obj.position.set(tx, th * 0.5, tz);
    _obj.scale.set(tw, th, 1);
    _obj.updateMatrix();
    treeMesh.setMatrixAt(i, _obj.matrix);
  }
  treeMesh.instanceMatrix.needsUpdate = true;
  if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
  scene.add(treeMesh);
}

function updateTreeBillboards(cameraPos) {
  if (!treeMesh || !cameraPos) return;
  for (let i = 0; i < treeInstanceData.length; i++) {
    const td = treeInstanceData[i];
    // Y-axis billboard: rotate to face camera around Y only
    const dx = cameraPos.x - td.x;
    const dz = cameraPos.z - td.z;
    const angle = Math.atan2(dx, dz);
    _obj.position.set(td.x, td.y, td.z);
    _obj.rotation.set(0, angle, 0);
    _obj.scale.set(td.w, td.h, 1);
    _obj.updateMatrix();
    treeMesh.setMatrixAt(i, _obj.matrix);
  }
  treeMesh.instanceMatrix.needsUpdate = true;
}

// ═══ STARS (800 points, custom shader) ═══
function buildStars(scene) {
  seed = 42;
  const count = 300;
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const scales = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = sr() * Math.PI * 2, phi = sr() * Math.PI * 0.45, r = 7250 + sr() * 1500; // × S
    const x = r * Math.sin(phi) * Math.cos(theta), y = r * Math.cos(phi) + 750, z = r * Math.sin(phi) * Math.sin(theta); // 60 × S
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    const ba = sr() * 0.5 + 0.3; alphas[i] = ba; scales[i] = sr() * 2 + 0.8;
    starData.push({ idx: i, x, y, z, baseAlpha: ba, speed: sr() * 0.8 + 0.3, phase: sr() * Math.PI * 2, scale: scales[i], selected: false, selectGlow: 0 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geo.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
  starPoints = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: { uSkyBlend: { value: 0 } },
    vertexShader: `attribute float alpha; attribute float scale; varying float vAlpha;
      void main() { vAlpha=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(scale*(25000.0/-mv.z),1.0,8.0); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uSkyBlend; varying float vAlpha;
      void main() { float d=length(gl_PointCoord-vec2(.5)); if(d>.5) discard; gl_FragColor=vec4(.91,.88,.82, vAlpha*smoothstep(.5,.1,d)*(1.0-uSkyBlend)); }`,
    transparent: true, depthWrite: false
  }));
  scene.add(starPoints);
}

function updateStars(t) {
  if (!starPoints) return;
  const aa = starPoints.geometry.getAttribute('alpha');
  const sa = starPoints.geometry.getAttribute('scale');
  for (const s of starData) {
    let a = s.baseAlpha * (Math.sin(t * s.speed + s.phase) * 0.3 + 0.7);
    let sc = s.scale;
    if (s.selected) { s.selectGlow = Math.min(1, s.selectGlow + 0.08); a = Math.min(1, a + s.selectGlow * 0.6); sc += s.selectGlow * 3; }
    else s.selectGlow *= 0.9;
    aa.array[s.idx] = a; sa.array[s.idx] = sc;
  }
  aa.needsUpdate = true; sa.needsUpdate = true;
}

export function setSkyBlend(v) {
  if (starPoints) starPoints.material.uniforms.uSkyBlend.value = v;
}

// ═══ TOWER WINDOW FLICKER (uses instanceColor) ═══
function updateTowerWindowFlicker(t) {
  if (!towerWinMesh || !towerWinMesh.instanceColor) return;
  const arr = towerWinMesh.instanceColor.array;
  let changed = false;
  for (const fl of towerFlickerList) {
    const wd = towerWinData[fl.idx];
    if (wd.hidden || !wd.toggled) continue;
    const f = Math.sin(t * fl.speed + fl.phase) * fl.amt;
    const scale = Math.max(0.5, 1 + f);
    arr[fl.idx * 3] = wd.litR * scale;
    arr[fl.idx * 3 + 1] = wd.litG * scale;
    arr[fl.idx * 3 + 2] = wd.litB * scale;
    changed = true;
  }
  if (changed) towerWinMesh.instanceColor.needsUpdate = true;
}

// ═══ BUILDING BLINK LIGHTS (red aviation LEDs) ═══
function updateBuildingBlink(t) {
  if (!bldgBlinkMesh || !bldgBlinkMesh.instanceColor) return;
  const arr = bldgBlinkMesh.instanceColor.array;
  for (const bl of bldgBlinkData) {
    // Alternate bright/dim every ~900ms, phase-shifted per building (matches 2D)
    const blink = Math.sin(t * 3.5 + bl.phase) > 0;
    const bright = blink ? 0.9 : 0.08;
    arr[bl.idx * 3] = bright;
    arr[bl.idx * 3 + 1] = bright * 0.12;
    arr[bl.idx * 3 + 2] = bright * 0.12;
  }
  bldgBlinkMesh.instanceColor.needsUpdate = true;
}

// ═══ CRANE ═══
function buildCrane(scene) {
  const totalH = TC.maxFloors * TC.floorH + TC.floorH * 3;
  const mat = new THREE.MeshBasicMaterial({ color: 0x465064, transparent: true, opacity: 0.6 });
  const mastH = 187, mastX = TC.width / 2 + 18.75; // 15 × S, 1.5 × S
  const mast = new THREE.Mesh(new THREE.BoxGeometry(2.5, mastH, 2.5), mat); // 0.2 × S
  mast.position.set(mastX, totalH + mastH / 2, 0); scene.add(mast); craneParts.push(mast);
  const bl = TC.width * 1.2;
  const boom = new THREE.Mesh(new THREE.BoxGeometry(bl, 1.875, 1.875), mat); // 0.15 × S
  boom.position.set(mastX + bl * 0.3, totalH + mastH, 0); scene.add(boom); craneParts.push(boom);
  const cb = new THREE.Mesh(new THREE.BoxGeometry(bl * 0.4, 1.875, 1.875), mat);
  cb.position.set(mastX - bl * 0.25, totalH + mastH, 0); scene.add(cb); craneParts.push(cb);
  const cg = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(mastX + bl * 0.6, totalH + mastH, 0),
    new THREE.Vector3(mastX + bl * 0.6, totalH + mastH - 100, 0) // 8 × S
  ]);
  cableMesh = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: 0x465064, transparent: true, opacity: 0.3 }));
  scene.add(cableMesh); craneParts.push(cableMesh);
}

// ═══ ELEVATOR ═══
function buildElevator(scene) {
  const group = new THREE.Group();
  const carSize = 15; // 1.2 × S
  group.add(new THREE.Mesh(new THREE.BoxGeometry(carSize, TC.floorH * 2.5, carSize), new THREE.MeshBasicMaterial({ color: 0x2a2e3a })));
  const win = new THREE.Mesh(new THREE.BoxGeometry(10, TC.floorH * 1.4, carSize + 0.125), new THREE.MeshBasicMaterial({ color: 0xdcbe82, transparent: true, opacity: 0.5 }));
  win.position.y = -2.5; group.add(win);
  const totalH = TC.maxFloors * TC.floorH + TC.floorH * 3;
  elevTrack = new THREE.Mesh(new THREE.BoxGeometry(1.25, totalH, 1.25), new THREE.MeshBasicMaterial({ color: 0x323846, transparent: true, opacity: 0.4 })); // 0.1 × S
  elevTrack.position.set(-(TC.width / 2 + carSize), totalH / 2, 0); scene.add(elevTrack);
  group.position.set(-(TC.width / 2 + carSize), TC.floorH * 3 + elevFloor * TC.floorH, 0);
  scene.add(group); elevMesh = group;
}

function updateElevator(dt) {
  if (!elevMesh || !elevMesh.visible) return;
  if (elevWait > 0) {
    elevWait -= dt;
    if (elevWait <= 0) elevTarget = Math.floor(Math.random() * Math.max(1, TC.litFloors.lastIndexOf(true) + 1));
    return;
  }
  const d = elevTarget - elevFloor;
  if (Math.abs(d) < 0.15) { elevFloor = elevTarget; elevWait = 2 + Math.random() * 5; }
  else elevFloor += Math.sign(d) * elevSpeed * dt;
  elevMesh.position.y = TC.floorH * 3 + elevFloor * TC.floorH;
}

// ═══ TOWER GLOW ═══
function buildTowerGlow(scene) {
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(TC.width * 2.5, TC.width * 4, TC.maxFloors * TC.floorH * 0.8, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xdcb478, transparent: true, opacity: 0.02, side: THREE.DoubleSide, depthWrite: false })
  );
  glow.position.y = TC.maxFloors * TC.floorH * 0.3; scene.add(glow);
}

// ═══ SATELLITES ═══
function spawnSat(scene) {
  seed = Math.floor(performance.now()) % 2147483647 || 1;
  const fa = sr() * Math.PI * 2;
  const sat = {
    fromAngle: fa, toAngle: fa + Math.PI * (0.5 + sr()) * (sr() > 0.5 ? 1 : -1),
    height: 2500 + sr() * 2500, radius: 5000 + sr() * 2500, progress: 0, speed: 0.02 + sr() * 0.03, // × S
    mesh: new THREE.Mesh(new THREE.SphereGeometry(5, 4, 4), new THREE.MeshBasicMaterial({ color: 0xd0d8e8, transparent: true, opacity: 0.5 })) // 0.4 × S
  };
  scene.add(sat.mesh); sats.push(sat);
}

function updateSats(scene, dt) {
  if (sats.length < 2 && Math.random() < 0.005) spawnSat(scene);
  for (let i = sats.length - 1; i >= 0; i--) {
    const s = sats[i]; s.progress += s.speed * dt;
    if (s.progress >= 1) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); sats.splice(i, 1); continue; }
    const a = s.fromAngle + (s.toAngle - s.fromAngle) * s.progress;
    s.mesh.position.set(Math.cos(a) * s.radius, s.height, Math.sin(a) * s.radius);
  }
}

// ═══ DISSOLVE / RESTORE (for transition) ═══
function dissolveTowerFloor(fi) {
  // Hide windows
  for (const wd of towerWinData) {
    if (wd.floorIdx === fi && !wd.hidden) {
      towerWinMesh.setMatrixAt(wd.idx, _zeroScale);
      wd.hidden = true;
    }
  }
  towerWinMesh.instanceMatrix.needsUpdate = true;
  // Hide beams
  if (towerBeamMesh) {
    for (const bd of towerBeamData) {
      if (bd.floorIdx === fi && !bd.hidden) {
        towerBeamMesh.setMatrixAt(bd.idx, _zeroScale);
        bd.hidden = true;
      }
    }
    towerBeamMesh.instanceMatrix.needsUpdate = true;
  }
}

function restoreTowerFloor(fi) {
  for (const wd of towerWinData) {
    if (wd.floorIdx === fi && wd.hidden) {
      towerWinMesh.setMatrixAt(wd.idx, wd.originalMatrix);
      wd.hidden = false;
    }
  }
  towerWinMesh.instanceMatrix.needsUpdate = true;
  if (towerBeamMesh) {
    for (const bd of towerBeamData) {
      if (bd.floorIdx === fi && bd.hidden) {
        towerBeamMesh.setMatrixAt(bd.idx, bd.originalMatrix);
        bd.hidden = false;
      }
    }
    towerBeamMesh.instanceMatrix.needsUpdate = true;
  }
}

function restoreAllTowerFloors() {
  for (const wd of towerWinData) {
    if (wd.hidden) {
      towerWinMesh.setMatrixAt(wd.idx, wd.originalMatrix);
      wd.hidden = false;
    }
  }
  towerWinMesh.instanceMatrix.needsUpdate = true;
  if (towerBeamMesh) {
    for (const bd of towerBeamData) {
      if (bd.hidden) {
        towerBeamMesh.setMatrixAt(bd.idx, bd.originalMatrix);
        bd.hidden = false;
      }
    }
    towerBeamMesh.instanceMatrix.needsUpdate = true;
  }
}

function applyPlayerLighting() {
  if (!towerWinMesh) return;
  for (const wd of towerWinData) {
    if (wd.floorIdx > TC.playerFloor && !wd.hidden) {
      towerWinMesh.setMatrixAt(wd.idx, _zeroScale);
      wd.hidden = true;
      wd.toggled = false;
    }
  }
  towerWinMesh.instanceMatrix.needsUpdate = true;
  if (towerBeamMesh) {
    for (const bd of towerBeamData) {
      if (bd.floorIdx > TC.playerFloor && !bd.hidden) {
        towerBeamMesh.setMatrixAt(bd.idx, _zeroScale);
        bd.hidden = true;
      }
    }
    towerBeamMesh.instanceMatrix.needsUpdate = true;
  }
}

// ═══ HOVER SYSTEMS (called from main loop) ═══
export function updateBuildingHover(camera, mouseX, mouseY, skip, t) {
  if (skip || !bldgHoverMesh || !bldgHoverMesh.instanceColor) return;
  const hw = innerWidth / 2, hh = innerHeight / 2;
  const radius = 120;
  const arr = bldgHoverMesh.instanceColor.array;
  for (const wd of bldgWinData) {
    _v3.copy(wd.worldPos).project(camera);
    let glow = 0;
    if (_v3.z <= 1) {
      const sx = _v3.x * hw + hw, sy = -_v3.y * hh + hh;
      const dist = Math.sqrt((sx - mouseX) ** 2 + (sy - mouseY) ** 2);
      glow = dist < radius ? (1 - dist / radius) * 0.5 : 0;
    }
    // Shimmer: lit windows pulse on/off via half-wave sin (visible even against bright daytime sky)
    let shimmer = wd.baseBright;
    if (wd.baseBright > 0 && t !== undefined) {
      const speed = 0.5 + (Math.abs(wd.worldPos.x * 7.3 + wd.worldPos.z * 13.7) % 3.0);
      const phase = Math.abs(wd.worldPos.x * 0.37 + wd.worldPos.y * 1.13 + wd.worldPos.z * 0.71) % (Math.PI * 2);
      shimmer = wd.baseBright * Math.max(0, Math.sin(t * speed + phase));
    }
    const bright = Math.max(shimmer, glow);
    arr[wd.idx * 3] = 0.9 * bright;
    arr[wd.idx * 3 + 1] = 0.7 * bright;
    arr[wd.idx * 3 + 2] = 0.4 * bright;
  }
  bldgHoverMesh.instanceColor.needsUpdate = true;
}

export function updateTowerHover(camera, mouseX, mouseY) {
  if (!towerWinMesh || !towerWinMesh.instanceColor) return;
  const hw = innerWidth / 2, hh = innerHeight / 2;
  const radius = 13;
  const arr = towerWinMesh.instanceColor.array;
  let changed = false;
  for (const wd of towerWinData) {
    if (wd.hidden) { wd.wasHovered = false; continue; }
    _v3.copy(wd.worldPos).project(camera);
    if (_v3.z > 1) { wd.wasHovered = false; continue; }
    const sx = (_v3.x * hw) + hw, sy = -(_v3.y * hh) + hh;
    const dist = Math.sqrt((sx - mouseX) ** 2 + (sy - mouseY) ** 2);
    const isHovered = dist < radius;
    if (isHovered && !wd.wasHovered) {
      wd.toggled = !wd.toggled;
      arr[wd.idx * 3] = wd.toggled ? wd.litR : 0x14 / 255;
      arr[wd.idx * 3 + 1] = wd.toggled ? wd.litG : 0x18 / 255;
      arr[wd.idx * 3 + 2] = wd.toggled ? wd.litB : 0x20 / 255;
      changed = true;
    }
    wd.wasHovered = isHovered;
  }
  if (changed) towerWinMesh.instanceColor.needsUpdate = true;
}

// ═══ EARTH GLOBE ═══
let earthMesh = null;
let earthAtmos = null;
let moonMesh = null;
const EARTH_Y = -10000;
const EARTH_R = 3000;
const MOON_R = 200;
const MOON_DIST = EARTH_R * 1.8;

function buildEarth(scene) {
  // Procedural Earth texture on a 1024×512 canvas (equirectangular)
  const w = 1024, h = 512;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');

  // Ocean base — dark blue
  cx.fillStyle = '#0a1428';
  cx.fillRect(0, 0, w, h);

  // Subtle ocean variation
  for (let i = 0; i < 60; i++) {
    cx.fillStyle = `rgba(${8 + sr() * 10|0},${18 + sr() * 15|0},${35 + sr() * 15|0},0.3)`;
    cx.beginPath();
    cx.ellipse(sr() * w, sr() * h, sr() * 120 + 40, sr() * 60 + 20, sr() * Math.PI, 0, Math.PI * 2);
    cx.fill();
  }

  // Simplified continents in equirectangular projection
  // North America
  cx.fillStyle = '#142a14';
  cx.beginPath();
  cx.moveTo(w * 0.12, h * 0.18);
  cx.quadraticCurveTo(w * 0.18, h * 0.12, w * 0.28, h * 0.15);
  cx.quadraticCurveTo(w * 0.32, h * 0.2, w * 0.3, h * 0.28);
  cx.quadraticCurveTo(w * 0.27, h * 0.35, w * 0.22, h * 0.4);
  cx.quadraticCurveTo(w * 0.18, h * 0.42, w * 0.17, h * 0.48);
  cx.quadraticCurveTo(w * 0.14, h * 0.46, w * 0.12, h * 0.38);
  cx.quadraticCurveTo(w * 0.08, h * 0.3, w * 0.1, h * 0.22);
  cx.closePath();
  cx.fill();

  // South America
  cx.beginPath();
  cx.moveTo(w * 0.22, h * 0.52);
  cx.quadraticCurveTo(w * 0.27, h * 0.5, w * 0.28, h * 0.55);
  cx.quadraticCurveTo(w * 0.3, h * 0.62, w * 0.28, h * 0.7);
  cx.quadraticCurveTo(w * 0.26, h * 0.78, w * 0.24, h * 0.85);
  cx.quadraticCurveTo(w * 0.22, h * 0.88, w * 0.21, h * 0.82);
  cx.quadraticCurveTo(w * 0.19, h * 0.72, w * 0.2, h * 0.6);
  cx.closePath();
  cx.fill();

  // Europe
  cx.fillStyle = '#132812';
  cx.beginPath();
  cx.moveTo(w * 0.44, h * 0.15);
  cx.quadraticCurveTo(w * 0.48, h * 0.12, w * 0.52, h * 0.14);
  cx.quadraticCurveTo(w * 0.55, h * 0.17, w * 0.52, h * 0.22);
  cx.quadraticCurveTo(w * 0.5, h * 0.28, w * 0.47, h * 0.32);
  cx.quadraticCurveTo(w * 0.44, h * 0.3, w * 0.43, h * 0.24);
  cx.quadraticCurveTo(w * 0.42, h * 0.18, w * 0.44, h * 0.15);
  cx.closePath();
  cx.fill();

  // Africa
  cx.fillStyle = '#1a3212';
  cx.beginPath();
  cx.moveTo(w * 0.45, h * 0.35);
  cx.quadraticCurveTo(w * 0.5, h * 0.32, w * 0.55, h * 0.35);
  cx.quadraticCurveTo(w * 0.58, h * 0.45, w * 0.56, h * 0.55);
  cx.quadraticCurveTo(w * 0.54, h * 0.65, w * 0.52, h * 0.72);
  cx.quadraticCurveTo(w * 0.5, h * 0.75, w * 0.48, h * 0.7);
  cx.quadraticCurveTo(w * 0.44, h * 0.6, w * 0.43, h * 0.48);
  cx.quadraticCurveTo(w * 0.43, h * 0.4, w * 0.45, h * 0.35);
  cx.closePath();
  cx.fill();

  // Asia
  cx.fillStyle = '#142a14';
  cx.beginPath();
  cx.moveTo(w * 0.55, h * 0.12);
  cx.quadraticCurveTo(w * 0.65, h * 0.08, w * 0.78, h * 0.12);
  cx.quadraticCurveTo(w * 0.85, h * 0.15, w * 0.82, h * 0.22);
  cx.quadraticCurveTo(w * 0.78, h * 0.3, w * 0.72, h * 0.35);
  cx.quadraticCurveTo(w * 0.68, h * 0.38, w * 0.65, h * 0.35);
  cx.quadraticCurveTo(w * 0.6, h * 0.32, w * 0.58, h * 0.28);
  cx.quadraticCurveTo(w * 0.55, h * 0.2, w * 0.55, h * 0.12);
  cx.closePath();
  cx.fill();

  // India
  cx.beginPath();
  cx.moveTo(w * 0.62, h * 0.35);
  cx.quadraticCurveTo(w * 0.66, h * 0.34, w * 0.67, h * 0.38);
  cx.quadraticCurveTo(w * 0.66, h * 0.46, w * 0.64, h * 0.5);
  cx.quadraticCurveTo(w * 0.62, h * 0.48, w * 0.61, h * 0.42);
  cx.closePath();
  cx.fill();

  // Australia
  cx.fillStyle = '#1e3218';
  cx.beginPath();
  cx.moveTo(w * 0.78, h * 0.58);
  cx.quadraticCurveTo(w * 0.84, h * 0.55, w * 0.88, h * 0.58);
  cx.quadraticCurveTo(w * 0.9, h * 0.64, w * 0.88, h * 0.7);
  cx.quadraticCurveTo(w * 0.84, h * 0.72, w * 0.8, h * 0.7);
  cx.quadraticCurveTo(w * 0.77, h * 0.66, w * 0.78, h * 0.58);
  cx.closePath();
  cx.fill();

  // Greenland
  cx.fillStyle = '#1e3828';
  cx.beginPath();
  cx.moveTo(w * 0.3, h * 0.06);
  cx.quadraticCurveTo(w * 0.35, h * 0.04, w * 0.37, h * 0.08);
  cx.quadraticCurveTo(w * 0.36, h * 0.14, w * 0.33, h * 0.16);
  cx.quadraticCurveTo(w * 0.3, h * 0.14, w * 0.29, h * 0.1);
  cx.closePath();
  cx.fill();

  // Ice caps
  cx.fillStyle = 'rgba(150,170,200,0.12)';
  cx.fillRect(0, 0, w, h * 0.04);
  cx.fillRect(0, h * 0.94, w, h * 0.06);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;

  const geo = new THREE.SphereGeometry(EARTH_R, 64, 48);
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false });
  earthMesh = new THREE.Mesh(geo, mat);
  earthMesh.position.set(0, EARTH_Y, 0);
  earthMesh.visible = false;
  scene.add(earthMesh);

  // Atmosphere halo
  const atmosGeo = new THREE.SphereGeometry(EARTH_R * 1.015, 48, 32);
  const atmosMat = new THREE.MeshBasicMaterial({
    color: 0x4488cc, transparent: true, opacity: 0.12, side: THREE.BackSide, fog: false,
  });
  earthAtmos = new THREE.Mesh(atmosGeo, atmosMat);
  earthAtmos.position.set(0, EARTH_Y, 0);
  earthAtmos.visible = false;
  scene.add(earthAtmos);

  // Moon
  const moonGeo = new THREE.SphereGeometry(MOON_R, 24, 16);
  const moonMat = new THREE.MeshBasicMaterial({ color: 0x606878, fog: false });
  moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.position.set(MOON_DIST, EARTH_Y + EARTH_R * 0.6, 0);
  moonMesh.visible = false;
  scene.add(moonMesh);

  return earthMesh;
}

export function getEarthParams() {
  return { y: EARTH_Y, r: EARTH_R };
}

export function updateMoon(t) {
  if (!moonMesh) return;
  const a = t * 0.02; // very slow orbit
  moonMesh.position.x = Math.cos(a) * MOON_DIST;
  moonMesh.position.z = Math.sin(a) * MOON_DIST;
  moonMesh.position.y = EARTH_Y + EARTH_R * 0.6;
}

export function setEarthVisible(v) {
  if (earthMesh) earthMesh.visible = v;
  if (earthAtmos) earthAtmos.visible = v;
  if (moonMesh) moonMesh.visible = v;
}
