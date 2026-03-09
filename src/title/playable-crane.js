'use strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * PlayableCrane — interactive tower crane the player can operate.
 *
 * The player walks up to the crane cab, presses E to climb in, then:
 *   A/D  — rotate the boom (yaw)
 *   W/S  — raise/lower the hook (winch)
 *   Q/E  — extend/retract trolley along boom
 *   SPACE — grab / release payload
 *   F    — LAUNCH mode: hold to charge, release to fling!
 *   ESC  — exit crane
 *
 * Physics: grabbed objects swing on the cable with pendulum physics.
 * Launching applies the boom's angular velocity + trolley speed as
 * an impulse, so spinning fast and releasing = hilarious long-range yeets.
 *
 * ARCHITECTURE:
 *   - buildPlayableCrane(scene, roofY) → returns crane API object
 *   - The crane replaces the old static craneGroup in buildConstructionSite
 *   - Call crane.update(dt, playerPos, keys) every frame
 *   - crane.isNear(playerPos) → true if player can press E to enter
 *   - crane.enter() / crane.exit() → mount/dismount
 *   - crane.isOperating → true while player is in the cab
 */

// ── Vertex color helper (matches title-exterior.js) ──
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

// ── Crane dimensions (to-scale with player ~1 unit tall) ──
const MAST_H = 14;               // mast height above roof
const MAST_W = 0.5;              // mast thickness
const MAST_X = 12;               // mast offset from tower center (on roof)

const CAB_W = 1.8;               // cab width — player (0.28 wide) fits comfortably
const CAB_H = 1.6;               // cab height — player (1.0 tall) can sit inside
const CAB_D = 1.6;               // cab depth

const BOOM_LEN = 55;             // main jib length
const BOOM_H = 0.4;              // boom cross-section
const COUNTER_LEN = 18;          // counter-jib length
const COUNTER_WEIGHT_W = 2.0;    // counterweight block

// Trolley (the thing that slides along the boom)
const TROLLEY_MIN = 3;           // minimum distance from mast
const TROLLEY_MAX = BOOM_LEN - 2;// maximum reach
const TROLLEY_SPEED = 12;        // units/sec

// Winch (cable length)
const CABLE_MIN = 1;             // shortest cable
const CABLE_MAX = 40;            // longest cable (can reach ground from high up)
const WINCH_SPEED = 8;           // units/sec

// Rotation
const ROTATE_SPEED = 0.8;        // radians/sec
const ROTATE_FRICTION = 0.92;    // angular velocity damping per frame
const MAX_ANGULAR_VEL = 3.0;     // rad/sec cap

// Launch
const LAUNCH_CHARGE_MAX = 60;    // frames to full charge
const LAUNCH_MULT = 2.5;         // velocity multiplier on release
const LAUNCH_GRAVITY = 9.8;      // gravity for launched objects

// Pendulum (cable swing)
const PENDULUM_DAMPING = 0.98;
const PENDULUM_GRAVITY = 4.0;

// Hook grab range
const GRAB_RANGE = 3.0;

// Entry range (how close player must be to cab to press E)
const ENTRY_RANGE = 4.0;

// Colors
const COL_MAST = 0xe8a020;       // yellow steel
const COL_BRACE = 0xc08010;      // darker yellow bracing
const COL_CAB = 0x506880;        // blue-grey cab
const COL_CAB_WIN = 0x8cc8e6;    // cab window glass
const COL_COUNTERWEIGHT = 0x606060;
const COL_HOOK = 0x505050;
const COL_CABLE = 0x404040;
const COL_WARNING = 0xff3030;
const COL_TROLLEY = 0x808080;
const COL_SEAT = 0x3a3028;

/**
 * Build and return the playable crane.
 * @param {THREE.Scene} scene
 * @param {number} roofY - Y position of the roof plate
 * @returns {Object} crane API
 */
