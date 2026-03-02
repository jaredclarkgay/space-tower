'use strict';
import * as THREE from 'three';

/**
 * Exterior gameplay: player character, construction site, WASD movement.
 * Tower is a scaffold — 4 corner columns + perimeter beams, open center shaft.
 * Climbing is column-only. Beams are one-way platforms (jump through from below).
 */

// ── Player state ──
const PLAYER = {
  pos: new THREE.Vector3(8, 0, 5),
  vel: new THREE.Vector3(0, 0, 0),
  onGround: true,
  isClimbing: false,
  carrying: false,
  walkCycle: 0,
  active: false,
  isCharging: false,
  chargeT: 0,
};

const MOVE_SPEED = 0.06;
const JUMP_BASE = 0.11;
const JUMP_MAX = 0.46;
const CHARGE_MAX = 80;
const GRAVITY = 0.0035;
const CLIMB_SPEED = 0.04;

// Tower geometry — must match TC/BEAM_DEPTH in title-city.js
const TOWER_HALF = 3;              // TC.width / 2
const FLOOR_H = 1.2;              // TC.floorH
const BASE_H = FLOOR_H * 3;       // 3.6
const MAX_EXT_FLOOR = 9;
const BEAM_DEPTH = 0.4;           // BEAM_DEPTH in title-city.js
const BEAM_HALF = BEAM_DEPTH / 2;  // 0.2
const OUTER_EDGE = TOWER_HALF + BEAM_HALF; // 3.2
const INNER_EDGE = TOWER_HALF - BEAM_HALF; // 2.8
const FOUNDATION_HALF = 4.5;

// Column positions (the 4 corners)
const COLUMNS = [
  [-TOWER_HALF, -TOWER_HALF],
  [-TOWER_HALF, TOWER_HALF],
  [TOWER_HALF, -TOWER_HALF],
  [TOWER_HALF, TOWER_HALF],
];
const COL_GRAB_RADIUS = 0.5;

// Roof height — full tower constant (used as default/max)
const ROOF_Y = BASE_H + (MAX_EXT_FLOOR + 1) * FLOOR_H;

// Active built height — mutable, set by setBuiltHeight()
let activeRoofY = ROOF_Y;
let activeMaxFloor = MAX_EXT_FLOOR;

let playerGroup = null;
let carryBox = null;
let siteGroup = null;
let keys = {};
let climbCooldown = 0;

// ── Climbing orbit state ──
let climbCol = -1;         // index into COLUMNS (-1 = not on a column)
let climbAngle = 0;        // radial angle around the column
const CLIMB_DIST = 0.3;    // offset from column center
const CLIMB_ORBIT_SPEED = 0.05;

// ── Interaction prompt ──
let promptEl = null;

// ── Backward walk flag ──
let walkingBackward = false;
let wasBackward = false;

// ── Player collision radius ──
const PLAYER_R = 0.2;

// ── Site object colliders [cx, cz, halfW, halfD] ──
const SITE_COLLIDERS = [
  [8, -4, 0.45, 0.45],       // porta-potty
  [12, -1.5, 0.5, 0.4],      // generator
  [1.5, 4.5, 0.35, 0.3],     // toolbox
];

// ── Jump flip state ──
let flipCommitted = false;
let flipDouble = false;
let flipInitVel = 0;      // initial upward velocity at jump launch
let jumpStartY = 0;
// Max jump height: v₀²/(2g) where v₀=JUMP_MAX, g=GRAVITY → 0.30²/(2*0.006) = 7.5
const MAX_JUMP_HEIGHT = (JUMP_MAX * JUMP_MAX) / (2 * GRAVITY);
const FLIP_THRESHOLD = MAX_JUMP_HEIGHT * 0.5;

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

