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
// Shared tower geometry constants (imported by title-exterior.js for collision)
export const TOWER_WIDTH = 6;
export const TOWER_DEPTH = 6;
export const TOWER_FLOOR_H = 1.2;

const TC = {
  width: TOWER_WIDTH, depth: TOWER_DEPTH, floorH: TOWER_FLOOR_H, maxFloors: 65,
  litFloors: [], group: null, floorMeshes: [], playerFloor: 0
};
export const DIMS = { groundRadius: 300, buildingRingR: 180, treeRingR: 100, cameraOrbitR: 260, cameraHeight: 55 };

// ── Shared refs ──
const extColumns = [];
const structColumns = [];
const craneParts = [];
let cableMesh = null;
let elevMesh = null, elevTrack = null;
let elevFloor = 5, elevTarget = 5, elevWait = 3;
const elevSpeed = 8;
const sats = [];

// ── Stars ──
let starPoints = null;
const starData = [];

// ── Tower windows (InstancedMesh + built-in instanceColor) ──
let towerWinMesh = null;
const towerWinData = []; // { idx, floorIdx, toggled, wasHovered, litR, litG, litB, worldPos, hidden, originalMatrix }
const towerFlickerList = []; // { idx, baseBright, speed, phase, amt }

// ── Building windows (InstancedMesh + additive blending for hover glow) ──
let bldgHoverMesh = null;
const bldgWinData = []; // { idx, worldPos, baseBright }

// ── Temp objects (reused) ──
const _obj = new THREE.Object3D();
const _zeroScale = new THREE.Matrix4().makeScale(0, 0, 0);
const _v3 = new THREE.Vector3();
const _c = new THREE.Color();

export function buildCityScene(scene, litFloors) {
  // Reset module-level arrays to prevent double-population on re-entry
  extColumns.length = 0;
  structColumns.length = 0;
  craneParts.length = 0;
  cableMesh = null;
  elevMesh = null; elevTrack = null;
  sats.length = 0;
  starPoints = null;
  starData.length = 0;
  towerWinMesh = null;
  towerWinData.length = 0;
  towerFlickerList.length = 0;
  bldgHoverMesh = null;
  bldgWinData.length = 0;
  TC.litFloors = []; TC.group = null; TC.floorMeshes = [];

  buildGround(scene);
  buildTower(scene);
  buildEntrance(scene);
  buildBuildings(scene);
  buildTrees(scene);
  buildStars(scene);
  buildCrane(scene);
  buildElevator(scene);
  buildTowerGlow(scene);

  // Exterior: player character + construction site
  const exteriorPlayer = buildPlayer(scene);
  const exteriorSite = buildConstructionSite(scene);

  function updateCity(t) {
    const dt = 1 / 60;
    updateStars(t);
    updateTowerWindowFlicker(t);
    if (cableMesh && cableMesh.visible) {
      const p = cableMesh.geometry.attributes.position.array;
      const sw = Math.sin(t * 0.35) * 1.5;
      p[3] = p[0] + sw; p[5] = sw * 0.5;
      cableMesh.geometry.attributes.position.needsUpdate = true;
    }
    updateElevator(dt);
    updateSats(scene, dt);
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
    exteriorPlayer,
    exteriorSite,
  };
}

// ═══ GROUND ═══
function buildGround(scene) {
  const g = new THREE.Mesh(new THREE.CircleGeometry(DIMS.groundRadius, 96), new THREE.MeshBasicMaterial({ color: 0x0e120a }));
  g.rotation.x = -Math.PI / 2; g.position.y = -0.1; scene.add(g);
  const g2 = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshBasicMaterial({ color: 0x12160e }));
  g2.rotation.x = -Math.PI / 2; scene.add(g2);
  const road = new THREE.Mesh(new THREE.RingGeometry(148, 152, 96), new THREE.MeshBasicMaterial({ color: 0x1a1e24, side: THREE.DoubleSide }));
  road.rotation.x = -Math.PI / 2; road.position.y = 0.05; scene.add(road);
}

