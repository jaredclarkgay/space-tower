'use strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sndLaunch, sndCrateFly, sndCrateHit, sndCrateMiss, sndFloorDone } from '../sound.js';

/**
 * ScaffoldingGame — seesaw launch mini-game for building floor structures.
 *
 * Seesaw sits on the GROUND on the near side of the tower (visible from
 * player spawn). Player jumps onto one end, launching a GPC Supply crate
 * skyward toward a bullseye target on the roof.
 *
 * 3-beat camera: close (jump) → wide side pull (trajectory) → bird's eye
 * (hit) or quick reset (miss). The asymmetry IS the design.
 *
 * 2 crates per floor (floors 1–5), 4 crates (floors 6–10). 30 total.
 */

// ── Vertex color helper ──
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

// ── GPC Supply crate texture (2× text) ──
let _steelTex = null, _concreteTex = null;
function _getCrateTex(type) {
  if (type === 'steel' && _steelTex) return _steelTex;
  if (type === 'concrete' && _concreteTex) return _concreteTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = type === 'steel' ? '#707078' : '#b0a890';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 120, 120);
  ctx.strokeRect(10, 10, 108, 108);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
  ctx.fillText('GPC', 64, 56);
  ctx.font = '12px monospace';
  ctx.fillText('Supply', 64, 76);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  if (type === 'steel') _steelTex = tex; else _concreteTex = tex;
  return tex;
}

// ── Seesaw dimensions ──
const PLANK_LEN = 8;
const PLANK_W = 1.8;
const PLANK_H = 0.18;
const FULCRUM_H = 1.0;
const PLATFORM_H = 2.0;
const PLATFORM_W = 2.2;
const PLATFORM_D = 2.2;
const CRATE_SIZE = 0.8;

// ── Layout (near side — +Z, visible from player spawn at 50,0,45) ──
const SEESAW_X = 50;
const SEESAW_Z = 80;
const TOWER_CENTER = new THREE.Vector3(0, 0, 0);

// ── Physics ──
const FLOOR_H = 3.333;
const CRATE_GRAVITY = 18;

// ── Power meter zones ──
const GREEN_MIN = 0.73;
const YELLOW_MIN = 0.42;

// ── Per-floor flavor text ──
const FLOOR_MSGS = [
  ['FLOOR 1 DELIVERED', 'The foundation of something greater'],
  ['FLOOR 2 DELIVERED', 'Two floors and counting'],
  ['FLOOR 3 DELIVERED', 'The tower takes shape'],
  ['FLOOR 4 DELIVERED', 'Higher than the treeline now'],
  ['FLOOR 5 DELIVERED', 'Halfway to the sky'],
  ['FLOOR 6 DELIVERED', 'The air is getting thinner'],
  ['FLOOR 7 DELIVERED', 'Four crates per floor now — the real work begins'],
  ['FLOOR 8 DELIVERED', 'Almost there'],
  ['FLOOR 9 DELIVERED', 'One more to go'],
  ['FLOOR 10 DELIVERED', 'Segment 1 structure complete'],
];

// ── Helpers ──
function _matsForFloor(fi) { return fi < 5 ? 2 : 4; }
function _meterPeriod(fi) { return 2.5 - fi * 0.13; }
function _requiredVel(h) { return Math.sqrt(2 * CRATE_GRAVITY * h); }
function _easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