// ── Build player character ──
export function buildPlayer(scene) {
  playerGroup = new THREE.Group();

  const skin = new THREE.MeshBasicMaterial({ color: 0xd4a574 });
  const vest = new THREE.MeshBasicMaterial({ color: 0xCCFF00 });
  const stripe = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pants = new THREE.MeshBasicMaterial({ color: 0x3a4a5a });
  const boots = new THREE.MeshBasicMaterial({ color: 0x3a2a1a });
  const hardhat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.30, 0.18), vest);
  torso.position.y = 0.52;
  playerGroup.add(torso);

  [0.46, 0.58].forEach(sy => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.025, 0.19), stripe);
    s.position.y = sy;
    playerGroup.add(s);
  });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), skin);
  head.position.y = 0.80;
  playerGroup.add(head);

  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.08, 0.23), hardhat);
  hat.position.y = 0.92;
  playerGroup.add(hat);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.26), hardhat);
  brim.position.y = 0.89;
  playerGroup.add(brim);

  const armGeo = new THREE.BoxGeometry(0.09, 0.25, 0.09);
  const leftArm = new THREE.Mesh(armGeo, skin);
  leftArm.position.set(-0.19, 0.50, 0);
  playerGroup.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, skin);
  rightArm.position.set(0.19, 0.50, 0);
  playerGroup.add(rightArm);

  const legGeo = new THREE.BoxGeometry(0.10, 0.22, 0.11);
  const leftLeg = new THREE.Mesh(legGeo, pants);
  leftLeg.position.set(-0.08, 0.22, 0);
  playerGroup.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, pants);
  rightLeg.position.set(0.08, 0.22, 0);
  playerGroup.add(rightLeg);

  const bootGeo = new THREE.BoxGeometry(0.11, 0.09, 0.14);
  const leftBoot = new THREE.Mesh(bootGeo, boots);
  leftBoot.position.set(-0.08, 0.05, 0.01);
  playerGroup.add(leftBoot);
  const rightBoot = new THREE.Mesh(bootGeo, boots);
  rightBoot.position.set(0.08, 0.05, 0.01);
  playerGroup.add(rightBoot);

  carryBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.15, 0.20),
    new THREE.MeshBasicMaterial({ color: 0x6a7580 })
  );
  carryBox.position.set(0, 0.80, 0.18);
  carryBox.visible = false;
  playerGroup.add(carryBox);

  playerGroup.position.copy(PLAYER.pos);
  scene.add(playerGroup);
  playerGroup.userData = { leftArm, rightArm, leftLeg, rightLeg, leftBoot, rightBoot, torso };
  return playerGroup;
}

// ── Build construction site objects ──
export function buildConstructionSite(scene) {
  siteGroup = new THREE.Group();

  const steel = new THREE.MeshBasicMaterial({ color: 0x5a6570 });
  const wood = new THREE.MeshBasicMaterial({ color: 0x6a5030 });
  const concrete = new THREE.MeshBasicMaterial({ color: 0x5a5550 });

  for (let i = 0; i < 6; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.0 + Math.random() * 0.5), steel);
    beam.position.set(10 + (Math.random() - 0.5) * 1.5, 0.04 + i * 0.09, (Math.random() - 0.5) * 1);
    beam.rotation.y = Math.random() * 0.2;
    siteGroup.add(beam);
  }
  for (let i = 0; i < 4; i++) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), concrete);
    block.position.set(10.8 + (Math.random() - 0.5) * 1, 0.13 + i * 0.08, 0.5 + Math.random());
    siteGroup.add(block);
  }
  for (let i = 0; i < 5; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 1.2), wood);
    plank.position.set(9.5 + (Math.random() - 0.5) * 0.5, 0.02 + i * 0.035, -0.5 + Math.random() * 0.5);
    plank.rotation.y = (Math.random() - 0.5) * 0.15;
    siteGroup.add(plank);
  }

  const coneMat = new THREE.MeshBasicMaterial({ color: 0xe85020 });
  [[-3, 2], [5, -2], [9, 2.5]].forEach(([cx, cz]) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), coneMat);
    cone.position.set(cx, 0.18, cz);
    siteGroup.add(cone);
  });

  const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.25), new THREE.MeshBasicMaterial({ color: 0x8a2020 }));
  toolbox.position.set(1.5, 0.1, 4.5);
  siteGroup.add(toolbox);

  const gen = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x3a4a2a }));
  gen.position.set(12, 0.25, -1.5);
  siteGroup.add(gen);

  const porta = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), new THREE.MeshBasicMaterial({ color: 0x2a4a6a }));
  porta.position.set(8, 0.55, -4);
  siteGroup.add(porta);

  const postMat = new THREE.MeshBasicMaterial({ color: 0x4a4a44 });
  const tapeMat = new THREE.LineBasicMaterial({ color: 0xdcbe60 });
  [[-6, -5, 6], [14, -4, 4]].forEach(([x, z1, z2]) => {
    [z1, (z1 + z2) / 2, z2].forEach(z => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), postMat);
      post.position.set(x, 0.3, z);
      siteGroup.add(post);
    });
    const tapeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.45, z1), new THREE.Vector3(x, 0.45, z2)
    ]);
    siteGroup.add(new THREE.Line(tapeGeo, tapeMat));
  });

  const dropRing = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xdcbe60, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  dropRing.rotation.x = -Math.PI / 2;
  dropRing.position.y = 0.4;
  siteGroup.add(dropRing);
  // Steel roof plate at the top of the tower
  const roofPlate = new THREE.Mesh(
    new THREE.BoxGeometry(OUTER_EDGE * 2, 0.15, OUTER_EDGE * 2),
    new THREE.MeshBasicMaterial({ color: 0x5a6570 })
  );
  roofPlate.position.y = ROOF_Y;
  siteGroup.add(roofPlate);

  siteGroup.userData = { dropRing, roofPlate };

  scene.add(siteGroup);
  return siteGroup;
}

