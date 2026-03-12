'use strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleHeightmap } from '../terrain.js';

/**
 * PlayableBulldozer — driveable bulldozer that deforms terrain.
 *
 * Controls (while operating):
 *   W/S    — forward / reverse
 *   A/D    — turn left / right
 *   F      — toggle blade down / up
 *   SHIFT  — boost speed
 *   ESC    — exit bulldozer
 *
 * When blade is down and moving, terrain vertices under the blade are pushed
 * downward, creating visible deformation.
 *
 * ARCHITECTURE:
 *   - buildPlayableBulldozer(scene, groundY) → returns bulldozer API object
 *   - Call dozer.update(dt, playerPos, keys) every frame
 *   - dozer.isNear(playerPos) → true if player can press E to enter
 *   - dozer.enter() / dozer.exit() → mount/dismount
 *   - dozer.isOperating → true while player is in the cab
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

// ── Dimensions ──
const BODY_W = 3.0;    // width (x)
const BODY_H = 1.6;    // height
const BODY_L = 5.0;    // length (z)

const CAB_W = 2.2;
const CAB_H = 2.0;
const CAB_D = 2.0;
const CAB_Y_OFF = BODY_H / 2 + CAB_H / 2;

const BLADE_W = 4.0;
const BLADE_H = 1.8;
const BLADE_D = 0.3;

const TREAD_W = 0.6;
const TREAD_H = 0.8;
const TREAD_L = BODY_L + 0.6;

// ── Physics (stunt mode — fast, bouncy, no blade deformation) ──
const ACCEL = 25;
const MAX_SPEED = 55;
const BOOST_SPEED = 80;
const TURN_SPEED = 3.0;
const FRICTION = 0.03;         // per-second exponential decay factor

// ── Jump ──
const JUMP_BASE = 0.08;       // tap jump velocity
const JUMP_MAX = 0.22;        // full charge jump velocity (lower than player's 0.46)
const CHARGE_MAX = 60;         // frames to full charge
const DOZER_GRAVITY = 0.003;   // gravity (heavier than player's 0.0035)
const BOUNCE_FACTOR = 0.4;    // bounciness on terrain landing

// ── Bounds ──
const TREE_LINE_R = 350;       // stop at tree line
const TOWER_EXCLUSION_R = 42;  // don't drive into the tower (just outside 37.5 tower half + margin)

// ── Entry ──
const ENTRY_RANGE = 5.0;

// ── Colors ──
const COL_BODY = 0xd4a020;     // caterpillar yellow
const COL_TREAD = 0x3a3a3a;    // dark grey treads
const COL_CAB = 0xe8b830;      // lighter yellow cab
const COL_CAB_WIN = 0x8cc8e6;  // glass
const COL_BLADE = 0x808080;    // steel blade
const COL_ARM = 0x606060;      // hydraulic arms
const COL_EXHAUST = 0x2a2a2a;  // exhaust stack

/**
 * Build and return the playable bulldozer.
 * @param {THREE.Scene} scene
 * @param {number} groundY - Y position of the ground plane
 * @param {THREE.Mesh} [terrainMesh] - optional deformable terrain mesh
 * @returns {Object} bulldozer API
 */