// ═══ TOWER (perimeter scaffold beams, open center elevator shaft, instanced windows) ═══
export const BEAM_DEPTH = 0.4; // depth of perimeter beams (walkable width)

function buildTower(scene) {
  const tw = TC.width, td = TC.depth, fh = TC.floorH, nf = TC.maxFloors;
  const totalH = nf * fh, baseH = fh * 3;
  TC.group = new THREE.Group();
  seed = 999;

  // Determine lit floors
  TC.litFloors = [];
  for (let i = 0; i < nf; i++) {
    const ch = i < 12 ? 0.9 : i < 25 ? 0.75 : i < 40 ? 0.5 : i < 55 ? 0.25 : 0.05;
    TC.litFloors.push(sr() < ch);
  }

  // Foundation
  const base = new THREE.Mesh(new THREE.BoxGeometry(tw * 1.5, baseH, td * 1.5), new THREE.MeshBasicMaterial({ color: 0x1a1e28 }));
  base.position.y = baseH / 2; TC.group.add(base);

  // Corner columns
  const colGeo = new THREE.BoxGeometry(0.25, totalH + baseH, 0.25);
  const colMat = new THREE.MeshBasicMaterial({ color: 0x252a3a });
  const hw = tw / 2, hd = td / 2;
  [[-hw, -hd], [-hw, hd], [hw, -hd], [hw, hd]].forEach(([px, pz]) => {
    const c = new THREE.Mesh(colGeo, colMat);
    c.position.set(px, (totalH + baseH) / 2, pz);
    TC.group.add(c); structColumns.push(c);
  });

  // Floor beams — 4 perimeter edge beams per floor (center is open elevator shaft)
  // Shared geometry: N/S beams run in X, E/W beams run in Z
  const beamH = 0.12;
  const nsBeamGeo = new THREE.BoxGeometry(tw + BEAM_DEPTH, beamH, BEAM_DEPTH);
  const ewBeamGeo = new THREE.BoxGeometry(BEAM_DEPTH, beamH, td + BEAM_DEPTH);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x2a3048 });

  for (let fi = 0; fi < nf; fi++) {
    const fy = baseH + fi * fh;
    const beamGroup = new THREE.Group();

    const n = new THREE.Mesh(nsBeamGeo, beamMat);
    n.position.set(0, fy, -hd); beamGroup.add(n);

    const s = new THREE.Mesh(nsBeamGeo, beamMat);
    s.position.set(0, fy, hd); beamGroup.add(s);

    const e = new THREE.Mesh(ewBeamGeo, beamMat);
    e.position.set(hw, fy, 0); beamGroup.add(e);

    const w = new THREE.Mesh(ewBeamGeo, beamMat);
    w.position.set(-hw, fy, 0); beamGroup.add(w);

    TC.group.add(beamGroup);
    TC.floorMeshes.push({ beam: beamGroup });
  }

  // Tower windows → InstancedMesh + MeshBasicMaterial + instanceColor
  // Windows placed on outer face of beam frame (offset outward by BEAM_DEPTH/2)
  const halfBeam = BEAM_DEPTH / 2;
  const winCount = nf * 4 * 10; // 65 floors × 4 faces × 10 windows = 2600
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

        // Set instance color (built-in instanceColor API)
        _c.setRGB(r, g, b);
        towerWinMesh.setColorAt(winIdx, _c);

        // Compute position + rotation (outer face of beam frame)
        const off = -face.w / 2 + fSegW * (wi + 0.5);
        const yp = fy + fh * 0.5;
        if (face.axis === 'z') {
          _obj.position.set(off, yp, face.dir * (td / 2 + halfBeam + 0.01));
          _obj.rotation.set(0, face.dir < 0 ? Math.PI : 0, 0);
        } else {
          _obj.position.set(face.dir * (tw / 2 + halfBeam + 0.01), yp, off);
          _obj.rotation.set(0, face.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        }
        _obj.updateMatrix();
        towerWinMesh.setMatrixAt(winIdx, _obj.matrix);

        // Store metadata
        const litR = wLit ? r : 0xdc / 255;
        const litG = wLit ? g : 0xbe / 255;
        const litB = wLit ? b : 0x82 / 255;

        const wd = {
          idx: winIdx, floorIdx: fi, toggled: wLit, wasHovered: false,
          litR, litG, litB,
          worldPos: _obj.position.clone(),
          hidden: false, originalMatrix: _obj.matrix.clone()
        };
        towerWinData.push(wd);

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
  const extMat = new THREE.MeshBasicMaterial({ color: 0x1e2230, transparent: true, opacity: 0.15 });
  const extGeo = new THREE.BoxGeometry(0.15, 40, 0.15);
  [[-hw, -hd], [-hw, hd], [hw, -hd], [hw, hd]].forEach(([px, pz]) => {
    const e = new THREE.Mesh(extGeo, extMat);
    e.position.set(px, totalH + baseH + 20, pz);
    TC.group.add(e); extColumns.push(e);
  });

  scene.add(TC.group);
}