// ── Input handling ──
let _keydownHandler = null;
let _keyupHandler = null;

export function setupExteriorInput() {
  _keydownHandler = (e) => {
    if (!PLAYER.active) return;
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyE') handleInteract();
  };
  _keyupHandler = (e) => {
    keys[e.code] = false;
    if (e.code === 'Space' && PLAYER.active) {
      if (PLAYER.isCharging && PLAYER.onGround) {
        const t = PLAYER.chargeT / CHARGE_MAX;
        PLAYER.vel.y = JUMP_BASE + (JUMP_MAX - JUMP_BASE) * t;
        PLAYER.onGround = false;
        PLAYER.isCharging = false;
        PLAYER.chargeT = 0;
        // Flip: commit immediately at launch if charge >= 35%
        jumpStartY = PLAYER.pos.y;
        flipInitVel = PLAYER.vel.y;
        flipCommitted = t >= 0.35;
        flipDouble = t >= 0.9;
      }
    }
  };
  document.addEventListener('keydown', _keydownHandler);
  document.addEventListener('keyup', _keyupHandler);
}

export function disposeExteriorInput() {
  if (_keydownHandler) document.removeEventListener('keydown', _keydownHandler);
  if (_keyupHandler) document.removeEventListener('keyup', _keyupHandler);
  _keydownHandler = null;
  _keyupHandler = null;
  if (promptEl) { promptEl.remove(); promptEl = null; }
}

// ── Interaction ──
let floorsBuilt = 0;
try {
  const d = JSON.parse(localStorage.getItem('spacetower_exterior'));
  if (d && typeof d.floorsBuilt === 'number') floorsBuilt = d.floorsBuilt;
} catch { /* no saved data */ }

function handleInteract() {
  const pp = PLAYER.pos;
  // Pick up materials from the construction site
  if (!PLAYER.carrying && Math.abs(pp.x - 10) < 2.5 && Math.abs(pp.z) < 2) {
    PLAYER.carrying = true;
    if (carryBox) carryBox.visible = true;
    return;
  }
  // If carrying, try to build at the tower — otherwise just drop it
  if (PLAYER.carrying) {
    const dropY = floorsBuilt * 1.2 + 0.4;
    if (Math.abs(pp.x) < 4 && Math.abs(pp.z) < 4 && Math.abs(pp.y - dropY) < 1.5) {
      PLAYER.carrying = false;
      if (carryBox) carryBox.visible = false;
      floorsBuilt++;
      localStorage.setItem('spacetower_exterior', JSON.stringify({ floorsBuilt, ts: Date.now() }));
    } else {
      // Drop anywhere
      PLAYER.carrying = false;
      if (carryBox) carryBox.visible = false;
    }
  }
}

// ═══ COLLISION ═══