export function buildPlayableBulldozer(scene, groundY, terrainMesh) {

  // ── Root group ──
  const dozerRoot = new THREE.Group();
  dozerRoot.position.set(80, groundY, 80);
  scene.add(dozerRoot);

  // ════════════════════════════════════════════
  // BODY (main chassis)
  // ════════════════════════════════════════════
  const bodyGeos = [];

  // Main body box
  const body = _colorGeo(new THREE.BoxGeometry(BODY_W, BODY_H, BODY_L), COL_BODY);
  body.translate(0, BODY_H / 2 + TREAD_H, 0);
  bodyGeos.push(body);

  // Engine cover (sloped front top)
  const engineCover = _colorGeo(new THREE.BoxGeometry(BODY_W - 0.2, 0.3, 1.5), COL_BODY);
  engineCover.translate(0, BODY_H + TREAD_H + 0.15, BODY_L / 2 - 1.2);
  bodyGeos.push(engineCover);

  // Exhaust stack
  const exhaust = _colorGeo(new THREE.CylinderGeometry(0.12, 0.15, 1.2, 8), COL_EXHAUST);
  exhaust.translate(-0.6, BODY_H + TREAD_H + 0.6, 0.8);
  bodyGeos.push(exhaust);

  // Exhaust cap
  const exhaustCap = _colorGeo(new THREE.CylinderGeometry(0.18, 0.12, 0.1, 8), COL_EXHAUST);
  exhaustCap.translate(-0.6, BODY_H + TREAD_H + 1.2, 0.8);
  bodyGeos.push(exhaustCap);

  // ── Treads (left + right) ──
  for (const side of [-1, 1]) {
    const treadX = side * (BODY_W / 2 + TREAD_W / 2 + 0.1);
    const tread = _colorGeo(new THREE.BoxGeometry(TREAD_W, TREAD_H, TREAD_L), COL_TREAD);
    tread.translate(treadX, TREAD_H / 2, 0);
    bodyGeos.push(tread);

    // Tread wheels (visual)
    for (let zi = -2; zi <= 2; zi++) {
      const wheel = _colorGeo(new THREE.CylinderGeometry(0.3, 0.3, TREAD_W + 0.05, 8), COL_TREAD);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(treadX, TREAD_H / 2, zi * 1.0);
      bodyGeos.push(wheel);
    }

    // Tread lugs (small ridges)
    for (let zi = -3; zi <= 3; zi++) {
      const lug = _colorGeo(new THREE.BoxGeometry(TREAD_W + 0.08, 0.06, 0.15), COL_TREAD);
      lug.translate(treadX, 0.03, zi * 0.7);
      bodyGeos.push(lug);
    }
  }

  const bodyMerged = mergeGeometries(bodyGeos, false);
  const bodyMesh = new THREE.Mesh(bodyMerged, new THREE.MeshBasicMaterial({ vertexColors: true }));
  dozerRoot.add(bodyMesh);
  bodyGeos.forEach(g => g.dispose());

  // ════════════════════════════════════════════
  // CAB
  // ════════════════════════════════════════════
  const cabGeos = [];
  const cabBody = _colorGeo(new THREE.BoxGeometry(CAB_W, CAB_H, CAB_D), COL_CAB);
  cabBody.translate(0, CAB_Y_OFF + TREAD_H, -0.5);
  cabGeos.push(cabBody);

  // Cab roof
  const cabRoof = _colorGeo(new THREE.BoxGeometry(CAB_W + 0.3, 0.12, CAB_D + 0.3), COL_CAB);
  cabRoof.translate(0, CAB_Y_OFF + TREAD_H + CAB_H / 2 + 0.06, -0.5);
  cabGeos.push(cabRoof);

  // Seat
  const seatBase = _colorGeo(new THREE.BoxGeometry(0.6, 0.15, 0.5), 0x3a3028);
  seatBase.translate(0, CAB_Y_OFF + TREAD_H - CAB_H / 2 + 0.15, -0.6);
  cabGeos.push(seatBase);
  const seatBack = _colorGeo(new THREE.BoxGeometry(0.6, 0.6, 0.12), 0x3a3028);
  seatBack.translate(0, CAB_Y_OFF + TREAD_H - CAB_H / 2 + 0.5, -0.95);
  cabGeos.push(seatBack);

  // Control levers
  for (const lx of [-0.3, 0.3]) {
    const lever = _colorGeo(new THREE.BoxGeometry(0.05, 0.35, 0.05), 0x2a2a2a);
    lever.translate(lx, CAB_Y_OFF + TREAD_H - CAB_H / 2 + 0.3, -0.2);
    cabGeos.push(lever);
  }

  const cabMerged = mergeGeometries(cabGeos, false);
  dozerRoot.add(new THREE.Mesh(cabMerged, new THREE.MeshBasicMaterial({ vertexColors: true })));
  cabGeos.forEach(g => g.dispose());

  // Cab windows (transparent — separate meshes)
  const winMat = new THREE.MeshBasicMaterial({
    color: COL_CAB_WIN, transparent: true, opacity: 0.35, side: THREE.DoubleSide
  });
  // Front window
  const winFront = new THREE.Mesh(new THREE.PlaneGeometry(CAB_W - 0.3, CAB_H * 0.6), winMat);
  winFront.position.set(0, CAB_Y_OFF + TREAD_H + 0.15, -0.5 + CAB_D / 2 + 0.01);
  dozerRoot.add(winFront);
  // Side windows
  for (const sx of [-1, 1]) {
    const winSide = new THREE.Mesh(new THREE.PlaneGeometry(CAB_D - 0.3, CAB_H * 0.55), winMat.clone());
    winSide.rotation.y = Math.PI / 2;
    winSide.position.set(sx * (CAB_W / 2 + 0.01), CAB_Y_OFF + TREAD_H + 0.15, -0.5);
    dozerRoot.add(winSide);
  }

  // ════════════════════════════════════════════
  // BLADE (front — pivots up/down)
  // ════════════════════════════════════════════
  const bladePivot = new THREE.Group();
  bladePivot.position.set(0, TREAD_H + 0.2, BODY_L / 2 + 0.3);
  dozerRoot.add(bladePivot);

  const bladeGeos = [];
  // Main blade
  const blade = _colorGeo(new THREE.BoxGeometry(BLADE_W, BLADE_H, BLADE_D), COL_BLADE);
  blade.translate(0, BLADE_H / 2, 0.5);
  bladeGeos.push(blade);

  // Blade cutting edge (bottom — darker)
  const edge = _colorGeo(new THREE.BoxGeometry(BLADE_W + 0.1, 0.1, BLADE_D + 0.05), 0x505050);
  edge.translate(0, 0.05, 0.5);
  bladeGeos.push(edge);

  // Blade curve (top lip)
  const lip = _colorGeo(new THREE.BoxGeometry(BLADE_W - 0.2, 0.08, 0.5), COL_BLADE);
  lip.translate(0, BLADE_H, 0.25);
  bladeGeos.push(lip);

  const bladeMerged = mergeGeometries(bladeGeos, false);
  bladePivot.add(new THREE.Mesh(bladeMerged, new THREE.MeshBasicMaterial({ vertexColors: true })));
  bladeGeos.forEach(g => g.dispose());

  // Hydraulic arms (connect body to blade)
  for (const ax of [-1.2, 1.2]) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 1.5),
      new THREE.MeshBasicMaterial({ color: COL_ARM })
    );
    arm.position.set(ax, BLADE_H * 0.6, 0);
    bladePivot.add(arm);
  }

  // ════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════
  // Terrain height function — returns Y at (wx, wz). Default: flat at groundY.
  let _terrainHeightFn = null;
  function _getGroundAt(wx, wz) {
    if (_terrainHeightFn) return groundY + _terrainHeightFn(wx, wz);
    return groundY;
  }

  const state = {
    isOperating: false,
    speed: 0,            // current speed (units/sec, positive = forward)
    heading: 0,          // yaw in radians
    bladeDown: false,
    bladeAngle: 0,       // current blade pivot angle (0 = up, negative = down)
    engineIdle: 0,       // idle vibration phase

    // Jump
    onGround: true,
    velY: 0,
    isCharging: false,
    chargeT: 0,
    flipAngle: 0,        // current flip rotation (radians)
    flipInitVel: 0,      // initial jump velocity (for flip timing)
    flipCommitted: false, // true only when charge >= 80%

    // Airtime tracking (for trick detection)
    airFrames: 0,
    airRotation: 0,
    lastHeading: 0,
  };

  // Blade target angles
  const BLADE_UP = 0.3;    // tilted slightly up
  const BLADE_DOWN = -0.15; // tilted down to dig

  state.bladeAngle = BLADE_UP;
  bladePivot.rotation.x = -state.bladeAngle;

  // ════════════════════════════════════════════
  // UPDATE
  // ════════════════════════════════════════════

  const _worldPos = new THREE.Vector3();
  const _bladeWorldPos = new THREE.Vector3();

  function update(dt, playerPos, keys) {
    // Engine idle vibration (always — even when not operating, only on ground)
    state.engineIdle += dt * 8;
    const _curGroundY = _getGroundAt(dozerRoot.position.x, dozerRoot.position.z);
    if (state.onGround) {
      dozerRoot.position.y = _curGroundY + Math.sin(state.engineIdle) * 0.015;
    }

    if (!state.isOperating) return;

    // ── Acceleration (W/S) — immediate, powerful ──
    const boost = (keys['ShiftLeft'] || keys['ShiftRight']);
    const maxSpd = boost ? BOOST_SPEED : MAX_SPEED;

    if (keys['KeyW'] || keys['ArrowUp']) {
      state.speed = Math.min(maxSpd, state.speed + ACCEL * dt);
    } else if (keys['KeyS'] || keys['ArrowDown']) {
      state.speed = Math.max(-maxSpd * 0.4, state.speed - ACCEL * dt);
    } else {
      // Friction (frame-rate independent) — slides further
      state.speed *= Math.pow(1 - FRICTION, dt * 60);
      if (Math.abs(state.speed) < 0.1) state.speed = 0;
    }

    // ── Turning (A/D) — only when moving ──
    if (Math.abs(state.speed) > 0.5) {
      const turnDir = Math.sign(state.speed); // reverse steering in reverse
      if (keys['KeyA'] || keys['ArrowLeft']) state.heading += TURN_SPEED * dt * turnDir;
      if (keys['KeyD'] || keys['ArrowRight']) state.heading -= TURN_SPEED * dt * turnDir;
    }

    // ── Move ──
    const fwdX = Math.sin(state.heading);
    const fwdZ = Math.cos(state.heading);
    let newX = dozerRoot.position.x + fwdX * state.speed * dt;
    let newZ = dozerRoot.position.z + fwdZ * state.speed * dt;

    // ── Bounds ──
    const distFromCenter = Math.sqrt(newX * newX + newZ * newZ);

    // Tree line — clamp to radius
    if (distFromCenter > TREE_LINE_R) {
      const scale = TREE_LINE_R / distFromCenter;
      newX *= scale;
      newZ *= scale;
      state.speed *= 0.5; // slow on hitting boundary
    }

    // Tower exclusion — push out of tower footprint
    if (Math.abs(newX) < TOWER_EXCLUSION_R && Math.abs(newZ) < TOWER_EXCLUSION_R) {
      // Find nearest edge and push to it
      const dxP = TOWER_EXCLUSION_R - newX;
      const dxN = newX + TOWER_EXCLUSION_R;
      const dzP = TOWER_EXCLUSION_R - newZ;
      const dzN = newZ + TOWER_EXCLUSION_R;
      const minD = Math.min(dxP, dxN, dzP, dzN);
      if (minD === dxP) newX = TOWER_EXCLUSION_R;
      else if (minD === dxN) newX = -TOWER_EXCLUSION_R;
      else if (minD === dzP) newZ = TOWER_EXCLUSION_R;
      else newZ = -TOWER_EXCLUSION_R;
      state.speed *= 0.3;
    }

    dozerRoot.position.x = newX;
    dozerRoot.position.z = newZ;

    // ── Jump charge (hold space) ──
    if (keys['Space'] && state.onGround) {
      state.isCharging = true;
      state.chargeT = Math.min(state.chargeT + 1, CHARGE_MAX);
    }

    // ── Gravity + vertical movement ──
    if (!state.onGround) {
      state.velY -= DOZER_GRAVITY;
      dozerRoot.position.y += state.velY;

      // Flip rotation — only at 80%+ charge, full flip at max
      if (state.flipCommitted) {
        const t = (state.flipInitVel - state.velY) / (2 * state.flipInitVel);
        const clamped = Math.max(0, Math.min(1, t));
        const eased = -(Math.cos(Math.PI * clamped) - 1) / 2;
        state.flipAngle = eased * Math.PI * 2;
      }

      // Track airtime and rotation for tricks
      state.airFrames++;
      const headingDelta = state.heading - state.lastHeading;
      state.airRotation += Math.abs(headingDelta);

      // Ground collision (uses terrain height at current position)
      const _landY = _getGroundAt(dozerRoot.position.x, dozerRoot.position.z);
      if (dozerRoot.position.y <= _landY) {
        dozerRoot.position.y = _landY;

        // Bounce off terrain (stronger = more fun)
        if (state.velY < -0.02) {
          state.velY = -state.velY * BOUNCE_FACTOR;
          // Don't fully land — keep in air for bounce
        } else {
          state.velY = 0;
          state.onGround = true;
          // Trick detection on landing
          if (state.airFrames > 30 && state.airRotation > Math.PI * 1.5) {
            // Full flip! (TODO: visual feedback)
          }
          state.airFrames = 0;
          state.airRotation = 0;
        }
        state.flipAngle = 0;
        state.flipInitVel = 0;
        state.flipCommitted = false;
      }
    }

    // Track heading for trick detection
    state.lastHeading = state.heading;

    // Terrain following — when on ground, snap to terrain slope
    if (state.onGround && _terrainHeightFn) {
      const gAtPos = _getGroundAt(newX, newZ);
      dozerRoot.position.y = gAtPos;
    }

    // Apply heading + flip rotation
    dozerRoot.rotation.y = state.heading;
    dozerRoot.rotation.x = state.flipAngle;

    // ── Blade animation ──
    const bladeTarget = state.bladeDown ? BLADE_DOWN : BLADE_UP;
    state.bladeAngle += (bladeTarget - state.bladeAngle) * Math.min(dt * 6, 1);
    bladePivot.rotation.x = -state.bladeAngle;

    // ── Terrain deformation (disabled in stunt mode — exterior is read-only) ──
    // Blade visual still moves but doesn't modify terrain.
  }

  // ════════════════════════════════════════════
  // KEY HANDLERS
  // ════════════════════════════════════════════

  function handleKeyDown(code) {
    if (!state.isOperating) return false;

    // F = toggle blade
    if (code === 'KeyF') {
      state.bladeDown = !state.bladeDown;
      return true;
    }

    // Escape = exit
    if (code === 'Escape') {
      return true; // caller handles exit
    }

    return false;
  }

  function handleKeyUp(code) {
    if (!state.isOperating) return false;

    // Space release = jump!
    if (code === 'Space' && state.isCharging && state.onGround) {
      const t = state.chargeT / CHARGE_MAX;
      state.velY = JUMP_BASE + (JUMP_MAX - JUMP_BASE) * t;
      state.onGround = false;
      state.isCharging = false;
      state.flipInitVel = state.velY;
      state.flipCommitted = t >= 0.8; // only flip at 80%+ charge
      state.chargeT = 0;
      return true;
    }

    return false;
  }

  // ════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════

  return {
    group: dozerRoot,
    bladePivot,

    get isOperating() { return state.isOperating; },
    get speed() { return state.speed; },
    get heading() { return state.heading; },
    get bladeDown() { return state.bladeDown; },

    /** Is the player close enough to enter? */
    isNear(playerPos) {
      dozerRoot.getWorldPosition(_worldPos);
      const dx = playerPos.x - _worldPos.x;
      const dz = playerPos.z - _worldPos.z;
      return Math.sqrt(dx * dx + dz * dz) < ENTRY_RANGE;
    },

    /** Enter the bulldozer */
    enter() {
      state.isOperating = true;
      state.speed = 0;
      state.isCharging = false;
      state.chargeT = 0;
    },

    /** Exit — returns world position for player placement */
    exit() {
      state.isOperating = false;
      state.speed = 0;
      state.isCharging = false;
      state.chargeT = 0;
      // Place player to the side of the bulldozer
      const sideX = Math.cos(state.heading) * 4;
      const sideZ = -Math.sin(state.heading) * 4;
      const px = dozerRoot.position.x + sideX;
      const pz = dozerRoot.position.z + sideZ;
      return new THREE.Vector3(px, _getGroundAt(px, pz), pz);
    },

    /** Update every frame */
    update,

    /** Handle key down (returns true if consumed) */
    handleKeyDown,

    /** Handle key up (returns true if consumed) */
    handleKeyUp,

    /** Set position */
    setPosition(x, z) {
      dozerRoot.position.set(x, groundY, z);
    },

    /** Set heading */
    setHeading(angle) {
      state.heading = angle;
      dozerRoot.rotation.y = angle;
    },

    /** Set terrain mesh for deformation */
    setTerrain(mesh) {
      terrainMesh = mesh;
    },

    /** Set terrain height function for ground following */
    setTerrainHeightFn(fn) {
      _terrainHeightFn = fn;
    },

    /** Get world position */
    getWorldPos() {
      return dozerRoot.position;
    },

    /** Dispose */
    dispose() {
      scene.remove(dozerRoot);
    },
  };
}