// ═══ ENTRANCE ═══
function buildEntrance(scene) {
  const tw = TC.width, td = TC.depth, fh = TC.floorH, baseH = fh * 3;
  const pathW = 2.5, pathLen = DIMS.buildingRingR - td / 2;
  const path = new THREE.Mesh(new THREE.PlaneGeometry(pathW, pathLen), new THREE.MeshBasicMaterial({ color: 0x1e2228 }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, td / 2 + pathLen / 2); scene.add(path);
  const borderMat = new THREE.MeshBasicMaterial({ color: 0x282e38 });
  for (const side of [-1, 1]) {
    const border = new THREE.Mesh(new THREE.PlaneGeometry(0.15, pathLen), borderMat);
    border.rotation.x = -Math.PI / 2; border.position.set(side * pathW / 2, 0.03, td / 2 + pathLen / 2); scene.add(border);
  }
  const landing = new THREE.Mesh(new THREE.BoxGeometry(pathW + 1, 0.15, 1.5), new THREE.MeshBasicMaterial({ color: 0x1a1e28 }));
  landing.position.set(0, 0.08, td / 2 + 0.75); scene.add(landing);
  const doorH = baseH * 0.75, doorW = 0.9;
  const doorMat = new THREE.MeshBasicMaterial({ color: 0x2a2e3a });
  const doorGlowMat = new THREE.MeshBasicMaterial({ color: 0xdcbe82, transparent: true, opacity: 0.15 });
  for (const side of [-0.6, 0.6]) {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), doorMat);
    door.position.set(side, doorH / 2, td / 2 + 0.02); scene.add(door);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 0.8, doorH * 0.85), doorGlowMat);
    glow.position.set(side, doorH / 2, td / 2 + 0.03); scene.add(glow);
  }
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x323846 });
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorW * 2 + 0.8, 0.2, 0.15), frameMat);
  frameTop.position.set(0, doorH + 0.1, td / 2 + 0.02); scene.add(frameTop);
  const transom = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 2 + 0.4, 0.6), new THREE.MeshBasicMaterial({ color: 0xdcbe82, transparent: true, opacity: 0.3 }));
  transom.position.set(0, doorH + 0.5, td / 2 + 0.03); scene.add(transom);
}