// Is (x,z) on the perimeter beam frame? (generous collision margin)
function _isOnBeam(x, z) {
  const margin = 0.15;
  const outer = OUTER_EDGE + margin;  // 3.35
  const inner = INNER_EDGE - margin;  // 2.65
  const inOuter = x >= -outer && x <= outer && z >= -outer && z <= outer;
  const inCenter = x > -inner && x < inner && z > -inner && z < inner;
  return inOuter && !inCenter;
}

// Is (x,z) on the foundation?
function _isOnFoundation(x, z) {
  return Math.abs(x) <= FOUNDATION_HALF && Math.abs(z) <= FOUNDATION_HALF;
}

// Land on beams (one-way platforms — pass through from below, land from above)
function _checkTowerCollision() {
  const pp = PLAYER.pos;
  const pv = PLAYER.vel;

  if (pv.y > 0.001) return; // rising — pass through from below

  const prevY = pp.y - pv.y;

  // Roof plate — solid, full tower footprint (at active built height)
  if (Math.abs(pp.x) <= OUTER_EDGE && Math.abs(pp.z) <= OUTER_EDGE) {
    if (prevY >= activeRoofY - 0.1 && pp.y <= activeRoofY) {
      pp.y = activeRoofY;
      pv.y = 0;
      PLAYER.onGround = true;
      return;
    }
  }

  // Beam floors (fi >= 1) — only on beam perimeter, limited to built floors
  if (_isOnBeam(pp.x, pp.z)) {
    for (let fi = activeMaxFloor; fi >= 1; fi--) {
      const surfY = BASE_H + fi * FLOOR_H;
      if (prevY >= surfY - 0.1 && pp.y <= surfY) {
        pp.y = surfY;
        pv.y = 0;
        PLAYER.onGround = true;
        return;
      }
    }
  }

  // Foundation top — always solid, full footprint
  if (_isOnFoundation(pp.x, pp.z)) {
    if (prevY >= BASE_H - 0.1 && pp.y <= BASE_H) {
      pp.y = BASE_H;
      pv.y = 0;
      PLAYER.onGround = true;
      return;
    }
  }
}

// Foundation sides are solid walls
function _checkFoundationWalls() {
  const pp = PLAYER.pos;
  const pv = PLAYER.vel;

  if (pp.y >= BASE_H - 0.01) return;

  const fh = FOUNDATION_HALF + PLAYER_R;
  if (Math.abs(pp.x) < fh && Math.abs(pp.z) < fh) {
    const dxP = fh - pp.x;
    const dxN = pp.x + fh;
    const dzP = fh - pp.z;
    const dzN = pp.z + fh;
    const minD = Math.min(dxP, dxN, dzP, dzN);
    if (minD === dxP) { pp.x = fh + 0.01; pv.x = 0; }
    else if (minD === dxN) { pp.x = -fh - 0.01; pv.x = 0; }
    else if (minD === dzP) { pp.z = fh + 0.01; pv.z = 0; }
    else { pp.z = -fh - 0.01; pv.z = 0; }
  }
}

// Column collision — push player out of corner column boxes
function _checkColumnCollision() {
  const pp = PLAYER.pos;
  const pv = PLAYER.vel;
  const colHalf = 0.2; // collision half-width for columns

  for (const [cx, cz] of COLUMNS) {
    if (Math.abs(pp.x - cx) < colHalf && Math.abs(pp.z - cz) < colHalf && !PLAYER.isClimbing) {
      const dx = pp.x - cx;
      const dz = pp.z - cz;
      if (Math.abs(dx) > Math.abs(dz)) {
        pp.x = cx + Math.sign(dx || 1) * colHalf;
        pv.x = 0;
      } else {
        pp.z = cz + Math.sign(dz || 1) * colHalf;
        pv.z = 0;
      }
    }
  }
}