/**
 * Build a deformable terrain mesh (flat fallback — used when no heightmap exists).
 * @param {THREE.Scene} scene
 * @param {number} groundY
 * @returns {THREE.Mesh}
 */
export function buildTerrainMesh(scene, groundY) {
  const size = 1500;  // covers out to building ring
  const segs = 80;    // low subdivisions — flat ground doesn't need detail

  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const posAttr = geo.attributes.position;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const dist = Math.sqrt(x * x + z * z);

    const edgeFade = Math.min(1, dist / 700);
    const r = 0.35 - edgeFade * 0.1;
    const g = 0.42 - edgeFade * 0.08;
    const b = 0.22 - edgeFade * 0.06;

    colors[i * 3] = Math.max(0, r);
    colors[i * 3 + 1] = Math.max(0, g);
    colors[i * 3 + 2] = Math.max(0, b);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x111008, emissiveIntensity: 1.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = groundY + 0.15;
  scene.add(mesh);

  return mesh;
}

/**
 * Build terrain mesh from the shared 3D heightmap.
 * Extends to radius ~750 (matching inner ground circle) with heightmap in center.
 * Uses MeshLambertMaterial so cuts/raises show depth through shading.
 * @param {THREE.Scene} scene
 * @param {Float32Array} heightmap - the terrain3d heightmap (201*201)
 * @param {number} segments - vertices per axis (201 = T3D_SEGS+1)
 * @param {number} worldSize - world units extent (400 = T3D_SIZE)
 * @param {number} groundY - Y offset in the exterior scene
 * @returns {THREE.Mesh}
 */