export function buildPlayableCrane(scene, roofY) {

  // ── Root group (positioned at roof level) ──
  const craneRoot = new THREE.Group();
  craneRoot.position.set(MAST_X, roofY, 0);
  scene.add(craneRoot);

  // ════════════════════════════════════════════
  // STATIC PARTS (don't rotate with the boom)
  // ════════════════════════════════════════════

  // Mast — vertical column
  const mastGeos = [];
  const mastGeo = _colorGeo(new THREE.BoxGeometry(MAST_W, MAST_H, MAST_W), COL_MAST);
  mastGeo.translate(0, MAST_H / 2, 0);
  mastGeos.push(mastGeo);

  // Lattice braces on mast
  for (let y = 0; y < MAST_H; y += 1.2) {
    const brace = _colorGeo(
      new THREE.BoxGeometry(MAST_W + 0.08, 0.06, MAST_W + 0.08),
      COL_BRACE
    );
    brace.translate(0, y, 0);
    mastGeos.push(brace);
  }

  // Base plate (bolted to roof)
  const basePlate = _colorGeo(new THREE.BoxGeometry(2.5, 0.2, 2.5), 0x5a6570);
  basePlate.translate(0, 0.1, 0);
  mastGeos.push(basePlate);

  // Climbing rungs on mast (player climbs these to reach the cab)
  for (let y = 1; y < MAST_H - CAB_H; y += 0.8) {
    const rung = _colorGeo(new THREE.BoxGeometry(0.06, 0.06, MAST_W + 0.4), 0x8a9098);
    rung.translate(0, y, 0);
    mastGeos.push(rung);
  }

  // Warning light at top
  const lightGeo = _colorGeo(new THREE.SphereGeometry(0.15, 8, 6), COL_WARNING);
  lightGeo.translate(0, MAST_H + 0.3, 0);
  mastGeos.push(lightGeo);

  const mastMerged = mergeGeometries(mastGeos, false);
  const mastMesh = new THREE.Mesh(mastMerged, new THREE.MeshBasicMaterial({ vertexColors: true }));
  craneRoot.add(mastMesh);
  mastGeos.forEach(g => g.dispose());

  // ════════════════════════════════════════════
  // ROTATING PARTS (boom assembly — rotates on Y axis)
  // ════════════════════════════════════════════

  const boomPivot = new THREE.Group();
  boomPivot.position.y = MAST_H;
  craneRoot.add(boomPivot);

  // Top cap (triangular A-frame above mast for support cables)
  const aFrameGeos = [];
  const aFrameH = 2.5;
  const aFramePost = _colorGeo(new THREE.BoxGeometry(0.15, aFrameH, 0.15), COL_MAST);
  aFramePost.translate(0, aFrameH / 2, 0);
  aFrameGeos.push(aFramePost);
  const aFrameMerged = mergeGeometries(aFrameGeos, false);
  boomPivot.add(new THREE.Mesh(aFrameMerged, new THREE.MeshBasicMaterial({ vertexColors: true })));
  aFrameGeos.forEach(g => g.dispose());

  // Main jib (boom)
  const boomGeos = [];
  const mainJib = _colorGeo(new THREE.BoxGeometry(BOOM_LEN, BOOM_H, BOOM_H), COL_MAST);
  mainJib.translate(BOOM_LEN / 2 - 2, 0, 0);
  boomGeos.push(mainJib);

  // Lattice cross-braces along boom
  for (let bx = 0; bx < BOOM_LEN - 4; bx += 3) {
    const lb = _colorGeo(new THREE.BoxGeometry(0.06, BOOM_H + 0.1, 0.06), COL_BRACE);
    lb.translate(bx, 0, 0);
    boomGeos.push(lb);
  }

  // Counter-jib (back arm)
  const counterJib = _colorGeo(new THREE.BoxGeometry(COUNTER_LEN, BOOM_H, BOOM_H), COL_MAST);
  counterJib.translate(-COUNTER_LEN / 2, 0, 0);
  boomGeos.push(counterJib);

  // Counterweight
  const cw = _colorGeo(new THREE.BoxGeometry(COUNTER_WEIGHT_W, 1.0, 0.8), COL_COUNTERWEIGHT);
  cw.translate(-COUNTER_LEN + 1, -0.3, 0);
  boomGeos.push(cw);

  const boomMerged = mergeGeometries(boomGeos, false);
  const boomMesh = new THREE.Mesh(boomMerged, new THREE.MeshBasicMaterial({ vertexColors: true }));
  boomPivot.add(boomMesh);
  boomGeos.forEach(g => g.dispose());

  // Support cables (lines from A-frame top to boom tip and counter-jib end)
  const cableTopY = aFrameH;
  const supportMat = new THREE.LineBasicMaterial({ color: COL_BRACE, transparent: true, opacity: 0.6 });

  const fwdCableGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, cableTopY, 0),
    new THREE.Vector3(BOOM_LEN - 4, 0, 0)
  ]);
  boomPivot.add(new THREE.Line(fwdCableGeo, supportMat));

  const backCableGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, cableTopY, 0),
    new THREE.Vector3(-COUNTER_LEN + 2, 0, 0)
  ]);
  boomPivot.add(new THREE.Line(backCableGeo, supportMat));

  // ════════════════════════════════════════════
  // CAB (attached to boom pivot, hangs below boom at mast intersection)
  // ════════════════════════════════════════════

  const cabGroup = new THREE.Group();
  cabGroup.position.set(0, -CAB_H / 2 - 0.1, 0);
  boomPivot.add(cabGroup);

  // Cab body
  const cabGeos = [];
  const cabBody = _colorGeo(new THREE.BoxGeometry(CAB_W, CAB_H, CAB_D), COL_CAB);
  cabGeos.push(cabBody);

  // Floor (slightly darker)
  const cabFloor = _colorGeo(new THREE.BoxGeometry(CAB_W - 0.1, 0.08, CAB_D - 0.1), 0x3a4450);
  cabFloor.translate(0, -CAB_H / 2 + 0.04, 0);
  cabGeos.push(cabFloor);

  // Seat (where the player sits)
  const seatBase = _colorGeo(new THREE.BoxGeometry(0.5, 0.15, 0.5), COL_SEAT);
  seatBase.translate(0, -CAB_H / 2 + 0.15, -0.15);
  cabGeos.push(seatBase);
  const seatBack = _colorGeo(new THREE.BoxGeometry(0.5, 0.5, 0.1), COL_SEAT);
  seatBack.translate(0, -CAB_H / 2 + 0.42, -0.38);
  cabGeos.push(seatBack);

  // Control levers (two little sticks)
  for (const lx of [-0.25, 0.25]) {
    const lever = _colorGeo(new THREE.BoxGeometry(0.04, 0.3, 0.04), 0x2a2a2a);
    lever.translate(lx, -CAB_H / 2 + 0.3, 0.3);
    cabGeos.push(lever);
    // Lever knob
    const knob = _colorGeo(new THREE.SphereGeometry(0.04, 6, 4), 0xff3030);
    knob.translate(lx, -CAB_H / 2 + 0.46, 0.3);
    cabGeos.push(knob);
  }

  const cabMerged = mergeGeometries(cabGeos, false);
  cabGroup.add(new THREE.Mesh(cabMerged, new THREE.MeshBasicMaterial({ vertexColors: true })));
  cabGeos.forEach(g => g.dispose());

  // Windows (transparent — separate meshes)
  // Front window (facing outward along boom)
  const winFront = new THREE.Mesh(
    new THREE.PlaneGeometry(CAB_W - 0.3, CAB_H * 0.55),
    new THREE.MeshBasicMaterial({ color: COL_CAB_WIN, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
  );
  winFront.position.set(0, 0.1, CAB_D / 2 + 0.01);
  cabGroup.add(winFront);

  // Bottom window (floor glass — the terrifying view down)
  const winBottom = new THREE.Mesh(
    new THREE.PlaneGeometry(CAB_W - 0.4, CAB_D - 0.4),
    new THREE.MeshBasicMaterial({ color: COL_CAB_WIN, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  winBottom.rotation.x = Math.PI / 2;
  winBottom.position.y = -CAB_H / 2 + 0.02;
  cabGroup.add(winBottom);

  // Side windows
  for (const sx of [-1, 1]) {
    const winSide = new THREE.Mesh(
      new THREE.PlaneGeometry(CAB_D - 0.3, CAB_H * 0.5),
      new THREE.MeshBasicMaterial({ color: COL_CAB_WIN, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    winSide.rotation.y = Math.PI / 2;
    winSide.position.set(sx * (CAB_W / 2 + 0.01), 0.1, 0);
    cabGroup.add(winSide);
  }

  // ════════════════════════════════════════════
  // TROLLEY (slides along the boom)
  // ════════════════════════════════════════════

  const trolleyGroup = new THREE.Group();
  boomPivot.add(trolleyGroup);

  const trolleyGeos = [];
  const trolleyBody = _colorGeo(new THREE.BoxGeometry(0.8, 0.4, 0.6), COL_TROLLEY);
  trolleyGeos.push(trolleyBody);
  // Wheels (sit on boom rail)
  for (const wx of [-0.3, 0.3]) {
    const wheel = _colorGeo(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), 0x3a3a3a);
    wheel.rotateZ(Math.PI / 2);
    wheel.translate(wx, 0.25, 0);
    trolleyGeos.push(wheel);
  }
  const trolleyMerged = mergeGeometries(trolleyGeos, false);
  trolleyGroup.add(new THREE.Mesh(trolleyMerged, new THREE.MeshBasicMaterial({ vertexColors: true })));
  trolleyGeos.forEach(g => g.dispose());

  // ════════════════════════════════════════════
  // CABLE + HOOK (dynamic — updated every frame)
  // ════════════════════════════════════════════

  // Cable line (from trolley down to hook)
  const cablePositions = new Float32Array(6); // 2 points × 3 coords
  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute('position', new THREE.BufferAttribute(cablePositions, 3));
  const cableLine = new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: COL_CABLE, linewidth: 2 }));
  boomPivot.add(cableLine);

  // Hook
  const hookGeos = [];
  const hookBody = _colorGeo(new THREE.SphereGeometry(0.2, 8, 6), COL_HOOK);
  hookGeos.push(hookBody);
  // The actual hook curve (simplified as a torus arc)
  const hookCurve = _colorGeo(new THREE.TorusGeometry(0.15, 0.04, 8, 12, Math.PI * 1.2), COL_HOOK);
  hookCurve.translate(0, -0.18, 0);
  hookGeos.push(hookCurve);
  const hookMerged = mergeGeometries(hookGeos, false);
  const hookMesh = new THREE.Mesh(hookMerged, new THREE.MeshBasicMaterial({ vertexColors: true }));
  boomPivot.add(hookMesh);
  hookGeos.forEach(g => g.dispose());

  // ════════════════════════════════════════════
  // GRABBED PAYLOAD (visual placeholder for grabbed objects)
  // ════════════════════════════════════════════

  const payloadMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.4, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x8a7060 })
  );
  payloadMesh.visible = false;
  scene.add(payloadMesh);

  // ════════════════════════════════════════════
  // LAUNCHED PROJECTILES (pool of flying objects)
  // ════════════════════════════════════════════

  const MAX_PROJECTILES = 20;
  const projectiles = [];
  const projectileMat = new THREE.MeshBasicMaterial({ color: 0x8a7060 });
  const projectileGeo = new THREE.BoxGeometry(0.6, 0.4, 0.6);

  for (let i = 0; i < MAX_PROJECTILES; i++) {
    const mesh = new THREE.Mesh(projectileGeo, projectileMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    projectiles.push({
      mesh,
      active: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      life: 0,
    });
  }

  // ════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════

  const state = {
    isOperating: false,

    // Boom rotation
    boomAngle: 0,           // current yaw (radians)
    angularVel: 0,          // current angular velocity (rad/sec)

    // Trolley position along boom
    trolleyPos: TROLLEY_MIN + 5,

    // Winch (cable length)
    cableLen: 6,

    // Pendulum swing
    pendulumAngleX: 0,      // swing in the boom-forward direction
    pendulumAngleZ: 0,      // swing perpendicular to boom
    pendulumVelX: 0,
    pendulumVelZ: 0,

    // Grab state
    hasPayload: false,

    // Launch charge
    isCharging: false,
    chargeT: 0,

    // Warning light blink
    lightPhase: 0,

    // Entry point (world position of cab for proximity check)
    _cabWorldPos: new THREE.Vector3(),
  };

  // ════════════════════════════════════════════
  // UPDATE
  // ════════════════════════════════════════════

  const _worldHookPos = new THREE.Vector3();
  const _launchVel = new THREE.Vector3();

  function update(dt, playerPos, keys) {
    // Warning light blink
    state.lightPhase += dt * 2;

    if (!state.isOperating) {
      // Update cab world position for proximity check
      cabGroup.getWorldPosition(state._cabWorldPos);
      return;
    }

    // ── Boom rotation (A/D) ──
    let rotInput = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) rotInput -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) rotInput += 1;

    state.angularVel += rotInput * ROTATE_SPEED * dt * 3;
    state.angularVel = Math.max(-MAX_ANGULAR_VEL, Math.min(MAX_ANGULAR_VEL, state.angularVel));

    if (rotInput === 0) {
      state.angularVel *= ROTATE_FRICTION;
      if (Math.abs(state.angularVel) < 0.001) state.angularVel = 0;
    }

    state.boomAngle += state.angularVel * dt;

    // ── Trolley (Q/E) ──
    if (keys['KeyQ']) state.trolleyPos = Math.max(TROLLEY_MIN, state.trolleyPos - TROLLEY_SPEED * dt);
    if (keys['KeyE']) state.trolleyPos = Math.min(TROLLEY_MAX, state.trolleyPos + TROLLEY_SPEED * dt);

    // ── Winch (W/S) ──
    if (keys['KeyW'] || keys['ArrowUp']) state.cableLen = Math.max(CABLE_MIN, state.cableLen - WINCH_SPEED * dt);
    if (keys['KeyS'] || keys['ArrowDown']) state.cableLen = Math.min(CABLE_MAX, state.cableLen + WINCH_SPEED * dt);

    // ── Launch charge (F) ──
    if (keys['KeyF'] && state.hasPayload) {
      state.isCharging = true;
      state.chargeT = Math.min(state.chargeT + 1, LAUNCH_CHARGE_MAX);
    }

    // ── Grab / release (Space) ──
    // (handled via key event, not held — see handleKey below)

    // ── Pendulum physics ──
    if (state.hasPayload) {
      // Gravity pulls pendulum toward vertical
      state.pendulumVelX -= Math.sin(state.pendulumAngleX) * PENDULUM_GRAVITY * dt;
      state.pendulumVelZ -= Math.sin(state.pendulumAngleZ) * PENDULUM_GRAVITY * dt;

      // Angular acceleration from boom rotation injects energy (centrifugal!)
      state.pendulumVelZ += state.angularVel * state.trolleyPos * dt * 0.3;

      // Damping
      state.pendulumVelX *= PENDULUM_DAMPING;
      state.pendulumVelZ *= PENDULUM_DAMPING;

      state.pendulumAngleX += state.pendulumVelX * dt;
      state.pendulumAngleZ += state.pendulumVelZ * dt;

      // Clamp swing to prevent full loops
      state.pendulumAngleX = Math.max(-1.2, Math.min(1.2, state.pendulumAngleX));
      state.pendulumAngleZ = Math.max(-1.2, Math.min(1.2, state.pendulumAngleZ));
    } else {
      state.pendulumAngleX *= 0.95;
      state.pendulumAngleZ *= 0.95;
      state.pendulumVelX *= 0.9;
      state.pendulumVelZ *= 0.9;
    }

    // ════════════════════════════════════════════
    // VISUAL UPDATES
    // ════════════════════════════════════════════

    // Boom rotation
    boomPivot.rotation.y = state.boomAngle;

    // Trolley position
    trolleyGroup.position.set(state.trolleyPos, 0, 0);

    // Cable + hook position (in boom-pivot local space)
    const swingX = Math.sin(state.pendulumAngleX) * state.cableLen;
    const swingZ = Math.sin(state.pendulumAngleZ) * state.cableLen;
    const hangY = -Math.cos(state.pendulumAngleX) * Math.cos(state.pendulumAngleZ) * state.cableLen;

    const hookLocalX = state.trolleyPos + swingX;
    const hookLocalY = hangY;
    const hookLocalZ = swingZ;

    hookMesh.position.set(hookLocalX, hookLocalY, hookLocalZ);

    // Update cable line
    const cPos = cableLine.geometry.attributes.position.array;
    cPos[0] = state.trolleyPos; cPos[1] = 0; cPos[2] = 0;         // trolley end
    cPos[3] = hookLocalX; cPos[4] = hookLocalY; cPos[5] = hookLocalZ; // hook end
    cableLine.geometry.attributes.position.needsUpdate = true;

    // Payload follows hook
    if (state.hasPayload) {
      hookMesh.getWorldPosition(_worldHookPos);
      payloadMesh.position.copy(_worldHookPos);
      payloadMesh.position.y -= 0.4;
      payloadMesh.rotation.y = state.boomAngle;  // spin with boom
      payloadMesh.rotation.z = state.pendulumAngleX * 0.5;
      payloadMesh.visible = true;
    } else {
      payloadMesh.visible = false;
    }

    // Cab world pos (for exit positioning)
    cabGroup.getWorldPosition(state._cabWorldPos);

    // ── Update projectiles ──
    for (const proj of projectiles) {
      if (!proj.active) continue;
      proj.life -= dt;
      if (proj.life <= 0 || proj.pos.y < -10) {
        proj.active = false;
        proj.mesh.visible = false;
        continue;
      }
      // Physics
      proj.vel.y -= LAUNCH_GRAVITY * dt;
      proj.pos.addScaledVector(proj.vel, dt);

      // Ground bounce
      if (proj.pos.y < 0.3) {
        proj.pos.y = 0.3;
        proj.vel.y *= -0.4; // bouncy!
        proj.vel.x *= 0.7;
        proj.vel.z *= 0.7;
      }

      // Spin
      proj.mesh.rotation.x += proj.spin.x * dt;
      proj.mesh.rotation.y += proj.spin.y * dt;
      proj.mesh.rotation.z += proj.spin.z * dt;

      proj.mesh.position.copy(proj.pos);
    }
  }

  // ════════════════════════════════════════════
  // KEY HANDLERS (for press-once actions)
  // ════════════════════════════════════════════

  function handleKeyDown(code) {
    if (!state.isOperating) return false;

    // Space = grab/release
    if (code === 'Space') {
      if (state.hasPayload) {
        // Release — just drop
        _dropPayload();
      } else {
        // Grab — pick up whatever's near the hook
        state.hasPayload = true;
        state.pendulumVelX = 0;
        state.pendulumVelZ = 0;
      }
      return true;
    }

    // Escape = exit crane
    if (code === 'Escape') {
      if (state.hasPayload) _dropPayload();
      return true; // caller handles exit
    }

    return false;
  }

  function handleKeyUp(code) {
    if (!state.isOperating) return false;

    // F release = LAUNCH!
    if (code === 'KeyF' && state.isCharging && state.hasPayload) {
      _launchPayload();
      state.isCharging = false;
      state.chargeT = 0;
      return true;
    }

    if (code === 'KeyF') {
      state.isCharging = false;
      state.chargeT = 0;
    }

    return false;
  }

  // ════════════════════════════════════════════
  // LAUNCH MECHANICS
  // ════════════════════════════════════════════

  function _dropPayload() {
    state.hasPayload = false;
    // Spawn a projectile at the current hook position with just pendulum velocity
    hookMesh.getWorldPosition(_worldHookPos);
    _spawnProjectile(
      _worldHookPos.clone(),
      new THREE.Vector3(
        state.pendulumVelX * 2,
        0,
        state.pendulumVelZ * 2
      )
    );
  }

  function _launchPayload() {
    state.hasPayload = false;

    hookMesh.getWorldPosition(_worldHookPos);

    // Launch velocity = boom tangential velocity + trolley radial velocity + pendulum energy + charge bonus
    const chargeMult = 1 + (state.chargeT / LAUNCH_CHARGE_MAX) * LAUNCH_MULT;

    // Tangential velocity from boom rotation (v = ω × r)
    const radius = state.trolleyPos;
    const tangentialSpeed = state.angularVel * radius;

    // Direction perpendicular to boom at current angle
    const boomDirX = Math.cos(state.boomAngle);  // boom points along X in local space
    const boomDirZ = -Math.sin(state.boomAngle);
    const tangentX = -boomDirZ;  // perpendicular to boom
    const tangentZ = boomDirX;

    // Radial velocity from trolley (outward along boom)
    // This is zero unless trolley is actively moving, but the angular vel
    // component does all the heavy lifting for distance

    _launchVel.set(
      tangentX * tangentialSpeed * chargeMult + state.pendulumVelX * 3,
      Math.abs(tangentialSpeed) * 0.3 * chargeMult + 4, // upward component scales with speed
      tangentZ * tangentialSpeed * chargeMult + state.pendulumVelZ * 3
    );

    _spawnProjectile(_worldHookPos.clone(), _launchVel.clone());

    // Recoil — the crane swings back!
    state.angularVel -= Math.sign(state.angularVel) * Math.abs(tangentialSpeed) * 0.1;
  }

  function _spawnProjectile(pos, vel) {
    // Find inactive projectile
    let proj = projectiles.find(p => !p.active);
    if (!proj) {
      // Recycle oldest
      proj = projectiles[0];
      for (const p of projectiles) {
        if (p.life < proj.life) proj = p;
      }
    }

    proj.active = true;
    proj.pos.copy(pos);
    proj.vel.copy(vel);
    proj.spin.set(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8
    );
    proj.life = 15; // seconds before despawn
    proj.mesh.visible = true;
    proj.mesh.position.copy(pos);

    // Random color for fun
    const hue = Math.random();
    proj.mesh.material.color.setHSL(hue, 0.5, 0.5);
  }

  // ════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════

  return {
    /** Root group — add to your scene (already added) */
    group: craneRoot,

    /** Boom pivot — exposed for camera tracking when operating */
    boomPivot,

    /** Current state (read-only externally) */
    get isOperating() { return state.isOperating; },
    get boomAngle() { return state.boomAngle; },
    get angularVel() { return state.angularVel; },
    get chargeT() { return state.chargeT; },
    get chargeMax() { return LAUNCH_CHARGE_MAX; },
    get hasPayload() { return state.hasPayload; },
    get trolleyPos() { return state.trolleyPos; },
    get cableLen() { return state.cableLen; },

    /** Is the player close enough to enter? */
    isNear(playerPos) {
      cabGroup.getWorldPosition(state._cabWorldPos);
      const dx = playerPos.x - state._cabWorldPos.x;
      const dy = playerPos.y - state._cabWorldPos.y;
      const dz = playerPos.z - state._cabWorldPos.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) < ENTRY_RANGE;
    },

    /** Get the world position of the cab (for player teleport on enter) */
    getCabWorldPos() {
      cabGroup.getWorldPosition(state._cabWorldPos);
      return state._cabWorldPos;
    },

    /** Get the world position of the hook */
    getHookWorldPos() {
      hookMesh.getWorldPosition(_worldHookPos);
      return _worldHookPos;
    },

    /** Enter the crane */
    enter() {
      state.isOperating = true;
    },

    /** Exit the crane — returns world position for player placement */
    exit() {
      state.isOperating = false;
      state.angularVel = 0;
      state.isCharging = false;
      state.chargeT = 0;
      // Return position near the mast base for player placement
      return new THREE.Vector3(
        craneRoot.position.x,
        roofY,
        craneRoot.position.z + 2
      );
    },

    /** Update every frame */
    update,

    /** Handle key down (returns true if consumed) */
    handleKeyDown,

    /** Handle key up (returns true if consumed) */
    handleKeyUp,

    /** Set roof Y (when floors are built) */
    setRoofY(y) {
      craneRoot.position.y = y;
    },

    /** Dispose */
    dispose() {
      scene.remove(craneRoot);
      scene.remove(payloadMesh);
      for (const p of projectiles) scene.remove(p.mesh);
    },
  };
}