// Site object collision — push player out of construction site objects
function _checkSiteCollision() {
  const pp = PLAYER.pos;
  const pv = PLAYER.vel;
  if (pp.y > 1.5) return; // only at ground level
  for (const [cx, cz, hw, hd] of SITE_COLLIDERS) {
    const dx = pp.x - cx;
    const dz = pp.z - cz;
    const overX = (hw + PLAYER_R) - Math.abs(dx);
    const overZ = (hd + PLAYER_R) - Math.abs(dz);
    if (overX > 0 && overZ > 0) {
      if (overX < overZ) { pp.x = cx + Math.sign(dx || 1) * (hw + PLAYER_R); pv.x = 0; }
      else { pp.z = cz + Math.sign(dz || 1) * (hd + PLAYER_R); pv.z = 0; }
    }
  }
}

// Climb: grab corner columns — walk into column to start climbing
function _checkTowerClimb() {
  if (PLAYER.isClimbing || climbCooldown > 0) return;

  const pp = PLAYER.pos;
  if (pp.y > activeRoofY) return;

  for (let ci = 0; ci < COLUMNS.length; ci++) {
    const [cx, cz] = COLUMNS[ci];
    if (Math.abs(pp.x - cx) < COL_GRAB_RADIUS && Math.abs(pp.z - cz) < COL_GRAB_RADIUS) {
      PLAYER.isClimbing = true;
      PLAYER.onGround = false;
      PLAYER.vel.set(0, 0, 0);
      PLAYER.isCharging = false;
      PLAYER.chargeT = 0;
      // Record which column and approach angle
      climbCol = ci;
      climbAngle = Math.atan2(pp.x - cx, pp.z - cz);
      // Position at orbit distance from column center
      pp.x = cx + Math.sin(climbAngle) * CLIMB_DIST;
      pp.z = cz + Math.cos(climbAngle) * CLIMB_DIST;
      return;
    }
  }
}

// ── Interaction prompt (lazy-created DOM element) ──
function _updatePrompt() {
  const pp = PLAYER.pos;
  let text = '';
  if (!PLAYER.carrying && Math.abs(pp.x - 10) < 3 && Math.abs(pp.z) < 2.5 && pp.y < 1) {
    text = 'E \u2014 pick up';
  } else if (PLAYER.carrying) {
    const dropY = floorsBuilt * 1.2 + 0.4;
    if (Math.abs(pp.x) < 4 && Math.abs(pp.z) < 4 && Math.abs(pp.y - dropY) < 1.5) {
      text = 'E \u2014 build';
    } else {
      text = 'E \u2014 drop';
    }
  }
  if (text && !promptEl) {
    promptEl = document.createElement('div');
    promptEl.style.cssText = 'position:fixed;bottom:52%;left:50%;transform:translateX(-50%);z-index:60;color:rgba(255,255,255,0.45);font-family:monospace;font-size:10px;pointer-events:none;user-select:none;transition:opacity 0.3s;letter-spacing:0.1em';
    document.body.appendChild(promptEl);
  }
  if (promptEl) {
    promptEl.textContent = text;
    promptEl.style.opacity = text ? '1' : '0';
  }
}