export function buildTerrainMeshFromHeightmap(scene, heightmap, segments, worldSize, groundY) {
  // Visual mesh extends to 1500×1500 (covers out to building ring)
  const meshSize = 1500;
  const meshSegs = 150; // 10 units per cell — balances detail vs performance (~23K verts)
  const hmHalf = worldSize / 2;   // 200 — heightmap extent
  const hmSegsF = segments - 1;   // 200 subdivisions in heightmap

  const geo = new THREE.PlaneGeometry(meshSize, meshSize, meshSegs, meshSegs);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);

    // Sample heightmap if inside its bounds
    let h = 0;
    if (Math.abs(x) < hmHalf && Math.abs(z) < hmHalf) {
      h = sampleHeightmap(heightmap, segments, x, z, worldSize, hmSegsF);
    }
    posAttr.setY(i, h);

    // Vertex color: earthy tones based on elevation
    const dist = Math.sqrt(x * x + z * z);
    const edgeFade = Math.min(1, dist / 700);

    let r, g, b;
    if (h < -0.5) {
      // Below grade: exposed earth/clay — visible brown, not black
      const depth = Math.min(1, Math.abs(h) / 6);
      r = 0.38 - depth * 0.08; g = 0.28 - depth * 0.06; b = 0.16;
    } else if (h > 0.5) {
      // Raised: tan/sandy
      const rise = Math.min(1, h / 6);
      r = 0.36 + rise * 0.12; g = 0.40 - rise * 0.04; b = 0.20 + rise * 0.08;
    } else {
      // Flat: green grass
      r = 0.32; g = 0.42; b = 0.18;
    }

    // Darken edges
    r -= edgeFade * 0.1; g -= edgeFade * 0.08; b -= edgeFade * 0.06;

    colors[i * 3] = Math.max(0, r);
    colors[i * 3 + 1] = Math.max(0, g);
    colors[i * 3 + 2] = Math.max(0, b);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // Lambert + emissive so depressions aren't pure black (ambient floor)
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x111008, emissiveIntensity: 1.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = groundY + 0.15;
  scene.add(mesh);

  return mesh;
}