// ── Save key ──
const SAVE_KEY = 'spacetower_scaffolding';
function _saveProgress(floor, delivered) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ f: floor, d: delivered })); } catch {}
}
function _loadProgress() {
  try { const r = localStorage.getItem(SAVE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}

const _tmpV = new THREE.Vector3();

/**
 * @param {THREE.Scene} scene
 * @param {number} initialRoofY
 * @param {number} floorsBuilt
 * @param {Function} onFloorComplete — called with (floorIndex)
 */
export function buildScaffoldingGame(scene, initialRoofY, floorsBuilt, onFloorComplete) {

  let _roofY = initialRoofY;

  // ═══════════════════════════════════════
  // ROOT GROUP (on GROUND, rotated to face tower)
  // ═══════════════════════════════════════
  const root = new THREE.Group();
  root.position.set(SEESAW_X, 0, SEESAW_Z);
  const toTower = new THREE.Vector3(TOWER_CENTER.x - SEESAW_X, 0, TOWER_CENTER.z - SEESAW_Z);
  root.rotation.y = Math.atan2(toTower.x, toTower.z);
  scene.add(root);

  // Directional vectors (world space, normalized)
  const _fwdDir = toTower.clone().normalize();  // toward tower
  const _backDir = _fwdDir.clone().negate();     // away from tower
  // Side direction (perpendicular, for wide camera)
  const _sideDir = new THREE.Vector3().crossVectors(_fwdDir, new THREE.Vector3(0, 1, 0)).normalize();

  // ═══════════════════════════════════════
  // FULCRUM
  // ═══════════════════════════════════════
  const fShape = new THREE.Shape();
  fShape.moveTo(-0.8, 0); fShape.lineTo(0.8, 0); fShape.lineTo(0, FULCRUM_H); fShape.closePath();
  const fGeo = new THREE.ExtrudeGeometry(fShape, { depth: PLANK_W, bevelEnabled: false });
  fGeo.translate(0, 0, -PLANK_W / 2);
  root.add(new THREE.Mesh(_colorGeo(fGeo, 0x8a7060), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // ═══════════════════════════════════════
  // PLANK (+Z = toward tower = crate end)
  // ═══════════════════════════════════════
  const plankPivot = new THREE.Group();
  plankPivot.position.y = FULCRUM_H;
  root.add(plankPivot);
  plankPivot.add(new THREE.Mesh(
    _colorGeo(new THREE.BoxGeometry(PLANK_W, PLANK_H, PLANK_LEN), 0xc4a060),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  ));
  // Green marker on jump end (-Z side)
  const marker = new THREE.Mesh(
    _colorGeo(new THREE.BoxGeometry(PLANK_W - 0.3, 0.03, 0.6), 0x40c060),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  marker.position.set(0, PLANK_H / 2 + 0.015, -PLANK_LEN / 2 + 0.5);
  plankPivot.add(marker);

  // ═══════════════════════════════════════
  // JUMP PLATFORM (-Z side = away from tower)
  // ═══════════════════════════════════════
  const pGeos = [];
  pGeos.push(_colorGeo(new THREE.BoxGeometry(PLATFORM_W, PLATFORM_H, PLATFORM_D), 0x686868));
  pGeos[0].translate(0, PLATFORM_H / 2, 0);
  pGeos.push(_colorGeo(new THREE.BoxGeometry(PLATFORM_W + 0.15, 0.1, PLATFORM_D + 0.15), 0x787878));
  pGeos[1].translate(0, PLATFORM_H + 0.05, 0);
  pGeos.push(_colorGeo(new THREE.BoxGeometry(PLATFORM_W + 0.1, 0.2, 0.5), 0x606060));
  pGeos[2].translate(0, 0.1, PLATFORM_D / 2 + 0.25);
  pGeos.push(_colorGeo(new THREE.BoxGeometry(PLATFORM_W + 0.1, 0.2, 0.5), 0x606060));
  pGeos[3].translate(0, PLATFORM_H * 0.5, PLATFORM_D / 2 + 0.25);
  const platMerged = mergeGeometries(pGeos, false);
  const platformMesh = new THREE.Mesh(platMerged, new THREE.MeshBasicMaterial({ vertexColors: true }));
  platformMesh.position.set(0, 0, -PLANK_LEN / 2 - PLATFORM_D / 2 - 0.6);
  root.add(platformMesh);
  pGeos.forEach(g => g.dispose());

  // ═══════════════════════════════════════
  // STOCKPILE (decorative GPC crates near tower end)
  // ═══════════════════════════════════════
  const stockGroup = new THREE.Group();
  stockGroup.position.set(3, 0, PLANK_LEN / 2 + 2);
  root.add(stockGroup);
  for (let i = 0; i < 10; i++) {
    const spots = [[0,0,0],[0.9,0,0],[-0.8,0,0.35],[0.35,0,0.8],[-0.5,0,-0.6],
      [1.0,0,-0.45],[0,0.8,0.12],[0.65,0.8,-0.12],[-0.35,0.8,0.45],[0.2,1.6,0.12]];
    const [cx, cy, cz] = spots[i];
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE),
      new THREE.MeshBasicMaterial({ map: _getCrateTex(i % 2 === 0 ? 'steel' : 'concrete') })
    );
    m.position.set(cx, cy + CRATE_SIZE / 2, cz);
    m.rotation.y = Math.random() * 0.3 - 0.15;
    stockGroup.add(m);
  }

  // ═══════════════════════════════════════
  // CRATE ON SEESAW (local space)
  // ═══════════════════════════════════════
  const loadedCrate = new THREE.Mesh(
    new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE),
    new THREE.MeshBasicMaterial({ map: _getCrateTex('steel') })
  );
  loadedCrate.visible = false;
  root.add(loadedCrate);

  // ═══════════════════════════════════════
  // ACTIVE CRATE (world space, flies through air)
  // ═══════════════════════════════════════
  const crateMat = new THREE.MeshBasicMaterial({ map: _getCrateTex('steel') });
  const crateMesh = new THREE.Mesh(new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE), crateMat);
  crateMesh.visible = false;
  scene.add(crateMesh);

  // ═══════════════════════════════════════
  // BULLSEYE TARGET (on roof, world space)
  // ═══════════════════════════════════════
  const bullseyeGroup = new THREE.Group();
  const ringColors = [0xcc2020, 0xffffff, 0xcc2020, 0xffffff, 0xcc2020];
  const ringRadii = [15, 12, 9, 6, 3];
  for (let i = 0; i < ringRadii.length; i++) {
    const inner = i < ringRadii.length - 1 ? ringRadii[i + 1] : 0;
    const geo = inner > 0
      ? new THREE.RingGeometry(inner, ringRadii[i], 32)
      : new THREE.CircleGeometry(ringRadii[i], 32);
    const mat = new THREE.MeshBasicMaterial({
      color: ringColors[i], transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    bullseyeGroup.add(ring);
  }
  bullseyeGroup.position.set(0, _roofY + 0.08, 0);
  scene.add(bullseyeGroup);

  // ═══════════════════════════════════════
  // CONSTRUCTION PROGRESS (at ROOF level)
  // ═══════════════════════════════════════
  const conGroup = new THREE.Group();
  scene.add(conGroup);
  let _stages = [];

  // Shared geometry + materials (allocated once, reused across floor rebuilds)
  const _hw = 37, _colW = 0.6;
  const _colGeo = new THREE.BoxGeometry(_colW, FLOOR_H, _colW);
  const _beamGeoH = new THREE.BoxGeometry(_hw * 2, _colW * 0.7, _colW);
  const _beamGeoV = new THREE.BoxGeometry(_colW, _colW * 0.7, _hw * 2);
  const _plateGeo = new THREE.BoxGeometry(_hw * 2, 0.1, _hw * 2);
  const _colMat = new THREE.MeshBasicMaterial({ color: 0x808890 });
  const _beamMat = new THREE.MeshBasicMaterial({ color: 0x707880 });
  const _plateMat = new THREE.MeshBasicMaterial({ color: 0x606870, transparent: true, opacity: 0.6 });

  function _buildStages(floorY, matCount) {
    // Hide + remove old stage meshes (geometries are shared, don't dispose)
    _stages.forEach(s => s.forEach(m => { conGroup.remove(m); }));
    _stages = [];
    const corners = [[-_hw,-_hw],[-_hw,_hw],[_hw,-_hw],[_hw,_hw]];
    const mids = [[0,-_hw],[0,_hw],[-_hw,0],[_hw,0]];
    function _addCol(arr, cx, cz) {
      const c = new THREE.Mesh(_colGeo, _colMat);
      c.position.set(cx, floorY + FLOOR_H / 2, cz); c.visible = false; conGroup.add(c); arr.push(c);
    }
    function _addBeam(arr, bx, bz, horiz) {
      const b = new THREE.Mesh(horiz ? _beamGeoH : _beamGeoV, _beamMat);
      b.position.set(bx, floorY + FLOOR_H, bz); b.visible = false; conGroup.add(b); arr.push(b);
    }
    function _addPlate(arr) {
      const p = new THREE.Mesh(_plateGeo, _plateMat);
      p.position.set(0, floorY + 0.05, 0); p.visible = false; conGroup.add(p); arr.push(p);
    }
    if (matCount === 2) {
      const s1 = []; corners.forEach(([cx,cz]) => _addCol(s1, cx, cz)); _stages.push(s1);
      const s2 = [];
      _addBeam(s2, 0, -_hw, true); _addBeam(s2, 0, _hw, true);
      _addBeam(s2, -_hw, 0, false); _addBeam(s2, _hw, 0, false);
      _addPlate(s2); _stages.push(s2);
    } else {
      const s1 = []; corners.forEach(([cx,cz]) => _addCol(s1, cx, cz)); _stages.push(s1);
      const s2 = []; mids.forEach(([cx,cz]) => _addCol(s2, cx, cz)); _stages.push(s2);
      const s3 = [];
      _addBeam(s3, 0, -_hw, true); _addBeam(s3, 0, _hw, true);
      _addBeam(s3, -_hw, 0, false); _addBeam(s3, _hw, 0, false);
      _stages.push(s3);
      const s4 = []; _addPlate(s4); _stages.push(s4);
    }
  }

  // ═══════════════════════════════════════
  // REVEAL (spinning item + floating label after crate opens)
  // ═══════════════════════════════════════
  const STAGE_LABELS_2 = ['STEEL COLUMNS', 'BEAMS & FLOOR PLATE'];
  const STAGE_LABELS_4 = ['CORNER COLUMNS', 'MID COLUMNS', 'CROSS BEAMS', 'FLOOR PLATE'];
  const _revealGroup = new THREE.Group();
  _revealGroup.visible = false;
  scene.add(_revealGroup);

  // Spinning preview mesh (simple box, tinted bright)
  const _revealMat = new THREE.MeshBasicMaterial({ color: 0xffd700, wireframe: true });
  const _revealMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), _revealMat);
  _revealMesh.position.y = 2;
  _revealGroup.add(_revealMesh);

  // Floating text label (canvas texture on a plane)
  const _labelCanvas = document.createElement('canvas');
  _labelCanvas.width = 512; _labelCanvas.height = 128;
  const _labelTex = new THREE.CanvasTexture(_labelCanvas);
  _labelTex.minFilter = THREE.LinearFilter;
  const _labelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 4),
    new THREE.MeshBasicMaterial({ map: _labelTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  _labelMesh.position.y = 6;
  _revealGroup.add(_labelMesh);

  function _showReveal(stageIdx, matCount) {
    const labels = matCount === 2 ? STAGE_LABELS_2 : STAGE_LABELS_4;
    const label = labels[stageIdx] || 'MATERIALS';
    // Draw text on canvas
    const ctx = _labelCanvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 52);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '24px monospace';
    ctx.fillText(`${stageIdx + 1}/${matCount}`, 256, 100);
    _labelTex.needsUpdate = true;
    // Position at crate landing (bullseye center, on roof)
    _revealGroup.position.set(0, _roofY, 0);
    _revealGroup.visible = true;
    _revealMesh.scale.set(1, 1, 1);
  }

  function _hideReveal() { _revealGroup.visible = false; }

  function _updateReveal(dt, camPos) {
    if (!_revealGroup.visible) return;
    _revealMesh.rotation.y += dt * 2.5;
    // Gentle float
    _revealMesh.position.y = 2 + Math.sin(performance.now() * 0.003) * 0.3;
    _labelMesh.position.y = 6 + Math.sin(performance.now() * 0.003) * 0.2;
    // Billboard the label toward camera
    if (camPos) {
      const worldPos = _revealGroup.localToWorld(_labelMesh.position.clone());
      _labelMesh.lookAt(camPos);
    }
  }

  // ═══════════════════════════════════════
  // POWER METER (near player, center-right)
  // ═══════════════════════════════════════
  let meterEl = null, meterLine = null;
  function _ensureMeter() {
    if (meterEl) return;
    meterEl = document.createElement('div');
    meterEl.style.cssText = 'position:fixed;left:22%;bottom:22%;width:20px;height:160px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:4px;z-index:70;overflow:hidden;pointer-events:none;display:none';
    const g = document.createElement('div');
    g.style.cssText = `position:absolute;top:0;left:0;right:0;height:${(1 - GREEN_MIN) * 100}%;background:rgba(80,200,80,0.3);border-bottom:1px solid rgba(80,200,80,0.4)`;
    meterEl.appendChild(g);
    const y = document.createElement('div');
    y.style.cssText = `position:absolute;top:${(1 - GREEN_MIN) * 100}%;left:0;right:0;height:${(GREEN_MIN - YELLOW_MIN) * 100}%;background:rgba(200,200,60,0.2)`;
    meterEl.appendChild(y);
    const r = document.createElement('div');
    r.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:${YELLOW_MIN * 100}%;background:rgba(200,60,60,0.2)`;
    meterEl.appendChild(r);
    meterLine = document.createElement('div');
    meterLine.style.cssText = 'position:absolute;left:-3px;right:-3px;height:3px;background:#fff;border-radius:2px;box-shadow:0 0 4px rgba(255,255,255,0.5)';
    meterEl.appendChild(meterLine);
    document.body.appendChild(meterEl);
  }
  function _showMeter() { _ensureMeter(); meterEl.style.display = ''; }
  function _hideMeter() { if (meterEl) meterEl.style.display = 'none'; }
  function _setMeter(v) {
    if (!meterLine) return;
    meterLine.style.top = ((1 - v) * 100) + '%';
    if (v >= GREEN_MIN) { meterLine.style.background = '#60ff60'; meterLine.style.boxShadow = '0 0 8px rgba(80,255,80,0.8)'; }
    else if (v >= YELLOW_MIN) { meterLine.style.background = '#ffff60'; meterLine.style.boxShadow = '0 0 5px rgba(255,255,60,0.5)'; }
    else { meterLine.style.background = '#ff6060'; meterLine.style.boxShadow = '0 0 5px rgba(255,60,60,0.5)'; }
  }

  // ═══════════════════════════════════════
  // BANNER + HINT
  // ═══════════════════════════════════════
  let bannerEl = null, bannerTimer = 0;
  function _banner(title, sub) {
    if (!bannerEl) {
      bannerEl = document.createElement('div');
      bannerEl.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);z-index:75;text-align:center;pointer-events:none;font-family:monospace;transition:opacity 0.6s';
      document.body.appendChild(bannerEl);
    }
    bannerEl.innerHTML = `<div style="color:#FFD700;font-size:14px;font-weight:bold;letter-spacing:0.12em">${title}</div>` +
      (sub ? `<div style="color:rgba(255,255,255,0.5);font-size:9px;margin-top:5px">${sub}</div>` : '');
    bannerEl.style.opacity = '1';
    bannerTimer = 3.5;
  }

  let hintEl = null;
  function _showHint(text) {
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.style.cssText = 'position:fixed;bottom:8%;left:50%;transform:translateX(-50%);z-index:70;color:rgba(255,255,255,0.5);font:10px monospace;pointer-events:none;letter-spacing:0.08em;transition:opacity 0.3s;text-align:center';
      document.body.appendChild(hintEl);
    }
    hintEl.textContent = text; hintEl.style.opacity = '1';
  }
  function _hideHint() { if (hintEl) hintEl.style.opacity = '0'; }

  // ═══════════════════════════════════════
  // SCREEN SHAKE
  // ═══════════════════════════════════════
  let _shakeT = 0, _shakeIntensity = 0;
  let _entryFrames = 0; // fast camera convergence on first few frames

  // ═══════════════════════════════════════
  // STATE
  // idle|ready|jumping|slam|pull|flight|birdseye|miss_reset
  // ═══════════════════════════════════════
  const st = {
    operating: false,
    floor: floorsBuilt,
    delivered: 0,
    required: _matsForFloor(floorsBuilt),
    phase: 'idle',
    timer: 0,
    meterVal: 0, meterDir: 1,
    power: 0,
    crateType: 'steel',
    cratePos: new THREE.Vector3(),
    crateVel: new THREE.Vector3(),
    jumpT: 0,
    jumpStart: new THREE.Vector3(),
    jumpEnd: new THREE.Vector3(),
    seesawAngle: 0, seesawTarget: 0,
    skipRequested: false,
    _pg: null,
  };

  const saved = _loadProgress();
  if (saved && saved.f >= floorsBuilt && saved.f < 10) {
    st.floor = saved.f; st.delivered = saved.d || 0; st.required = _matsForFloor(st.floor);
  }

  // ═══════════════════════════════════════
  // WORLD-SPACE HELPERS
  // ═══════════════════════════════════════
  function _platformWorldPos() {
    _tmpV.set(0, PLATFORM_H, -PLANK_LEN / 2 - PLATFORM_D / 2 - 0.6);
    root.localToWorld(_tmpV); return _tmpV;
  }
  function _jumpLandWorldPos() {
    _tmpV.set(0, FULCRUM_H + PLANK_H / 2 + 0.3, -PLANK_LEN / 2 + 0.5);
    root.localToWorld(_tmpV); return _tmpV;
  }
  function _crateWorldPos() {
    _tmpV.set(0, FULCRUM_H + CRATE_SIZE, PLANK_LEN / 2 - 0.5);
    root.localToWorld(_tmpV); return _tmpV;
  }

  // ═══════════════════════════════════════
  // CRATE PHYSICS (runs during pull, flight, birdseye, miss_reset)
  // ═══════════════════════════════════════
  function _updateCratePhysics(dt) {
    if (!crateMesh.visible) return;
    st.crateVel.y -= CRATE_GRAVITY * dt;
    st.cratePos.x += st.crateVel.x * dt;
    st.cratePos.y += st.crateVel.y * dt;
    st.cratePos.z += st.crateVel.z * dt;
    if (st.cratePos.y < 0) { st.cratePos.y = 0; st.crateVel.set(0, 0, 0); }
    crateMesh.position.copy(st.cratePos);
    crateMesh.rotation.x += dt * 5;
    crateMesh.rotation.z += dt * 3;
  }

  // ═══════════════════════════════════════
  // PHASE HELPERS
  // ═══════════════════════════════════════
  function _loadCrateOnSeesaw() {
    st.crateType = (st.delivered % 2 === 0) ? 'steel' : 'concrete';
    loadedCrate.material.map = _getCrateTex(st.crateType);
    loadedCrate.material.needsUpdate = true;
    loadedCrate.position.set(0, FULCRUM_H + PLANK_H / 2 + CRATE_SIZE / 2, PLANK_LEN / 2 - 0.5);
    loadedCrate.rotation.set(0, 0, 0);
    loadedCrate.visible = true;
    crateMesh.visible = false;
  }

  function _goReady() {
    st.phase = 'ready'; st.meterVal = 0; st.meterDir = 1; st.seesawTarget = 0;
    st.skipRequested = false;
    _loadCrateOnSeesaw();
    _showMeter();
    _showHint(`SPACE — launch  ·  ESC — exit  ·  Floor ${st.floor + 1}  (${st.delivered}/${st.required})`);
  }

  function _goJump(power) {
    st.phase = 'jumping'; st.timer = 0; st.power = power;
    _hideMeter(); _hideHint();
    if (st._pg) {
      st.jumpStart.copy(st._pg.position);
      st.jumpEnd.copy(_jumpLandWorldPos());
      st.jumpT = 0;
    }
  }

  function _goSlam() {
    st.phase = 'slam'; st.timer = 0;
    st.seesawTarget = -0.15 - st.power * 0.45;
    loadedCrate.visible = false;
    sndLaunch();

    if (st.power >= GREEN_MIN) { _shakeT = 0.3; _shakeIntensity = 0.4; }
    else if (st.power >= YELLOW_MIN) { _shakeT = 0.15; _shakeIntensity = 0.15; }

    // Prepare crate launch
    crateMat.map = _getCrateTex(st.crateType); crateMat.needsUpdate = true;
    const wp = _crateWorldPos();
    st.cratePos.copy(wp);

    const targetH = _roofY + 2;
    const reqV = _requiredVel(targetH);
    const maxVel = reqV / GREEN_MIN;
    const launchVel = st.power * maxVel;

    const dx = TOWER_CENTER.x - wp.x, dz = TOWER_CENTER.z - wp.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const tApex = launchVel / CRATE_GRAVITY;
    const horizSpeed = (dist * 0.6) / Math.max(tApex, 0.5);
    st.crateVel.set((dx / dist) * horizSpeed, launchVel, (dz / dist) * horizSpeed);

    crateMesh.position.copy(st.cratePos);
    crateMesh.rotation.set(0, 0, 0);
    crateMesh.visible = true;
  }

  function _goPull() {
    st.phase = 'pull'; st.timer = 0;
    // Return player to platform
    if (st._pg) { const pp = _platformWorldPos(); st._pg.position.copy(pp); }
  }

  function _goFlight() { st.phase = 'flight'; st.timer = 0; sndCrateFly(); }

  function _checkCatchOrMiss() {
    const peakH = st.cratePos.y;
    if (peakH >= _roofY) {
      // HIT → bird's eye (stages revealed during birdseye phase, not here)
      st.phase = 'birdseye'; st.timer = 0; st.skipRequested = false;
      st._floorCompleted = false;
      sndCrateHit();
      st.delivered++;
      _saveProgress(st.floor, st.delivered);
      if (st.delivered >= st.required) {
        const [title, sub] = FLOOR_MSGS[st.floor] || ['MATERIALS DELIVERED', ''];
        _banner(title, sub);
      } else {
        _banner('CAUGHT!', `${st.delivered}/${st.required} materials delivered`);
      }
    } else {
      // MISS → quick reset (no cinematic)
      st.phase = 'miss_reset'; st.timer = 0; sndCrateMiss();
      const pct = Math.round((peakH / _roofY) * 100);
      _banner('MISSED', `Reached ${pct}% of the height needed`);
    }
  }


  // ═══════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════
  function update(dt, keys) {
    if (_exitCooldown > 0) _exitCooldown -= dt;
    if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0 && bannerEl) bannerEl.style.opacity = '0'; }
    if (_shakeT > 0) _shakeT -= dt;

    st.seesawAngle += (st.seesawTarget - st.seesawAngle) * Math.min(dt * 10, 1);
    plankPivot.rotation.x = st.seesawAngle;

    if (!st.operating) return;
    const pg = st._pg;

    switch (st.phase) {

    case 'ready': {
      const spd = 2 / _meterPeriod(st.floor);
      st.meterVal += st.meterDir * spd * dt;
      if (st.meterVal >= 1) { st.meterVal = 1; st.meterDir = -1; }
      if (st.meterVal <= 0) { st.meterVal = 0; st.meterDir = 1; }
      _setMeter(st.meterVal);
      if (pg) {
        pg.position.copy(_platformWorldPos());
        pg.rotation.set(0, root.rotation.y, 0);
        const ud = pg.userData;
        if (ud.torso) {
          ud.torso.position.y += (0.52 - ud.torso.position.y) * 0.2;
          ud.leftLeg.rotation.x *= 0.9; ud.rightLeg.rotation.x *= 0.9;
          ud.leftArm.rotation.x *= 0.9; ud.rightArm.rotation.x *= 0.9;
          ud.torso.rotation.z = 0; ud.leftArm.rotation.z = 0; ud.rightArm.rotation.z = 0;
        }
      }
      break;
    }

    case 'jumping': {
      const arcHeight = 1.5 + st.power * 3.0;
      const dur = 0.4 + st.power * 0.15;
      st.jumpT = Math.min(st.jumpT + dt / dur, 1);
      const t = st.jumpT;
      if (pg) {
        const s = st.jumpStart, e = st.jumpEnd;
        pg.position.x = s.x + (e.x - s.x) * t;
        pg.position.z = s.z + (e.z - s.z) * t;
        pg.position.y = s.y + (e.y - s.y) * t + Math.sin(Math.PI * t) * arcHeight;
        pg.rotation.y = root.rotation.y;
        const ud = pg.userData;
        if (ud.torso) {
          const tuck = Math.sin(Math.PI * t);
          ud.leftArm.rotation.x = -1.6 * tuck; ud.rightArm.rotation.x = -1.6 * tuck;
          ud.leftLeg.rotation.x = -0.8 * tuck; ud.rightLeg.rotation.x = -0.8 * tuck;
          ud.torso.position.y = 0.52 - 0.06 * tuck;
        }
      }
      if (st.jumpT >= 1) _goSlam();
      break;
    }

    case 'slam': {
      st.timer += dt;
      _updateCratePhysics(dt); // crate already launched, physics running
      if (st.timer >= 0.12 + st.power * 0.2) _goPull();
      break;
    }

    case 'pull': {
      st.timer += dt;
      _updateCratePhysics(dt);
      if (st.timer >= 0.3) _goFlight();
      break;
    }

    case 'flight': {
      st.timer += dt;
      _updateCratePhysics(dt);
      // Check when crate reaches apex
      if (st.crateVel.y < 0) _checkCatchOrMiss();
      if (st.cratePos.y < -2) { st.phase = 'miss_reset'; st.timer = 0; _banner('MISSED', 'Not enough power'); }
      break;
    }

    case 'birdseye': {
      // Full roof cinematic: settle → open → reveal → build → return
      // 0-1.2s:   crate settles, workers converge
      // 1.2s:     crate opens → spinning reveal + label, stage appears
      // 1.2-3.5s: hold on reveal, construction visible
      // 3.5s:     if final delivery → floor complete
      // 4.0-4.8s: ease camera back to wide
      // ≥4.8s:    goReady
      st.timer += dt;
      if (st.skipRequested && st.timer < 4.0) st.timer = 4.0;
      if (pg) { pg.position.copy(_platformWorldPos()); pg.rotation.set(0, root.rotation.y, 0); }

      // Phase 1: crate settles on bullseye
      if (st.timer < 1.2) {
        if (crateMesh.visible) {
          const settleY = _roofY + 0.5;
          crateMesh.position.y += (settleY - crateMesh.position.y) * dt * 5;
          crateMesh.position.x += (0 - crateMesh.position.x) * dt * 4;
          crateMesh.position.z += (0 - crateMesh.position.z) * dt * 4;
          crateMesh.rotation.x *= 0.92; crateMesh.rotation.z *= 0.92;
        }
      }

      // Phase 2: crate opens — show reveal + construction stage
      if (st.timer >= 1.2 && crateMesh.visible) {
        crateMesh.visible = false;
        const stageIdx = st.delivered - 1;
        if (stageIdx >= 0 && stageIdx < _stages.length) {
          _stages[stageIdx].forEach(m => { m.visible = true; });
        }
        _showReveal(stageIdx, st.required);
      }

      // Phase 2-3: animate reveal
      _calcOverheadView();
      _updateReveal(dt, _overPos);

      // Phase 3: floor complete trigger
      if (st.timer >= 3.5 && st.delivered >= st.required && st.phase === 'birdseye') {
        if (!st._floorCompleted) {
          st._floorCompleted = true;
          sndFloorDone();
          const fi = st.floor;
          const [title, sub] = FLOOR_MSGS[fi] || ['FLOOR COMPLETE', ''];
          _banner(title, sub);
          if (onFloorComplete) onFloorComplete(fi);
          st.floor++; st.delivered = 0; st.required = _matsForFloor(st.floor);
          _saveProgress(st.floor, 0);
        }
      }

      // Phase 4: ease back + transition out
      if (st.timer >= 4.0) _hideReveal();
      if (st.timer >= 4.8) {
        st.seesawTarget = 0;
        _hideReveal();
        _stages.forEach(s => s.forEach(m => { m.visible = false; }));
        if (st.floor >= 10) { _doExit(); return; }
        _buildStages(_roofY, st.required);
        _goReady();
      }
      break;
    }

    case 'miss_reset': {
      st.timer += dt;
      if (pg) { pg.position.copy(_platformWorldPos()); pg.rotation.set(0, root.rotation.y, 0); }
      if (crateMesh.visible) {
        st.crateVel.y -= CRATE_GRAVITY * dt * 0.5;
        st.cratePos.y += st.crateVel.y * dt;
        if (st.cratePos.y < 0) { st.cratePos.y = 0; st.crateVel.set(0, 0, 0); }
        crateMesh.position.copy(st.cratePos);
        crateMesh.rotation.x += dt * 6;
      }
      if (st.timer >= 0.8) {
        crateMesh.visible = false;
        st.seesawTarget = 0;
        _goReady();
      }
      break;
    }

    // (building/complete phases removed — floor completion now handled in birdseye)
    }
  }

  // ═══════════════════════════════════════
  // CAMERA
  //
  // Ready/Jump/Slam: wide side view of launcher + tower
  // Pull/Flight: camera slowly raises, look shifts toward bullseye
  // Birdseye (HIT): zoom into landing zone
  // Miss: ease back to wide
  // ═══════════════════════════════════════
  const _camPos = new THREE.Vector3();
  const _camLook = new THREE.Vector3();
  const _widePos = new THREE.Vector3();
  const _wideLook = new THREE.Vector3();
  const _overPos = new THREE.Vector3();
  const _overLook = new THREE.Vector3();

  function _calcWideView() {
    // Lower + closer for better launcher visibility
    const h = Math.max(12, _roofY * 0.3 + 3);
    _widePos.set(SEESAW_X + 42, h, SEESAW_Z + 8);
    _wideLook.set(SEESAW_X * 0.35, 3, SEESAW_Z * 0.4);
  }

  function _calcOverheadView() {
    // Closer zoom into the landing zone
    _overPos.set(15, _roofY + 15, 25);
    _overLook.set(0, _roofY + 0.1, 0);
  }

  function getCameraTarget() {
    if (!st.operating) return null;
    const phase = st.phase;
    // Fast convergence on entry — first 10 frames use high lerp
    const entryBoost = _entryFrames > 0 ? (--_entryFrames, 0.5) : 0;

    // Ready/Jumping/Slam: wide view of the launcher
    if (phase === 'ready' || phase === 'jumping' || phase === 'slam') {
      _calcWideView();
      _camPos.copy(_widePos); _camLook.copy(_wideLook);
      return { pos: _camPos, lookAt: _camLook, lerp: Math.max(0.15, entryBoost) };
    }

    // Pull + Flight: camera follows the crate like a golf ball camera
    if (phase === 'pull' || phase === 'flight') {
      _calcWideView();
      // Camera Y rises with the crate, staying above it for good framing
      const crateY = Math.max(0, st.cratePos.y);
      _camPos.set(_widePos.x, Math.max(_widePos.y, crateY * 0.7 + 8), _widePos.z);
      // Look target IS the crate — camera pans to track it
      _camLook.copy(st.cratePos);
      return { pos: _camPos, lookAt: _camLook, lerp: 0.2 };
    }

    // HIT: full roof cinematic — stay overhead for settle+reveal+build, then ease back
    if (phase === 'birdseye') {
      _calcOverheadView(); _calcWideView();
      const t = st.timer;
      if (t < 4.0) {
        // 0-4.0s: overhead view — crate settles, opens, reveal spins, construction appears
        _camPos.copy(_overPos);
        // First 1.2s: track the settling crate for natural continuity from flight
        // After 1.2s: look at roof center (reveal position)
        if (t < 1.2) {
          _camLook.set(crateMesh.position.x, crateMesh.position.y, crateMesh.position.z);
        } else {
          _camLook.copy(_overLook);
        }
        return { pos: _camPos, lookAt: _camLook, lerp: 0.08 + t * 0.04 };
      } else {
        // 4.0-4.8s: ease back to wide view
        const s = _easeInOut(Math.min((t - 4.0) / 0.8, 1));
        _camPos.lerpVectors(_overPos, _widePos, s);
        _camLook.lerpVectors(_overLook, _wideLook, s);
        return { pos: _camPos, lookAt: _camLook, lerp: 1.0 };
      }
    }

    // MISS: ease back to wide
    if (phase === 'miss_reset') {
      _calcWideView();
      _camPos.copy(_widePos); _camLook.copy(_wideLook);
      return { pos: _camPos, lookAt: _camLook, lerp: 0.12 };
    }

    return null;
  }

  // ═══════════════════════════════════════
  // ENTER / EXIT
  // ═══════════════════════════════════════
  function _doEnter(playerGroup) {
    st.operating = true; st._pg = playerGroup; _entryFrames = 10;
    _buildStages(_roofY, st.required);
    for (let i = 0; i < st.delivered; i++) {
      if (i < _stages.length) _stages[i].forEach(m => { m.visible = true; });
    }
    bullseyeGroup.visible = true;
    _goReady();
  }

  let _exitCooldown = 0;
  function _doExit() {
    st.operating = false; st.phase = 'idle'; st.seesawTarget = 0;
    _exitCooldown = 0.5; // prevent immediate re-entry
    _hideMeter(); _hideHint();
    crateMesh.visible = false; loadedCrate.visible = false;
    bullseyeGroup.visible = false;
    _stages.forEach(s => s.forEach(m => { m.visible = false; }));
    if (st._pg) {
      st._pg.position.set(SEESAW_X + _backDir.x * 5, 0, SEESAW_Z + _backDir.z * 5);
      st._pg = null;
    }
  }

  // ═══════════════════════════════════════
  // KEY HANDLERS
  // ═══════════════════════════════════════
  function handleKeyDown(code) {
    if (!st.operating) return false;
    if (code === 'Escape') return true;
    if (code === 'Space') {
      if (st.phase === 'ready') { _goJump(st.meterVal); return true; }
      if (st.phase === 'birdseye') { st.skipRequested = true; return true; }
    }
    // Any key skips birdseye
    if (st.phase === 'birdseye') { st.skipRequested = true; return true; }
    return true;
  }

  function handleKeyUp() { return false; }

  // ═══════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════
  // Hide bullseye initially (shown when operating)
  bullseyeGroup.visible = false;

  return {
    group: root,
    get isOperating() { return st.operating; },
    get currentFloor() { return st.floor; },
    get materialsDelivered() { return st.delivered; },
    get phase() { return st.phase; },
    get roofY() { return _roofY; },
    get shakeAmount() { return _shakeT > 0 ? _shakeIntensity * (_shakeT / 0.3) : 0; },
    get worldX() { return SEESAW_X; },
    get worldZ() { return SEESAW_Z; },

    getCratePos() { return crateMesh.position; },
    getCameraTarget,

    isNear(pos) {
      if (st.floor >= 10 || _exitCooldown > 0) return false;
      const dx = pos.x - SEESAW_X, dz = pos.z - SEESAW_Z;
      return Math.sqrt(dx * dx + dz * dz) < 8 && Math.abs(pos.y) < 3;
    },

    enter(playerGroup) { _doEnter(playerGroup); },
    exit() { _doExit(); return new THREE.Vector3(SEESAW_X + _backDir.x * 5, 0, SEESAW_Z + _backDir.z * 5); },

    update, handleKeyDown, handleKeyUp,

    setRoofY(y) {
      _roofY = y;
      bullseyeGroup.position.y = y + 0.08;
    },

    dispose() {
      scene.remove(root); scene.remove(crateMesh); scene.remove(conGroup); scene.remove(bullseyeGroup);
      scene.remove(_revealGroup);
      _hideReveal();
      if (meterEl) { meterEl.remove(); meterEl = null; }
      if (bannerEl) { bannerEl.remove(); bannerEl = null; }
      if (hintEl) { hintEl.remove(); hintEl = null; }
    },
  };
}