// ═══ UPDATE ═══
export function updateExterior(dt, camFwdX, camFwdZ) {
  if (!PLAYER.active || !playerGroup) return;

  const pp = PLAYER.pos;
  const pv = PLAYER.vel;

  if (climbCooldown > 0) climbCooldown--;

  // ── Input (S/Down = backward from facing, not camera-relative) ──
  let inputFwd = 0, inputRight = 0;
  if (keys['KeyW'] || keys['ArrowUp']) inputFwd = 1;
  if (keys['KeyA'] || keys['ArrowLeft']) inputRight = -1;
  if (keys['KeyD'] || keys['ArrowRight']) inputRight = 1;
  const hasBack = keys['KeyS'] || keys['ArrowDown'];

  const inputLen = Math.sqrt(inputFwd * inputFwd + inputRight * inputRight);
  walkingBackward = false;

  if (hasBack && !inputFwd) {
    // ── Backward walk: camera-relative (reverse + strafe), model stays locked ──
    walkingBackward = true;
    wasBackward = true;
    const bf = -1;
    const br = inputRight;
    const bLen = Math.sqrt(bf * bf + br * br);
    const nf = bf / bLen;
    const nr = br / bLen;
    const fLen = Math.sqrt(camFwdX * camFwdX + camFwdZ * camFwdZ) || 1;
    const fX = camFwdX / fLen;
    const fZ = camFwdZ / fLen;
    const rX = -fZ;
    const rZ = fX;
    const worldX = rX * nr + fX * nf;
    const worldZ = rZ * nr + fZ * nf;
    const spd = PLAYER.carrying ? MOVE_SPEED * 0.75 : MOVE_SPEED;
    pv.x = worldX * spd;
    pv.z = worldZ * spd;
    PLAYER.walkCycle += 0.15;
  } else if (inputLen > 0) {
    // ── Camera-relative movement (W, A, D) ──
    wasBackward = false;
    const nf = inputFwd / inputLen;
    const nr = inputRight / inputLen;
    const fLen = Math.sqrt(camFwdX * camFwdX + camFwdZ * camFwdZ) || 1;
    const fX = camFwdX / fLen;
    const fZ = camFwdZ / fLen;
    const rX = -fZ;
    const rZ = fX;
    const worldX = rX * nr + fX * nf;
    const worldZ = rZ * nr + fZ * nf;
    const spd2 = PLAYER.carrying ? MOVE_SPEED * 0.75 : MOVE_SPEED;
    pv.x = worldX * spd2;
    pv.z = worldZ * spd2;
    PLAYER.walkCycle += 0.15;
  } else {
    if (wasBackward) {
      // Kill residual backward velocity so camera doesn't whip
      pv.x = 0;
      pv.z = 0;
      wasBackward = false;
    } else {
      pv.x *= 0.8;
      pv.z *= 0.8;
    }
    if (Math.abs(pv.x) < 0.001) pv.x = 0;
    if (Math.abs(pv.z) < 0.001) pv.z = 0;
  }

  // ── Jump charge ──
  if (keys['Space'] && PLAYER.onGround) {
    PLAYER.isCharging = true;
    PLAYER.chargeT = Math.min(PLAYER.chargeT + 1, CHARGE_MAX);
  }

  // ── Gravity ──
  if (!PLAYER.onGround) pv.y -= GRAVITY;

  // ── Apply velocity ──
  pp.x += pv.x;
  pp.z += pv.z;
  pp.y += pv.y;

  // ── Collision ──
  _checkTowerCollision();
  _checkFoundationWalls();
  _checkColumnCollision();
  _checkSiteCollision();

  // ── Walk off edge ──
  if (PLAYER.onGround && pp.y > 0.1) {
    if (Math.abs(pp.y - activeRoofY) < 0.1) {
      // On roof plate — check still within tower footprint
      if (Math.abs(pp.x) > OUTER_EDGE || Math.abs(pp.z) > OUTER_EDGE) PLAYER.onGround = false;
    } else if (pp.y >= BASE_H + FLOOR_H - 0.1) {
      // On upper beam — check still on beam perimeter
      if (!_isOnBeam(pp.x, pp.z)) PLAYER.onGround = false;
    } else if (Math.abs(pp.y - BASE_H) < 0.1) {
      // On foundation
      if (!_isOnFoundation(pp.x, pp.z)) PLAYER.onGround = false;
    }
  }

  // ── Ground ──
  if (pp.y <= 0) { pp.y = 0; pv.y = 0; PLAYER.onGround = true; PLAYER.isClimbing = false; }

  // ── Bounds ──
  pp.x = Math.max(-30, Math.min(30, pp.x));
  pp.z = Math.max(-30, Math.min(30, pp.z));

  // ── Animation ──
  const walking = Math.abs(pv.x) > 0.005 || Math.abs(pv.z) > 0.005;
  const ud = playerGroup.userData;

  if (PLAYER.isCharging) {
    const squat = PLAYER.chargeT / CHARGE_MAX * 0.15;
    ud.torso.position.y = 0.52 - squat;
    ud.leftLeg.rotation.x = squat * 2;
    ud.rightLeg.rotation.x = squat * 2;
    ud.leftArm.rotation.x = -squat * 1.5;
    ud.rightArm.rotation.x = -squat * 1.5;
    ud.leftArm.rotation.z = 0;
    ud.rightArm.rotation.z = 0;
    ud.torso.rotation.z = 0;
  } else if (walking && PLAYER.onGround) {
    ud.torso.position.y = 0.52;
    const sw = Math.sin(PLAYER.walkCycle * 3) * 0.3;
    ud.leftLeg.rotation.x = sw;
    ud.rightLeg.rotation.x = -sw;
    ud.leftArm.rotation.x = -sw * 0.6;
    ud.rightArm.rotation.x = sw * 0.6;
    ud.leftArm.rotation.z = 0;
    ud.rightArm.rotation.z = 0;
    ud.torso.rotation.z = Math.sin(PLAYER.walkCycle * 3) * 0.02;
  } else {
    ud.torso.position.y += (0.52 - ud.torso.position.y) * 0.2;
    ud.leftLeg.rotation.x *= 0.9;
    ud.rightLeg.rotation.x *= 0.9;
    ud.leftArm.rotation.x *= 0.9;
    ud.rightArm.rotation.x *= 0.9;
    ud.leftArm.rotation.z *= 0.9;
    ud.rightArm.rotation.z *= 0.9;
    ud.torso.rotation.z *= 0.9;
  }

  // ── Position + rotation ──
  playerGroup.position.copy(pp);
  if (walking) {
    // Forward: face velocity direction. Backward: face opposite of velocity (= camera forward)
    const targetRot = walkingBackward
      ? Math.atan2(-pv.x, -pv.z)
      : Math.atan2(pv.x, pv.z);
    let delta = targetRot - playerGroup.rotation.y;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    playerGroup.rotation.y += delta * 0.15;
  }

  // ── Jump flip (committed at launch if charge >= 35%) — double flip with tuck ──
  if (flipCommitted && !PLAYER.onGround) {
    const t = (flipInitVel - PLAYER.vel.y) / (2 * flipInitVel);
    const clamped = Math.max(0, Math.min(1, t));
    const eased = easeInOutSine(clamped);
    // 360° single flip, or 720° double if charge >= 90%
    playerGroup.rotation.x = eased * (flipDouble ? Math.PI * 4 : Math.PI * 2);
    // Tuck: arms/legs pull in at peak (t≈0.5), spread at start/end
    const tuck = Math.sin(clamped * Math.PI); // 0→1→0 over the arc
    ud.leftArm.rotation.x = -2.2 * tuck;
    ud.rightArm.rotation.x = -2.2 * tuck;
    ud.leftArm.rotation.z = -0.4 * tuck;
    ud.rightArm.rotation.z = 0.4 * tuck;
    ud.leftLeg.rotation.x = -1.8 * tuck;
    ud.rightLeg.rotation.x = -1.8 * tuck;
    // Slight torso compression at peak
    ud.torso.position.y = 0.52 - 0.06 * tuck;
  }

  if (PLAYER.onGround && (flipCommitted || playerGroup.rotation.x !== 0)) {
    playerGroup.rotation.x = 0;
    flipCommitted = false;
    flipDouble = false;
  }

  _updatePrompt();

  if (PLAYER.carrying && carryBox) {
    carryBox.rotation.z = Math.sin(performance.now() * 0.003) * 0.04;
  }
}

// ── Accessors ──
export function getPlayerPos() { return PLAYER.pos; }
export function getPlayerVel() { return PLAYER.vel; }

export function activateExterior() {
  PLAYER.active = true;
  PLAYER.isClimbing = false;
  PLAYER.isCharging = false;
  PLAYER.chargeT = 0;
  climbCooldown = 0;
  climbCol = -1;
}

export function deactivateExterior() {
  PLAYER.active = false;
  PLAYER.isClimbing = false;
  climbCol = -1;
  keys = {};
  if (promptEl) { promptEl.remove(); promptEl = null; }
}

export function setBuiltHeight(topBuilt) {
  activeMaxFloor = Math.max(0, topBuilt - 1);
  activeRoofY = BASE_H + Math.max(1, topBuilt) * FLOOR_H;
  // Reposition roof plate to match built height
  if (siteGroup && siteGroup.userData.roofPlate) {
    siteGroup.userData.roofPlate.position.y = activeRoofY;
  }
}

export function isExteriorActive() { return PLAYER.active; }
export function isWalkingBackward() { return walkingBackward; }
export function getPlayerGroup() { return playerGroup; }