// ═══ BUILDINGS (merged statics + instanced windows with additive hover) ═══
function buildBuildings(scene) {
  seed = 777;
  const count = 240;
  const staticGeos = [];
  const winInstances = []; // { px, py, pz, nx, nz, baseBright }

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (sr() - 0.5) * 0.04;
    const radius = DIMS.buildingRingR + (sr() - 0.5) * 40;
    const bw = sr() * 8 + 4, bd = sr() * 6 + 3, bh = sr() * 35 + 8;
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
    for (let by = 4; by < bh; by += 4) {
      const beamGeo = new THREE.BoxGeometry(bw + 0.1, 0.08, bd + 0.1);
      _obj.position.set(bx, by, bz);
      _obj.rotation.set(0, 0, 0);
      _obj.lookAt(0, by, 0);
      _obj.updateMatrix();
      beamGeo.applyMatrix4(_obj.matrix);
      staticGeos.push(beamGeo);
    }

    // Rooftop → merge
    if (sr() > 0.75) {
      const rtH = sr() * 4 + 2;
      const rtGeo = new THREE.BoxGeometry(bw * 0.3, rtH, bd * 0.3);
      rtGeo.translate(bx, bh + rtH / 2, bz);
      staticGeos.push(rtGeo);
    }

    // 4-face windows → collect ALL for InstancedMesh (maintain RNG pattern)
    const inward = new THREE.Vector3(-bx, 0, -bz).normalize();
    const outward = inward.clone().negate();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), inward).normalize();
    const wr = Math.floor(bh / 4), wc = Math.max(1, Math.floor(bw / 2.5));
    const faceDefs = [
      { normal: inward, halfDepth: bd / 2, width: bw, cols: wc },
      { normal: outward, halfDepth: bd / 2, width: bw, cols: wc },
      { normal: right, halfDepth: bw / 2, width: bd, cols: Math.max(1, Math.floor(bd / 2.5)) },
      { normal: right.clone().negate(), halfDepth: bw / 2, width: bd, cols: Math.max(1, Math.floor(bd / 2.5)) }
    ];
    for (const face of faceDefs) {
      const faceRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), face.normal).normalize();
      for (let r = 0; r < wr; r++) {
        for (let c = 0; c < face.cols; c++) {
          if (sr() > 0.35) continue;
          const isLit = sr() < 0.25;
          const baseBright = isLit ? (sr() * 0.3 + 0.2) : 0;
          sr(); sr(); sr(); // consume flickerSpeed, flickerPhase, flickerAmt

          const lx = -face.width / 2 + face.width * (c + 0.5) / face.cols;
          const ly = 2 + r * 4;
          const wx = bx + face.normal.x * (face.halfDepth + 0.05) + faceRight.x * lx;
          const wz = bz + face.normal.z * (face.halfDepth + 0.05) + faceRight.z * lx;
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
    const winGeo = new THREE.PlaneGeometry(0.8, 0.8);
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
}

// ═══ TREES (70 sprites) ═══
function buildTrees(scene) {
  seed = 333;
  for (let i = 0; i < 70; i++) {
    const angle = (i / 70) * Math.PI * 2 + (sr() - 0.5) * 0.1;
    const radius = DIMS.treeRingR + (sr() - 0.5) * 25;
    const tx = Math.cos(angle) * radius, tz = Math.sin(angle) * radius;
    const th = sr() * 12 + 6, tw = sr() * 8 + 5;
    const cvs = document.createElement('canvas'); cvs.width = 64; cvs.height = 64;
    const ctx = cvs.getContext('2d');
    const shade = 10 + sr() * 20;
    ctx.fillStyle = `rgb(${shade * 0.4 | 0},${shade + 10 | 0},${shade * 0.3 | 0})`;
    ctx.beginPath(); ctx.ellipse(32, 28, 28, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0e140e'; ctx.fillRect(30, 42, 4, 20);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true, depthWrite: false }));
    sprite.position.set(tx, th * 0.5, tz); sprite.scale.set(tw, th, 1); scene.add(sprite);
  }
}

// ═══ STARS (800 points, custom shader) ═══
function buildStars(scene) {
  seed = 42;
  const count = 800;
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const scales = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = sr() * Math.PI * 2, phi = sr() * Math.PI * 0.45, r = 580 + sr() * 120;
    const x = r * Math.sin(phi) * Math.cos(theta), y = r * Math.cos(phi) + 60, z = r * Math.sin(phi) * Math.sin(theta);
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
      void main() { vAlpha=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(scale*(2000.0/-mv.z),1.0,8.0); gl_Position=projectionMatrix*mv; }`,
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

// ═══ CRANE ═══
function buildCrane(scene) {
  const totalH = TC.maxFloors * TC.floorH + TC.floorH * 3;
  const mat = new THREE.MeshBasicMaterial({ color: 0x465064, transparent: true, opacity: 0.6 });
  const mastH = 15, mastX = TC.width / 2 + 1.5;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.2, mastH, 0.2), mat);
  mast.position.set(mastX, totalH + mastH / 2, 0); scene.add(mast); craneParts.push(mast);
  const bl = TC.width * 1.2;
  const boom = new THREE.Mesh(new THREE.BoxGeometry(bl, 0.15, 0.15), mat);
  boom.position.set(mastX + bl * 0.3, totalH + mastH, 0); scene.add(boom); craneParts.push(boom);
  const cb = new THREE.Mesh(new THREE.BoxGeometry(bl * 0.4, 0.15, 0.15), mat);
  cb.position.set(mastX - bl * 0.25, totalH + mastH, 0); scene.add(cb); craneParts.push(cb);
  const cg = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(mastX + bl * 0.6, totalH + mastH, 0),
    new THREE.Vector3(mastX + bl * 0.6, totalH + mastH - 8, 0)
  ]);
  cableMesh = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: 0x465064, transparent: true, opacity: 0.3 }));
  scene.add(cableMesh); craneParts.push(cableMesh);
}

// ═══ ELEVATOR ═══
function buildElevator(scene) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, TC.floorH * 2.5, 1.2), new THREE.MeshBasicMaterial({ color: 0x2a2e3a })));
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, TC.floorH * 1.4, 1.21), new THREE.MeshBasicMaterial({ color: 0xdcbe82, transparent: true, opacity: 0.5 }));
  win.position.y = -0.2; group.add(win);
  const totalH = TC.maxFloors * TC.floorH + TC.floorH * 3;
  elevTrack = new THREE.Mesh(new THREE.BoxGeometry(0.1, totalH, 0.1), new THREE.MeshBasicMaterial({ color: 0x323846, transparent: true, opacity: 0.4 }));
  elevTrack.position.set(-(TC.width / 2 + 1.2), totalH / 2, 0); scene.add(elevTrack);
  group.position.set(-(TC.width / 2 + 1.2), TC.floorH * 3 + elevFloor * TC.floorH, 0);
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
    height: 200 + sr() * 200, radius: 400 + sr() * 200, progress: 0, speed: 0.02 + sr() * 0.03,
    mesh: new THREE.Mesh(new THREE.SphereGeometry(0.4, 4, 4), new THREE.MeshBasicMaterial({ color: 0xd0d8e8, transparent: true, opacity: 0.5 }))
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
  for (const wd of towerWinData) {
    if (wd.floorIdx === fi && !wd.hidden) {
      towerWinMesh.setMatrixAt(wd.idx, _zeroScale);
      wd.hidden = true;
    }
  }
  towerWinMesh.instanceMatrix.needsUpdate = true;
}

function restoreTowerFloor(fi) {
  for (const wd of towerWinData) {
    if (wd.floorIdx === fi && wd.hidden) {
      towerWinMesh.setMatrixAt(wd.idx, wd.originalMatrix);
      wd.hidden = false;
    }
  }
  towerWinMesh.instanceMatrix.needsUpdate = true;
}

function restoreAllTowerFloors() {
  for (const wd of towerWinData) {
    if (wd.hidden) {
      towerWinMesh.setMatrixAt(wd.idx, wd.originalMatrix);
      wd.hidden = false;
    }
  }
  towerWinMesh.instanceMatrix.needsUpdate = true;
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
}

// ═══ HOVER SYSTEMS (called from main loop) ═══
export function updateBuildingHover(camera, mouseX, mouseY, skip) {
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
    const bright = Math.max(wd.baseBright, glow);
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
