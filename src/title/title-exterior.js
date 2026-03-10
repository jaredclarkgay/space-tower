'use strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildPlayableCrane } from './playable-crane.js';
import { buildPlayableBulldozer, buildTerrainMesh, buildTerrainMeshFromHeightmap } from './playable-bulldozer.js';
import { sampleHeightmap } from '../terrain.js';
import { buildScaffoldingGame } from './scaffolding-game.js';

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

/**
 * Exterior gameplay: player character, construction site, WASD movement.
 * Tower is a scaffold — 4 corner columns + perimeter beams, open center shaft.
 * Climbing is column-only. Beams are one-way platforms (jump through from below).
 */

// ── Player state ──
const PLAYER = {
  pos: new THREE.Vector3(50, 0, 45),
  vel: new THREE.Vector3(0, 0, 0),
  onGround: true,
  onLadder: null,   // reference to current ladder object, or null
  carrying: false,
  walkCycle: 0,
  active: false,
  isCharging: false,
  chargeT: 0,
};

const MOVE_SPEED = 0.075;
const SPRINT_MULT = 2.5;
const JUMP_BASE = 0.18;
const JUMP_MAX = 0.46;
const CHARGE_MAX = 80;
const GRAVITY = 0.0035;

// Tower geometry — must match TC/BEAM_DEPTH in title-city.js
// (can't import directly: circular dependency with title-city.js)
const TOWER_HALF = 37.5;            // TC.width / 2
const FLOOR_H = 3.333;              // TC.floorH
const BASE_H = FLOOR_H * 3;         // 10
const MAX_EXT_FLOOR = 9;
const BEAM_DEPTH = 0.5;             // BEAM_DEPTH in title-city.js
const BEAM_HALF = BEAM_DEPTH / 2;    // 0.25
const OUTER_EDGE = TOWER_HALF + BEAM_HALF; // 37.75
const INNER_EDGE = TOWER_HALF - BEAM_HALF; // 37.25
const FOUNDATION_HALF = TOWER_HALF;

// Column positions (the 4 corners)
const COLUMNS = [
  [-TOWER_HALF, -TOWER_HALF],
  [-TOWER_HALF, TOWER_HALF],
  [TOWER_HALF, -TOWER_HALF],
  [TOWER_HALF, TOWER_HALF],
];

// Ladder positions (4 ladders on tower faces)
// tanDir: which world direction "A" (left) maps to on this ladder face
const LADDERS = [
  { axis: 'z', pos: OUTER_EDGE, tanAxis: 'x', tanPos: 12, tanDir: -1 },   // front
  { axis: 'z', pos: -OUTER_EDGE, tanAxis: 'x', tanPos: 0, tanDir: 1 },    // back
  { axis: 'x', pos: OUTER_EDGE, tanAxis: 'z', tanPos: 0, tanDir: 1 },     // right
  { axis: 'x', pos: -OUTER_EDGE, tanAxis: 'z', tanPos: 0, tanDir: -1 },   // left
];
const LADDER_HALF_W = 2.0;       // how wide the climbable zone is (lateral)
const LADDER_ENTRY_DEPTH = 0.6;  // how close to the wall to trigger grab
const LADDER_CLIMB_SPEED = 0.065; // climb speed (slightly slower than walk)

// Roof height — full tower constant (used as default/max)
const ROOF_Y = BASE_H + (MAX_EXT_FLOOR + 1) * FLOOR_H;

// Active built height — mutable, set by setBuiltHeight()
let activeRoofY = ROOF_Y;
let activeMaxFloor = MAX_EXT_FLOOR;

let playerGroup = null;
let carryBox = null;
let siteGroup = null;
let keys = {};

// ── Bulldozer + terrain ──
let _bulldozer = null;
let _terrainMesh = null;

// ── Scaffolding game ──
let _scaffolding = null;

// ── Interaction prompt ──
let promptEl = null;

// ── Door enter callback ──
let _enterDoorCallback = null;
export function setEnterDoorCallback(fn) { _enterDoorCallback = fn; }

// ── Door meshes (set from title-main after city build) ──
let _doorLeft = null, _doorRight = null;
export function setDoorMeshes(left, right) { _doorLeft = left; _doorRight = right; }
export function isDoorAnimActive() { return _doorAnim.active; }

const _doorAnim = { active: false, phase: 0, elapsed: 0, fadeEl: null, callback: null, leftX0: 0, rightX0: 0, doorsClosing: false };

// ── Ground-level NPC list (semi workers, etc.) ──
let _groundNPCs = [];
export function setGroundNPCs(npcs) { _groundNPCs = npcs; }

// ── Business people (dynamic positions — checked via group.position) ──
let _bizPeople = [];
export function setBizPeople(list) { _bizPeople = list; }

// ── Backward walk flag ──
let walkingBackward = false;
let wasBackward = false;

// ── Player collision radius ──
const PLAYER_R = 0.2;

// ── Site object colliders [cx, cz, halfW, halfD] ──
const SITE_COLLIDERS = [
  [100, -50, 5.6, 5.6],       // porta-potty (× S proportional)
  [150, -18.75, 6.25, 5],     // generator
  [18.75, 56.25, 4.4, 3.75],  // toolbox
];

// ── Vehicle colliders ──
// Semi trucks (static AABB) [cx, cz, halfX, halfZ, roofY]
const SEMI_COLLIDERS = [
  [-63, -142.5, 9, 2.5, 4.0],   // semi 1 (cab+trailer combined)
  [37, -142.5, 9, 2.5, 4.0],    // semi 2
];
const CAR_R = 3.5;        // bounding radius for rotated 3×6 car body
const CAR_ROOF_Y = 2.0;   // approx car body roof (0.3 + 1.65)

// ── Jump flip state ──
let flipCommitted = false;
let flipSpins = 0;        // 1, 2, or 3 full rotations
let flipInitVel = 0;

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

// ── Build player character ──
export function buildPlayer(scene) {
  playerGroup = new THREE.Group();

  const skin = new THREE.MeshBasicMaterial({ color: 0xd4a574 });
  const vest = new THREE.MeshBasicMaterial({ color: 0xCCFF00 });
  const pants = new THREE.MeshBasicMaterial({ color: 0x3a4a5a });
  const boots = new THREE.MeshBasicMaterial({ color: 0x3a2a1a });

  // Merge static head/hat/eyes/stripes/muscle lines → 1 vertex-colored mesh
  const staticParts = [
    [new THREE.BoxGeometry(0.29, 0.025, 0.19), 0xffffff, 0, 0.46, 0],      // stripe lower
    [new THREE.BoxGeometry(0.29, 0.025, 0.19), 0xffffff, 0, 0.58, 0],      // stripe upper
    [new THREE.BoxGeometry(0.18, 0.18, 0.18), 0xd4a574, 0, 0.80, 0],       // head
    [new THREE.BoxGeometry(0.03, 0.025, 0.01), 0x000000, -0.04, 0.82, 0.09], // left eye
    [new THREE.BoxGeometry(0.03, 0.025, 0.01), 0x000000, 0.04, 0.82, 0.09],  // right eye
    [new THREE.BoxGeometry(0.23, 0.08, 0.23), 0xFFD700, 0, 0.92, 0],       // hat
    [new THREE.BoxGeometry(0.26, 0.02, 0.26), 0xFFD700, 0, 0.89, 0],       // brim
    [new THREE.BoxGeometry(0.092, 0.012, 0.092), 0x8a6a4a, -0.19, 0.56, 0], // L bicep
    [new THREE.BoxGeometry(0.092, 0.012, 0.092), 0x8a6a4a, -0.19, 0.48, 0], // L mid
    [new THREE.BoxGeometry(0.092, 0.012, 0.092), 0x8a6a4a, 0.19, 0.56, 0],  // R bicep
    [new THREE.BoxGeometry(0.092, 0.012, 0.092), 0x8a6a4a, 0.19, 0.48, 0],  // R mid
  ];
  const sGeos = staticParts.map(([geo, col, x, y, z]) => { _colorGeo(geo, col); geo.translate(x, y, z); return geo; });
  const staticMesh = new THREE.Mesh(mergeGeometries(sGeos, false), new THREE.MeshBasicMaterial({ vertexColors: true }));
  playerGroup.add(staticMesh);
  sGeos.forEach(g => g.dispose());

  // Animated parts (kept separate)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.30, 0.18), vest);
  torso.position.y = 0.52;
  playerGroup.add(torso);

  const armGeo = new THREE.BoxGeometry(0.09, 0.25, 0.09);
  const leftArm = new THREE.Mesh(armGeo, skin);
  leftArm.position.set(-0.19, 0.50, 0);
  playerGroup.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo.clone(), skin);
  rightArm.position.set(0.19, 0.50, 0);
  playerGroup.add(rightArm);

  const legGeo = new THREE.BoxGeometry(0.10, 0.22, 0.11);
  const leftLeg = new THREE.Mesh(legGeo, pants);
  leftLeg.position.set(-0.08, 0.22, 0);
  playerGroup.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo.clone(), pants);
  rightLeg.position.set(0.08, 0.22, 0);
  playerGroup.add(rightLeg);

  const bootGeo = new THREE.BoxGeometry(0.11, 0.09, 0.14);
  const leftBoot = new THREE.Mesh(bootGeo, boots);
  leftBoot.position.set(-0.08, 0.05, 0.01);
  playerGroup.add(leftBoot);
  const rightBoot = new THREE.Mesh(bootGeo.clone(), boots);
  rightBoot.position.set(0.08, 0.05, 0.01);
  playerGroup.add(rightBoot);

  carryBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.15, 0.20),
    new THREE.MeshBasicMaterial({ color: 0x6a7580 })
  );
  carryBox.position.set(0.22, 0.42, 0.05);
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

  // ── Ground statics → 1 merged mesh ──
  // Seed random so positions are deterministic
  const _sr = () => Math.random(); // site uses Math.random, same as before
  const groundGeos = [];

  for (let i = 0; i < 6; i++) {
    const g = _colorGeo(new THREE.BoxGeometry(0.08, 0.08, 1.0 + _sr() * 0.5), 0x5a6570);
    const px = 125 + (_sr() - 0.5) * 18.75, py = 0.04 + i * 0.09, pz = (_sr() - 0.5) * 12.5;
    const ry = _sr() * 0.2;
    const m = new THREE.Matrix4().makeTranslation(px, py, pz).multiply(new THREE.Matrix4().makeRotationY(ry));
    g.applyMatrix4(m); groundGeos.push(g);
  }
  for (let i = 0; i < 4; i++) {
    const g = _colorGeo(new THREE.BoxGeometry(0.4, 0.25, 0.3), 0x5a5550);
    g.translate(135 + (_sr() - 0.5) * 12.5, 0.13 + i * 0.08, 6.25 + _sr() * 12.5);
    groundGeos.push(g);
  }
  for (let i = 0; i < 5; i++) {
    const g = _colorGeo(new THREE.BoxGeometry(0.06, 0.03, 1.2), 0x6a5030);
    const px = 118.75 + (_sr() - 0.5) * 6.25, py = 0.02 + i * 0.035, pz = -6.25 + _sr() * 6.25;
    const ry = (_sr() - 0.5) * 0.15;
    const m = new THREE.Matrix4().makeTranslation(px, py, pz).multiply(new THREE.Matrix4().makeRotationY(ry));
    g.applyMatrix4(m); groundGeos.push(g);
  }
  [[-37.5, 25], [62.5, -25], [112.5, 31.25]].forEach(([cx, cz]) => {
    const g = _colorGeo(new THREE.ConeGeometry(0.12, 0.35, 8), 0xe85020);
    g.translate(cx, 0.18, cz); groundGeos.push(g);
  });
  // Toolbox
  const tbGeo = _colorGeo(new THREE.BoxGeometry(0.4, 0.2, 0.25), 0x8a2020);
  tbGeo.translate(18.75, 0.1, 56.25); groundGeos.push(tbGeo);
  // Generator
  const genGeo = _colorGeo(new THREE.BoxGeometry(0.75, 0.5, 0.5), 0x3a4a2a);
  genGeo.translate(150, 0.25, -18.75); groundGeos.push(genGeo);
  // Porta-potty
  const portaGeo = _colorGeo(new THREE.BoxGeometry(0.6, 1.1, 0.6), 0x2a4a6a);
  portaGeo.translate(100, 0.55, -50); groundGeos.push(portaGeo);
  // Posts
  [[-75, -62.5, 75], [175, -50, 50]].forEach(([x, z1, z2]) => {
    [z1, (z1 + z2) / 2, z2].forEach(z => {
      const g = _colorGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), 0x4a4a44);
      g.translate(x, 0.3, z); groundGeos.push(g);
    });
  });
  if (groundGeos.length) {
    const merged = mergeGeometries(groundGeos, false);
    siteGroup.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true })));
    groundGeos.forEach(g => g.dispose());
  }

  // Tape lines (Lines can't merge with triangle meshes — keep separate)
  const tapeMat = new THREE.LineBasicMaterial({ color: 0xdcbe60 });
  [[-75, -62.5, 75], [175, -50, 50]].forEach(([x, z1, z2]) => {
    const tapeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.45, z1), new THREE.Vector3(x, 0.45, z2)
    ]);
    siteGroup.add(new THREE.Line(tapeGeo, tapeMat));
  });

  // Drop ring (transparent + DoubleSide — keep separate)
  const dropRing = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xdcbe60, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  dropRing.rotation.x = -Math.PI / 2;
  dropRing.position.y = 0.4;
  siteGroup.add(dropRing);

  // Roof plate (animated via setBuiltHeight — keep separate)
  const roofPlate = new THREE.Mesh(
    new THREE.BoxGeometry(OUTER_EDGE * 2, 0.15, OUTER_EDGE * 2),
    new THREE.MeshBasicMaterial({ color: 0x5a6570 })
  );
  roofPlate.position.y = ROOF_Y;
  siteGroup.add(roofPlate);

  // ── Ladders (4 on tower faces, merged into 1 vertex-colored mesh) ──
  // Built from y=0 to y=ROOF_Y; scaled down via setBuiltHeight()
  const ladderGeos = [];
  const railColor = 0x6a7080;
  const rungColor = 0x8a9098;
  const rungSpacing = 1.0;
  const ladderH = ROOF_Y;
  for (const lad of LADDERS) {
    const cx = lad.tanAxis === 'x' ? lad.tanPos : (lad.axis === 'x' ? lad.pos : 0);
    const cz = lad.tanAxis === 'z' ? lad.tanPos : (lad.axis === 'z' ? lad.pos : 0);
    const railOffset = 0.4;
    for (const side of [-1, 1]) {
      const rGeo = _colorGeo(new THREE.BoxGeometry(0.08, ladderH, 0.08), railColor);
      const rx = cx + (lad.tanAxis === 'x' ? side * railOffset : 0);
      const rz = cz + (lad.tanAxis === 'z' ? side * railOffset : 0);
      rGeo.translate(rx, ladderH / 2, rz);
      ladderGeos.push(rGeo);
    }
    const nRungs = Math.floor(ladderH / rungSpacing);
    for (let ri = 0; ri < nRungs; ri++) {
      const ry = ri * rungSpacing + 0.5;
      const rungGeo = _colorGeo(new THREE.BoxGeometry(
        lad.tanAxis === 'x' ? railOffset * 2 : 0.06,
        0.06,
        lad.tanAxis === 'z' ? railOffset * 2 : 0.06
      ), rungColor);
      rungGeo.translate(cx, ry, cz);
      ladderGeos.push(rungGeo);
    }
  }
  let ladderMesh = null;
  if (ladderGeos.length) {
    const ladderMerged = mergeGeometries(ladderGeos, false);
    ladderMesh = new THREE.Mesh(ladderMerged, new THREE.MeshBasicMaterial({ vertexColors: true }));
    siteGroup.add(ladderMesh);
    ladderGeos.forEach(g => g.dispose());
  }

  // ── Arrow + label helper ──
  function _makeArrow(labelText) {
    const group = new THREE.Group();
    const geos = [];
    const sg = _colorGeo(new THREE.BoxGeometry(0.8, 4, 0.8), 0xdcbe60);
    sg.translate(0, 2, 0); geos.push(sg);
    const hg = _colorGeo(new THREE.ConeGeometry(1.8, 3, 4), 0xdcbe60);
    hg.rotateX(Math.PI); hg.translate(0, -0.5, 0); geos.push(hg);
    const merged = mergeGeometries(geos, false);
    group.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 })));
    geos.forEach(g => g.dispose());
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3, 32),
      new THREE.MeshBasicMaterial({ color: 0xdcbe60, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
    );
    ring.rotation.x = Math.PI / 2; ring.position.y = -1.5;
    group.add(ring);
    // Canvas text label
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#dcbe60';
    ctx.font = 'bold 42px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(labelText, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    labelMesh.position.set(0, 5.5, 0);
    group.add(labelMesh);
    group.userData.labelMesh = labelMesh;
    return group;
  }

  // ── ENTER arrow (above tower entrance) ──
  const arrowGroup = _makeArrow('ENTER');
  arrowGroup.position.set(0, BASE_H + 8, OUTER_EDGE + 2);
  siteGroup.add(arrowGroup);

  // ── BUILD arrow (above launch pad — positioned later by scaffolding spawn) ──
  const buildArrow = _makeArrow('BUILD');
  buildArrow.position.set(50, 8, 80); // default near seesaw position
  siteGroup.add(buildArrow);

  // ── Playable crane (replaces static crane) ──
  const crane = buildPlayableCrane(scene, ROOF_Y);

  // ── Rooftop workers (4 construction workers matching interior appearance) ──
  const workerNames = ['Rodriguez', 'Kim', 'Murphy', 'Okafor'];
  // Height-aware dialogue: [workerIdx][floorLevel][3 lines]
  // Rodriguez: family legacy — grandpa built bridges, he builds to space
  // Kim: physics/measurement nerd — counts seconds, measures distances
  // Murphy: pragmatist — gear, weather, problems, just get it done
  // Okafor: big picture thinker — the name, the mission, looking down less
  const workerDialogue = [
    [ // Rodriguez — floor 0 (ground/base)
      ['First day on this job. My grandpa would\'ve loved it.', 'He built bridges. Real ones. Steel and river crossings.', 'Me? I\'m building straight up. He\'d call me crazy.'],
      ['Foundation\'s solid. Grandpa always said start with the base.', 'Three floors of concrete under us. That\'s a good feeling.', 'My old man poured foundations too. Runs in the blood.'],
      ['Two floors up and it already feels different.', 'Grandpa said every structure has a heartbeat. I\'m starting to hear it.', 'The beams sing when the wind hits right. He told me that would happen.'],
      ['Getting some real height now. Grandpa never built past four stories.', 'He\'d stand here and just look. That\'s what he did. Looked and understood.', 'I sent my mom a photo. She said I look like him up here.'],
      ['Halfway there. Grandpa never imagined something like this.', 'He built to connect two sides of a river. I\'m connecting earth to sky.', 'Five floors. His longest bridge was a quarter mile. We\'re going further.'],
      ['The wind changed up here. You can taste the altitude.', 'Grandpa had a saying: past six stories, the building builds you.', 'I used to think that was just talk. It isn\'t.'],
      ['Seven floors. I stopped comparing to bridges.', 'This is something new. Grandpa\'s rules still apply but the scale is different.', 'He\'d be quiet up here. Respectful quiet. That\'s how I know it\'s real.'],
      ['I can see the river from here. The one grandpa\'s bridge crosses.', 'Eight floors and I can see his work and mine in the same view.', 'Two builders, two generations, one sky.'],
      ['Almost to the top. Almost to something that doesn\'t have a name yet.', 'Grandpa built bridges. I build... this. A tower to space.', 'He\'d put his hand on the steel and just nod. That\'s all he\'d need to do.'],
      ['Ten floors. And they want more.', 'Grandpa never finished his last bridge. I\'m going to finish this.', 'Rodriguez family doesn\'t stop building. That\'s the only rule.'],
    ],
    [ // Kim — floor 0
      ['First thing I did was measure the foundation. Exactly right.', 'Ground level. Zero altitude. Baseline established.', 'I brought a stopwatch. For later.'],
      ['Floor one. Three-point-three meters per floor. Noted.', 'Dropped a bolt from the edge. Point-eight seconds to ground.', 'That\'s 3.2 meters of free fall. The math checks out.'],
      ['Floor two. Six-point-seven meters. Temperature dropped half a degree.', 'Sound travels differently already. Echo off the beams takes longer.', 'I\'m keeping a log. Every floor. Every measurement.'],
      ['Ten meters up. A dropped bolt takes one-point-four seconds now.', 'Wind speed at floor three averages twelve percent higher than ground.', 'The crane cable has exactly four hundred and twelve links. I counted.'],
      ['Thirteen-point-three meters. Barometric pressure measurably lower.', 'I timed the elevator. Forty-seven seconds per floor. Consistent.', 'The building sways 0.3 centimeters at this height. Imperceptible. But real.'],
      ['Halfway up. Sixteen-point-seven meters.', 'A wrench fell from here. Took one-point-eight seconds to hit ground.', 'One-point-eight seconds. That\'s how high we are.'],
      ['Floor six. Twenty meters. The horizon moved.', 'I can see two more city blocks than from floor five. Geometry.', 'Temperature is a full degree cooler than ground. My thermometer doesn\'t lie.'],
      ['Twenty-three meters. Bolt drop: two-point-two seconds.', 'The frequency of the wind has changed. Lower pitch. Longer wavelengths.', 'My log is forty pages now. Every floor tells a different story in numbers.'],
      ['Floor eight. Twenty-six-point-seven meters. Significant.', 'A wrench from here takes two-point-three seconds. I\'ve timed it nine times.', 'Nine consistent results. The physics up here are honest.'],
      ['Thirty-three meters. Top of segment one.', 'Final measurement: bolt drop is two-point-six seconds from roof.', 'Two-point-six seconds of pure gravity. Beautiful.'],
    ],
    [ // Murphy — floor 0
      ['Hardhat on. Boots laced. Let\'s get this done.', 'Ground level. Easiest part of the whole job.', 'Tools are sorted. Crane\'s fueled. No excuses.'],
      ['One floor up. Nothing fancy. Just work.', 'Bolts go in, beams go up. That\'s the deal.', 'Somebody forgot to tighten bay four. Fixed it.'],
      ['Two floors. Generator\'s running hot already.', 'I replaced three bolts today that should\'ve lasted a year.', 'Cheap hardware. I told them. Nobody listens.'],
      ['Wind\'s picking up at floor three. Adjust and continue.', 'The crane pulled left on the last lift. Compensated.', 'Every floor has a new problem. Every problem has a wrench.'],
      ['Crane\'s acting up again. Recalibrated the winch.', 'Four floors of other people\'s mistakes and I fix every one.', 'The job is the job. Complaining doesn\'t tighten bolts.'],
      ['Floor five. Halfway. Tools are holding up.', 'New safety cable on the east side. Old one was fraying.', 'Wind, bolts, temperature. Everything works different up here.'],
      ['Six floors. Porta-potty situation is getting dire.', 'I told management we need a second crane. Still waiting.', 'Meanwhile I\'m hauling double loads. Fine. I\'ve done worse.'],
      ['Rain makes everything heavier at this height.', 'Floor seven. The bolts are tighter up here. Thermal expansion.', 'Figure it out, bolt it down, move up. That\'s the job.'],
      ['Eight floors. My wrench set is down to six from twelve.', 'Lost three to gravity and three to Rodriguez borrowing them.', 'If this tower falls it won\'t be because of MY work.'],
      ['Top floor. Everything\'s secured. Double-checked.', 'Ten floors of problems and I solved every single one.', 'They want ten more? Fine. Bring bolts.'],
    ],
    [ // Okafor — floor 0
      ['They want to build a tower to space. And here we are.', 'Ground level. You can still smell the grass.', 'I wonder what this spot looked like before.'],
      ['One floor up. The city looks the same from here.', 'Why do they build towers? Because the ground runs out.', 'Or maybe because people need to look at something above them.'],
      ['Second floor. Starting to get perspective.', 'You can see the parking lot from here. All those tiny cars.', 'Funny how things look different when you\'re slightly above them.'],
      ['Three floors. The trees are below us now.', 'Heavy work for heavy hands.', 'Are we really leaving? Or just getting a better view?'],
      ['Four floors up. The city starts to look like a map.', 'I think about the people down there. Do they look up?', 'Probably not. People don\'t look up until someone builds something worth seeing.'],
      ['Floor five. Halfway to something.', 'Funny thing about building up. You forget what down felt like.', 'But standing here... I get it. A little.'],
      ['Six floors. The sounds from below are quieter now.', 'You stop hearing individual cars. It becomes a hum.', 'The higher you go, the more the world simplifies.'],
      ['Seven floors. I can see where the city ends.', 'There\'s a line where buildings stop and farmland starts.', 'From up here, the boundary looks so thin. So easy to cross.'],
      ['Eight floors. The sky is closer than the ground.', 'I don\'t look down much anymore. Not out of fear.', 'There\'s just more to see looking up.'],
      ['Ten floors. And they want ten more.', 'I look down less now. Not because it\'s scary.', 'Because up here, looking up is finally the right direction.'],
    ],
  ];
  const rooftopWorkers = [];
  const vcMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const wSkinMat = new THREE.MeshBasicMaterial({ color: 0xd4a878 });
  const wPantsMat = new THREE.MeshBasicMaterial({ color: 0x3a5070 });

  for (let wi = 0; wi < 4; wi++) {
    const wg = new THREE.Group();

    // Merge static parts: torso, 2 stripes, head, 2 eyes, hat, brim, 2 boots → 1 mesh
    const staticParts = [
      [new THREE.BoxGeometry(0.24, 0.26, 0.16), 0xFF6600, 0, 0.45, 0],       // torso
      [new THREE.BoxGeometry(0.25, 0.02, 0.17), 0x999900, 0, 0.40, 0],       // stripe (opaque approx)
      [new THREE.BoxGeometry(0.25, 0.02, 0.17), 0x999900, 0, 0.50, 0],       // stripe
      [new THREE.BoxGeometry(0.16, 0.16, 0.16), 0xd4a878, 0, 0.70, 0],       // head
      [new THREE.BoxGeometry(0.025, 0.02, 0.01), 0x1a1a2a, -0.035, 0.72, 0.08], // left eye
      [new THREE.BoxGeometry(0.025, 0.02, 0.01), 0x1a1a2a, 0.035, 0.72, 0.08],  // right eye
      [new THREE.BoxGeometry(0.20, 0.07, 0.20), 0xFFD700, 0, 0.82, 0],       // hat
      [new THREE.BoxGeometry(0.23, 0.02, 0.23), 0xFFD700, 0, 0.79, 0],       // brim
      [new THREE.BoxGeometry(0.10, 0.08, 0.12), 0x5a4030, -0.06, 0.04, 0.01],  // left boot
      [new THREE.BoxGeometry(0.10, 0.08, 0.12), 0x5a4030, 0.06, 0.04, 0.01],   // right boot
    ];
    const sGeos = staticParts.map(([geo, col, x, y, z]) => { _colorGeo(geo, col); geo.translate(x, y, z); return geo; });
    const staticMesh = new THREE.Mesh(mergeGeometries(sGeos, false), vcMat);
    wg.add(staticMesh);
    sGeos.forEach(g => g.dispose());

    // Animated limbs (kept separate for rotation)
    const wArmGeo = new THREE.BoxGeometry(0.08, 0.20, 0.08);
    const wLA = new THREE.Mesh(wArmGeo, wSkinMat);
    wLA.position.set(-0.16, 0.44, 0); wg.add(wLA);
    const wRA = new THREE.Mesh(wArmGeo.clone(), wSkinMat);
    wRA.position.set(0.16, 0.44, 0); wg.add(wRA);
    const wLegGeo = new THREE.BoxGeometry(0.09, 0.20, 0.10);
    const wLL = new THREE.Mesh(wLegGeo, wPantsMat);
    wLL.position.set(-0.06, 0.18, 0); wg.add(wLL);
    const wRL = new THREE.Mesh(wLegGeo.clone(), wPantsMat);
    wRL.position.set(0.06, 0.18, 0); wg.add(wRL);

    // Position randomly on rooftop
    const wx = (Math.random() - 0.5) * TOWER_HALF * 1.2;
    const wz = (Math.random() - 0.5) * TOWER_HALF * 1.2;
    wg.position.set(wx, ROOF_Y, wz);
    siteGroup.add(wg);
    rooftopWorkers.push({
      group: wg, name: workerNames[wi], dialogue: workerDialogue[wi],
      ci: 0,
      vx: (Math.random() - 0.5) * 0.02, vz: (Math.random() - 0.5) * 0.02,
      walkTimer: Math.random() * 300, idleTimer: 0, state: 'walk',
      leftArm: wLA, rightArm: wRA, leftLeg: wLL, rightLeg: wRL, walkCycle: Math.random() * 10,
    });
  }

  siteGroup.userData = { dropRing, roofPlate, crane, rooftopWorkers, arrowGroup, buildArrow, ladderMesh };

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

    const crane = siteGroup?.userData?.crane;
    if (crane?.isOperating) {
      if (e.code === 'Space') e.preventDefault();
      if (crane.handleKeyDown(e.code)) {
        if (e.code === 'Escape') {
          const exitPos = crane.exit();
          PLAYER.pos.copy(exitPos);
          PLAYER.vel.set(0, 0, 0);
        }
        return;
      }
    }

    if (_bulldozer?.isOperating) {
      if (_bulldozer.handleKeyDown(e.code)) {
        if (e.code === 'Escape') {
          const exitPos = _bulldozer.exit();
          PLAYER.pos.copy(exitPos);
          PLAYER.vel.set(0, 0, 0);
          if (playerGroup) playerGroup.visible = true;
          _syncBulldozerPosToSave();
        }
        return;
      }
      return; // bulldozer consumes all keys while operating
    }

    if (_scaffolding?.isOperating) {
      if (_scaffolding.handleKeyDown(e.code)) {
        if (e.code === 'Escape') {
          const exitPos = _scaffolding.exit();
          PLAYER.pos.copy(exitPos);
          PLAYER.vel.set(0, 0, 0);
        }
        return;
      }
      return;
    }

    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyE') handleInteract();
    if (e.code === 'Tab') { e.preventDefault(); if (_enterDoorCallback && _isNearDoor()) _startDoorAnim(); }
  };
  _keyupHandler = (e) => {
    keys[e.code] = false;

    const crane = siteGroup?.userData?.crane;
    if (crane?.isOperating) {
      crane.handleKeyUp(e.code);
      return;
    }

    if (_bulldozer?.isOperating) {
      _bulldozer.handleKeyUp(e.code);
      return;
    }

    if (_scaffolding?.isOperating) {
      _scaffolding.handleKeyUp(e.code);
      return;
    }

    if (e.code === 'Space' && PLAYER.active && PLAYER.isCharging && !PLAYER.onLadder) {
      const t = PLAYER.chargeT / CHARGE_MAX;
      PLAYER.vel.y = (JUMP_BASE + (JUMP_MAX - JUMP_BASE) * t) * _hungerMult();
      PLAYER.onGround = false;
      PLAYER.isCharging = false;
      PLAYER.chargeT = 0;
      // Flip: 1 spin default, 2 at 50%+, 3 at 90%+
      flipInitVel = PLAYER.vel.y;
      flipCommitted = true;
      flipSpins = t >= 0.9 ? 3 : t >= 0.5 ? 2 : 1;
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

// ── Hunger (shared with sim via localStorage) ──
let _hunger = 100;
let _hungerAcc = 0;
const _HUNGER_TICK = 15; // seconds between hunger decay (matches sim's 900 frames / 60fps)
let _hungerEl = null;

function _initHunger() {
  try {
    const raw = localStorage.getItem('spacetower_v15');
    if (raw) { const d = JSON.parse(raw); if (d.hunger != null) _hunger = d.hunger; }
  } catch { /* non-critical */ }
}

function _syncHungerToSave() {
  try {
    const raw = localStorage.getItem('spacetower_v15');
    const d = raw ? JSON.parse(raw) : { ts: Date.now() };
    d.hunger = _hunger;
    localStorage.setItem('spacetower_v15', JSON.stringify(d));
  } catch { /* non-critical */ }
}

function _hungerMult() { return _hunger >= 30 ? 1 : 0.5 + _hunger / 60; }

function _updateHungerHUD() {
  if (!_hungerEl) {
    _hungerEl = document.createElement('div');
    _hungerEl.id = 'ext-hunger';
    _hungerEl.style.cssText = 'position:fixed;top:8px;left:8px;z-index:15;background:rgba(0,0,0,0.4);color:#ff9060;padding:4px 11px;border-radius:12px;font-size:10px;letter-spacing:1px;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.1);font-family:monospace';
    document.body.appendChild(_hungerEl);
  }
  const h = Math.round(_hunger);
  _hungerEl.textContent = `\ud83c\udf56 ${h}`;
  _hungerEl.style.color = h < 30 ? '#ff4030' : '#ff9060';
}

export function disposeHungerHUD() {
  if (_hungerEl) { _hungerEl.remove(); _hungerEl = null; }
}

// ── Interaction ──
// floorsBuilt is derived from the sim's buildout data via setBuiltHeight().
// No separate localStorage key — the sim save is the single source of truth.
let floorsBuilt = 0;
let _onFloorBuiltCallback = null;
export function setOnFloorBuilt(cb) { _onFloorBuiltCallback = cb; }

function handleInteract() {
  const pp = PLAYER.pos;
  const crane = siteGroup?.userData?.crane;

  // Don't interact with anything while operating crane, bulldozer, or scaffolding
  if (crane?.isOperating || _bulldozer?.isOperating || _scaffolding?.isOperating) return;

  // Enter scaffolding game if near seesaw
  if (_scaffolding && _scaffolding.isNear(pp)) {
    _scaffolding.enter(playerGroup);
    PLAYER.vel.set(0, 0, 0);
    // Hide exterior prompt so it doesn't overlap scaffolding UI
    if (promptEl) { promptEl.style.opacity = '0'; }
    return;
  }

  // Enter bulldozer if near
  if (_bulldozer && _bulldozer.isNear(pp)) {
    _bulldozer.enter();
    PLAYER.vel.set(0, 0, 0);
    if (playerGroup) playerGroup.visible = false;
    return;
  }

  // Enter crane if near cab
  if (crane && crane.isNear(pp)) {
    const cabPos = crane.getCabWorldPos();
    PLAYER.pos.copy(cabPos);
    PLAYER.vel.set(0, 0, 0);
    crane.enter();
    return;
  }

  // Talk to nearby rooftop worker
  const nearWorker = _getNearbyWorker();
  if (nearWorker) {
    let lines = nearWorker.dialogue;
    // Height-aware dialogue: [floorLevel][3 lines] for rooftop workers
    if (lines.length && Array.isArray(lines[0])) {
      const level = Math.min(activeMaxFloor, lines.length - 1);
      lines = lines[level];
    }
    const line = lines[nearWorker.ci % lines.length];
    _showDialogue(nearWorker.name, line);
    nearWorker.ci = (nearWorker.ci + 1) % lines.length;
    return;
  }
  // Enter the tower through the front door
  if (_isNearDoor() && _enterDoorCallback) {
    _startDoorAnim();
    return;
  }
  // Pick up materials from the construction site (disabled when scaffolding game exists)
  if (!_scaffolding && !PLAYER.carrying && Math.abs(pp.x - 125) < 31.25 && Math.abs(pp.z) < 25) {
    PLAYER.carrying = true;
    if (carryBox) carryBox.visible = true;
    return;
  }
  // If carrying, try to build at the tower — otherwise just drop it (disabled when scaffolding exists)
  if (PLAYER.carrying) {
    const dropY = floorsBuilt * 3.333 + 5;
    if (!_scaffolding && Math.abs(pp.x) < 50 && Math.abs(pp.z) < 50 && Math.abs(pp.y - dropY) < 18.75) {
      PLAYER.carrying = false;
      if (carryBox) carryBox.visible = false;
      floorsBuilt++;
      setBuiltHeight(floorsBuilt);
      if (_onFloorBuiltCallback) _onFloorBuiltCallback(floorsBuilt);
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
  const colHalf = 1.5; // collision half-width for columns

  for (const [cx, cz] of COLUMNS) {
    if (Math.abs(pp.x - cx) < colHalf && Math.abs(pp.z - cz) < colHalf) {
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

// Tower wall collision — solid perimeter with +Z door exception
function _checkTowerWalls() {
  const pp = PLAYER.pos;
  const pv = PLAYER.vel;
  // Walls apply below the roof surface — on the roof the player walks freely and can fall off edges
  if (pp.y < 0 || pp.y >= activeRoofY - 0.3) return;

  const doorHalfW = 10; // matches vestibule half-width in title-city.js
  const edge = OUTER_EDGE;
  const r = PLAYER_R + 0.15; // wider detection to prevent phase-through on fast falls

  // +X wall
  if (Math.abs(pp.z) <= edge) {
    const d = pp.x - edge;
    if (Math.abs(d) < r) { pp.x = edge + (d >= 0 ? r : -r); pv.x = 0; }
  }
  // -X wall
  if (Math.abs(pp.z) <= edge) {
    const d = pp.x + edge;
    if (Math.abs(d) < r) { pp.x = -edge + (d >= 0 ? r : -r); pv.x = 0; }
  }
  // +Z wall (door exception)
  if (Math.abs(pp.x) <= edge && Math.abs(pp.x) >= doorHalfW) {
    const d = pp.z - edge;
    if (Math.abs(d) < r) { pp.z = edge + (d >= 0 ? r : -r); pv.z = 0; }
  }
  // -Z wall
  if (Math.abs(pp.x) <= edge) {
    const d = pp.z + edge;
    if (Math.abs(d) < r) { pp.z = -edge + (d >= 0 ? r : -r); pv.z = 0; }
  }
}

const BLOCK_W = 6.25; // local copy for wall collision

// Is player near the front door? (+Z face, within door opening, at ground level)
function _isNearDoor() {
  const pp = PLAYER.pos;
  return pp.y < 1 && Math.abs(pp.x) < 12 && pp.z > TOWER_HALF - 3 && pp.z < TOWER_HALF + 5;
}

// ── Door entry animation ──
function _startDoorAnim() {
  if (_doorAnim.active || !_enterDoorCallback) return;
  _doorAnim.active = true;
  _doorAnim.phase = 0;
  _doorAnim.elapsed = 0;
  _doorAnim.callback = _enterDoorCallback;
  _doorAnim.leftX0 = _doorLeft ? _doorLeft.position.x : -5;
  _doorAnim.rightX0 = _doorRight ? _doorRight.position.x : 5;
  keys = {};
  // Hide prompt and dialogue
  if (promptEl) { promptEl.style.opacity = '0'; }
  if (dialogueEl) { dialogueEl.style.opacity = '0'; }
  // Create fade overlay
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;z-index:9999;pointer-events:none';
  document.body.appendChild(el);
  _doorAnim.fadeEl = el;
}

function _setDoorGlow(opacity) {
  for (const d of [_doorLeft, _doorRight]) {
    if (!d || !d.parent) continue;
    const gi = d.parent.children.indexOf(d);
    if (gi >= 0 && d.parent.children[gi + 1]) {
      d.parent.children[gi + 1].material.opacity = opacity;
    }
  }
}

function _updateDoorAnim(dt) {
  const a = _doorAnim;
  a.elapsed += dt;
  const slideDist = 7; // how far each door slides open

  // Phase 0: Doors open (0–0.6s)
  if (a.phase === 0) {
    const dur = 0.6;
    const t = Math.min(a.elapsed / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    if (_doorLeft) _doorLeft.position.x = a.leftX0 - ease * slideDist;
    if (_doorRight) _doorRight.position.x = a.rightX0 + ease * slideDist;
    _setDoorGlow(0.15 + ease * 0.35);
    // Rotate player to face -Z (into tower)
    if (playerGroup) {
      const targetRot = Math.PI;
      let delta = targetRot - playerGroup.rotation.y;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      playerGroup.rotation.y += delta * Math.min(t * 3, 1);
    }
    if (t >= 1) { a.phase = 1; a.elapsed = 0; a.doorsClosing = false; }
  }
  // Phase 1: Walk in + doors close behind (0–1.6s)
  else if (a.phase === 1) {
    const dur = 1.6;
    const t = Math.min(a.elapsed / dur, 1);
    const ease = t * t * (3 - 2 * t);
    // Move player into vestibule
    const startZ = TOWER_HALF + 2;
    const endZ = TOWER_HALF - 12; // deep inside vestibule
    PLAYER.pos.z = startZ + (endZ - startZ) * ease;
    PLAYER.pos.x += (0 - PLAYER.pos.x) * 0.05;
    PLAYER.vel.z = -0.05;
    // Walk animation
    PLAYER.walkCycle += dt * 4;
    if (playerGroup) {
      const ud = playerGroup.userData;
      if (ud.leftLeg) {
        const sw = Math.sin(PLAYER.walkCycle * 3) * 0.3;
        ud.leftLeg.rotation.x = sw;
        ud.rightLeg.rotation.x = -sw;
        ud.leftArm.rotation.x = -sw * 0.6;
        ud.rightArm.rotation.x = sw * 0.6;
        ud.torso.rotation.z = Math.sin(PLAYER.walkCycle * 3) * 0.02;
      }
    }
    // Doors close behind player once they're past the threshold (t > 0.3)
    if (t > 0.3) {
      const closeT = Math.min((t - 0.3) / 0.4, 1);
      const closeEase = closeT * closeT * (3 - 2 * closeT);
      if (_doorLeft) _doorLeft.position.x = (a.leftX0 - slideDist) + closeEase * slideDist;
      if (_doorRight) _doorRight.position.x = (a.rightX0 + slideDist) - closeEase * slideDist;
    }
    // Glow dims as doors close
    const glowFade = t > 0.3 ? 0.5 * (1 - Math.min((t - 0.3) / 0.5, 1)) : 0.5;
    _setDoorGlow(glowFade);
    if (t >= 1) { a.phase = 2; a.elapsed = 0; }
  }
  // Phase 2: Fade to black (0–0.7s)
  else if (a.phase === 2) {
    const dur = 0.7;
    const t = Math.min(a.elapsed / dur, 1);
    if (a.fadeEl) a.fadeEl.style.opacity = String(t);
    if (t >= 1) {
      // Reset doors
      if (_doorLeft) _doorLeft.position.x = a.leftX0;
      if (_doorRight) _doorRight.position.x = a.rightX0;
      _setDoorGlow(0.15);
      if (a.fadeEl) { a.fadeEl.remove(); a.fadeEl = null; }
      const cb = a.callback;
      a.active = false; a.phase = 0; a.elapsed = 0; a.callback = null; a.doorsClosing = false;
      if (cb) cb();
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

// Vehicle collision — land on top or push out from sides
function _checkVehicleCollision() {
  const pp = PLAYER.pos;
  const pv = PLAYER.vel;

  // ── Semi trucks (static AABB) ──
  for (const [cx, cz, hx, hz, roofY] of SEMI_COLLIDERS) {
    const dx = pp.x - cx;
    const dz = pp.z - cz;
    const overX = (hx + PLAYER_R) - Math.abs(dx);
    const overZ = (hz + PLAYER_R) - Math.abs(dz);
    if (overX <= 0 || overZ <= 0) continue;

    // Landing on top (falling onto roof)
    if (pv.y <= 0 && pp.y >= roofY - 0.5 && pp.y <= roofY + 0.5) {
      pp.y = roofY;
      pv.y = 0;
      PLAYER.onGround = true;
      continue;
    }

    // Side collision (below roof)
    if (pp.y < roofY - 0.3) {
      if (overX < overZ) { pp.x = cx + Math.sign(dx || 1) * (hx + PLAYER_R); pv.x = 0; }
      else { pp.z = cz + Math.sign(dz || 1) * (hz + PLAYER_R); pv.z = 0; }
    }
  }

  // ── Business people cars (dynamic, circular) ──
  for (const bp of _bizPeople) {
    if (!bp.car || !bp.car.visible) continue;
    const cx = bp.car.position.x;
    const cz = bp.car.position.z;
    const dx = pp.x - cx;
    const dz = pp.z - cz;
    const distSq = dx * dx + dz * dz;
    const hitR = CAR_R + PLAYER_R;
    if (distSq > hitR * hitR) continue;

    const dist = Math.sqrt(distSq);

    // Landing on top
    if (pv.y <= 0 && pp.y >= CAR_ROOF_Y - 0.5 && pp.y <= CAR_ROOF_Y + 0.5) {
      pp.y = CAR_ROOF_Y;
      pv.y = 0;
      PLAYER.onGround = true;
      continue;
    }

    // Side collision (below roof)
    if (pp.y < CAR_ROOF_Y - 0.3 && dist > 0.01) {
      const push = hitR - dist;
      pp.x += (dx / dist) * push;
      pp.z += (dz / dist) * push;
    }
  }
}

// Is player currently standing on a vehicle surface?
function _isOnVehicle() {
  const pp = PLAYER.pos;
  // Semi trucks
  for (const [cx, cz, hx, hz, roofY] of SEMI_COLLIDERS) {
    if (Math.abs(pp.y - roofY) < 0.3 && Math.abs(pp.x - cx) <= hx && Math.abs(pp.z - cz) <= hz) return true;
  }
  // Biz cars
  for (const bp of _bizPeople) {
    if (!bp.car || !bp.car.visible) continue;
    const dx = pp.x - bp.car.position.x;
    const dz = pp.z - bp.car.position.z;
    if (Math.abs(pp.y - CAR_ROOF_Y) < 0.3 && dx * dx + dz * dz <= CAR_R * CAR_R) return true;
  }
  return false;
}

// Ladder entry — walk into a ladder from outside to start climbing
function _checkLadderEntry(preVelAxis) {
  if (PLAYER.onLadder) return; // already on one
  const pp = PLAYER.pos;

  // ── Side entry: walk into ladder from outside ──
  for (const lad of LADDERS) {
    const sign = Math.sign(lad.pos);
    const normalDist = sign * (pp[lad.axis] - lad.pos);
    if (normalDist < -0.3 || normalDist > LADDER_ENTRY_DEPTH) continue;
    if (Math.abs(pp[lad.tanAxis] - lad.tanPos) > LADDER_HALF_W) continue;

    // Must have been pressing toward the wall (pre-collision velocity check)
    if (sign * preVelAxis[lad.axis] >= 0) continue;

    PLAYER.onLadder = lad;
    PLAYER.onGround = false;
    PLAYER.vel.set(0, 0, 0);
    PLAYER.isCharging = false;
    PLAYER.chargeT = 0;
    pp[lad.axis] = lad.pos;
    pp[lad.tanAxis] = lad.tanPos;
    return;
  }

  // ── Top entry: on roof, near edge, pressing S/Down → climb down ──
  if (PLAYER.onGround && Math.abs(pp.y - activeRoofY) < 0.2) {
    const pressDown = keys['KeyS'] || keys['ArrowDown'];
    if (!pressDown) return;
    for (const lad of LADDERS) {
      if (Math.abs(pp[lad.axis] - lad.pos) > 3) continue; // within 3 units of this edge
      if (Math.abs(pp[lad.tanAxis] - lad.tanPos) > LADDER_HALF_W) continue;

      PLAYER.onLadder = lad;
      PLAYER.onGround = false;
      PLAYER.vel.set(0, 0, 0);
      pp.y = activeRoofY - 0.5; // drop just below roof
      pp[lad.axis] = lad.pos;
      pp[lad.tanAxis] = lad.tanPos;
      return;
    }
  }
}

// ── Rooftop worker AI ──
let dialogueEl = null;
let dialogueTimer = 0;

function _getNearbyWorker() {
  const pp = PLAYER.pos;
  // Check rooftop workers
  if (siteGroup && siteGroup.userData.rooftopWorkers) {
    for (const w of siteGroup.userData.rooftopWorkers) {
      const wp = w.group.position;
      const dx = pp.x - wp.x, dz = pp.z - wp.z;
      const dy = Math.abs(pp.y - wp.y);
      if (dx * dx + dz * dz < 9 && dy < 2) return w;
    }
  }
  // Check ground-level NPCs (semi workers)
  for (const w of _groundNPCs) {
    const dx = pp.x - w.wx, dz = pp.z - w.wz;
    if (dx * dx + dz * dz < 16 && pp.y < 1.5) return w; // within 4 units, at ground
  }
  // Check business people (dynamic positions, only when visible and on foot)
  for (const bp of _bizPeople) {
    if (!bp.group.visible) continue;
    if (bp.phase === 'driving_in' || bp.phase === 'driving_out') continue;
    const gp = bp.group.position;
    const dx = pp.x - gp.x, dz = pp.z - gp.z;
    if (dx * dx + dz * dz < 16 && pp.y < 1.5) return bp;
  }
  return null;
}

function _showDialogue(name, text) {
  if (!dialogueEl) {
    dialogueEl = document.createElement('div');
    dialogueEl.style.cssText = 'position:fixed;top:18%;left:50%;transform:translateX(-50%);z-index:70;color:rgba(255,255,255,0.8);font-family:monospace;font-size:11px;line-height:1.5;pointer-events:none;user-select:none;background:rgba(0,0,0,0.5);padding:10px 16px;border-radius:6px;backdrop-filter:blur(4px);max-width:340px;text-align:center;transition:opacity 0.4s';
    document.body.appendChild(dialogueEl);
  }
  dialogueEl.innerHTML = `<span style="color:#FFD700;font-weight:bold">${name}:</span> "${text}"`;
  dialogueEl.style.opacity = '1';
  dialogueTimer = 4; // seconds to display
}

function _updateDialogue(dt) {
  if (dialogueTimer > 0) {
    dialogueTimer -= dt;
    if (dialogueTimer <= 0 && dialogueEl) {
      dialogueEl.style.opacity = '0';
    }
  }
}

function _updateRooftopWorkers(dt) {
  if (!siteGroup) return;
  // Animate ENTER arrow — bob up/down and rotate slowly
  const arrow = siteGroup.userData.arrowGroup;
  const bArrow = siteGroup.userData.buildArrow;
  const t = performance.now() * 0.001;
  const scaffOp = _scaffolding && _scaffolding.isOperating;
  if (arrow) {
    arrow.visible = !scaffOp;
    arrow.position.y = BASE_H + 8 + Math.sin(t * 1.5) * 1.5;
    arrow.rotation.y = t * 0.4;
    // Label billboard: face camera
    if (arrow.userData.labelMesh) arrow.userData.labelMesh.rotation.y = -arrow.rotation.y;
  }
  // Animate BUILD arrow — hide when operating scaffolding
  if (bArrow) {
    bArrow.visible = !scaffOp;
    bArrow.position.y = 8 + Math.sin(t * 1.5 + 1) * 1.5; // offset phase
    bArrow.rotation.y = t * 0.4;
    if (bArrow.userData.labelMesh) bArrow.userData.labelMesh.rotation.y = -bArrow.rotation.y;
  }
  if (!siteGroup.userData.rooftopWorkers) return;
  const workers = siteGroup.userData.rooftopWorkers;
  const roofBound = TOWER_HALF * 0.8; // keep within tower footprint
  // During birdseye phase, workers converge toward the crate landing spot
  const attracting = _scaffolding && _scaffolding.isOperating && _scaffolding.phase === 'birdseye';
  const crateXZ = attracting ? _scaffolding.getCratePos() : null;
  for (const w of workers) {
    w.walkCycle += 0.04;
    if (attracting && crateXZ) {
      // Override: walk toward crate landing position
      const dx = crateXZ.x - w.group.position.x;
      const dz = crateXZ.z - w.group.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1.5) {
        const spd = 0.04;
        w.group.position.x += (dx / d) * spd;
        w.group.position.z += (dz / d) * spd;
        w.group.rotation.y = Math.atan2(dx, dz);
      }
      const sw = Math.sin(w.walkCycle * 4) * 0.3;
      w.leftLeg.rotation.x = sw; w.rightLeg.rotation.x = -sw;
      w.leftArm.rotation.x = -sw * 0.6; w.rightArm.rotation.x = sw * 0.6;
    } else if (w.state === 'walk') {
      w.group.position.x += w.vx;
      w.group.position.z += w.vz;
      // Keep on rooftop
      if (Math.abs(w.group.position.x) > roofBound) { w.vx *= -1; w.group.position.x = Math.sign(w.group.position.x) * roofBound; }
      if (Math.abs(w.group.position.z) > roofBound) { w.vz *= -1; w.group.position.z = Math.sign(w.group.position.z) * roofBound; }
      // Face walk direction
      w.group.rotation.y = Math.atan2(w.vx, w.vz);
      // Animate limbs
      const sw = Math.sin(w.walkCycle * 3) * 0.25;
      w.leftLeg.rotation.x = sw;
      w.rightLeg.rotation.x = -sw;
      w.leftArm.rotation.x = -sw * 0.5;
      w.rightArm.rotation.x = sw * 0.5;
      w.walkTimer -= 1;
      if (w.walkTimer <= 0) { w.state = 'idle'; w.idleTimer = 120 + Math.random() * 200; }
    } else {
      // Idle — limbs settle
      w.leftLeg.rotation.x *= 0.9;
      w.rightLeg.rotation.x *= 0.9;
      w.leftArm.rotation.x *= 0.9;
      w.rightArm.rotation.x *= 0.9;
      w.idleTimer -= 1;
      if (w.idleTimer <= 0) {
        w.state = 'walk';
        w.vx = (Math.random() - 0.5) * 0.02;
        w.vz = (Math.random() - 0.5) * 0.02;
        w.walkTimer = 150 + Math.random() * 300;
      }
    }
  }
  _updateDialogue(dt);
}

// ── Interaction prompt (lazy-created DOM element) ──
function _updateCranePrompt(crane) {
  if (!promptEl) {
    promptEl = document.createElement('div');
    promptEl.style.cssText = 'position:fixed;bottom:52%;left:50%;transform:translateX(-50%);z-index:60;color:rgba(255,255,255,0.45);font-family:monospace;font-size:10px;pointer-events:none;user-select:none;letter-spacing:0.1em';
    document.body.appendChild(promptEl);
  }
  let text = 'A/D rotate \u2022 W/S winch \u2022 Q/E trolley \u2022 SPACE grab';
  if (crane.hasPayload) {
    if (crane.chargeT > 0) {
      const pct = Math.round((crane.chargeT / crane.chargeMax) * 100);
      text = `CHARGING: ${pct}% \u2014 release F to LAUNCH!`;
    } else {
      text = 'F hold to charge \u2022 SPACE drop \u2022 ESC exit';
    }
  } else {
    text += ' \u2022 ESC exit';
  }
  promptEl.textContent = text;
  promptEl.style.opacity = '1';
}

function _updateDozerPrompt() {
  if (!promptEl) {
    promptEl = document.createElement('div');
    promptEl.style.cssText = 'position:fixed;bottom:52%;left:50%;transform:translateX(-50%);z-index:60;color:rgba(255,255,255,0.45);font-family:monospace;font-size:10px;pointer-events:none;user-select:none;letter-spacing:0.1em';
    document.body.appendChild(promptEl);
  }
  let text = 'W/S drive \u2022 A/D turn \u2022 SHIFT boost \u2022 SPACE jump';
  text += _bulldozer.bladeDown ? ' \u2022 F blade up' : ' \u2022 F blade down';
  text += ' \u2022 ESC exit';
  promptEl.textContent = text;
  promptEl.style.opacity = '1';
}

function _updatePrompt() {
  const pp = PLAYER.pos;
  let text = '';
  const crane = siteGroup?.userData?.crane;
  const nearWorker = _getNearbyWorker();
  if (_scaffolding && !_scaffolding.isOperating && _scaffolding.isNear(pp)) {
    text = `E \u2014 launch materials (Floor ${_scaffolding.currentFloor + 1})`;
  } else if (_bulldozer && !_bulldozer.isOperating && _bulldozer.isNear(pp)) {
    text = 'E \u2014 operate bulldozer';
  } else if (crane && !crane.isOperating && crane.isNear(pp)) {
    text = 'E \u2014 operate crane';
  } else if (nearWorker) {
    text = `E \u2014 talk to ${nearWorker.name}`;
  } else if (_isNearDoor() && _enterDoorCallback) {
    text = 'E \u2014 enter tower';
  } else if (!PLAYER.carrying && Math.abs(pp.x - 125) < 37.5 && Math.abs(pp.z) < 31.25 && pp.y < 1) {
    text = 'E \u2014 pick up';
  } else if (PLAYER.carrying) {
    const dropY = floorsBuilt * 3.333 + 5;
    if (Math.abs(pp.x) < 50 && Math.abs(pp.z) < 50 && Math.abs(pp.y - dropY) < 18.75) {
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
  if (_doorAnim.active) {
    _updateDoorAnim(dt);
    if (playerGroup) playerGroup.position.copy(PLAYER.pos);
    return;
  }
  if (!PLAYER.active || !playerGroup) return;

  // ── Hunger tick ──
  _hungerAcc += dt;
  if (_hungerAcc >= _HUNGER_TICK) {
    _hungerAcc -= _HUNGER_TICK;
    if (_hunger > 0) { _hunger = Math.max(0, _hunger - 1); _syncHungerToSave(); }
  }
  _updateHungerHUD();

  const crane = siteGroup?.userData?.crane;

  // If operating scaffolding game, it controls the player
  if (_scaffolding?.isOperating) {
    _scaffolding.update(dt, keys);
    // Player position is set by the scaffolding game
    PLAYER.vel.set(0, 0, 0);
    PLAYER.onGround = true;
    if (crane) crane.update(dt, PLAYER.pos, keys);
    if (_bulldozer && !_bulldozer.isOperating) _bulldozer.update(dt, PLAYER.pos, keys);
    _updateRooftopWorkers(dt); // workers must animate for birdseye attraction
    return;
  }

  // If operating bulldozer, skip normal movement
  if (_bulldozer?.isOperating) {
    _bulldozer.update(dt, PLAYER.pos, keys);
    const dozerPos = _bulldozer.getWorldPos();
    PLAYER.pos.set(dozerPos.x, dozerPos.y, dozerPos.z);
    // Set velocity from bulldozer heading + speed so camera follows direction
    const dSpd = _bulldozer.speed;
    PLAYER.vel.set(
      Math.sin(_bulldozer.heading) * dSpd * 0.01,
      0,
      Math.cos(_bulldozer.heading) * dSpd * 0.01
    );
    PLAYER.onGround = true;

    // Player is hidden while operating — just track position for camera
    if (playerGroup) playerGroup.position.copy(PLAYER.pos);

    _updateDozerPrompt();
    // Still update crane for projectile physics
    if (crane) crane.update(dt, PLAYER.pos, keys);
    return;
  }

  // If operating crane, skip normal movement — crane handles input
  if (crane?.isOperating) {
    crane.update(dt, PLAYER.pos, keys);
    const cabPos = crane.getCabWorldPos();
    PLAYER.pos.copy(cabPos);
    PLAYER.vel.set(0, 0, 0);

    // Position player inside the cab (offset down to seat level)
    playerGroup.position.copy(cabPos);
    playerGroup.position.y -= 0.55;
    playerGroup.rotation.y = crane.boomAngle + Math.PI / 2;
    playerGroup.rotation.x = 0;

    // Seated pose — hands on levers
    const ud = playerGroup.userData;
    ud.torso.position.y = 0.52;
    ud.torso.rotation.z = 0;
    ud.leftLeg.rotation.x = 1.2;
    ud.rightLeg.rotation.x = 1.2;
    ud.leftArm.rotation.x = 0.6;
    ud.rightArm.rotation.x = 0.6;
    ud.leftArm.rotation.z = 0.15;
    ud.rightArm.rotation.z = -0.15;

    _updateCranePrompt(crane);
    return;
  }

  const pp = PLAYER.pos;
  const pv = PLAYER.vel;

  // ═══════════════════════════════════════════════════════════════
  // LADDER CLIMBING — completely separate movement when on a ladder
  // ═══════════════════════════════════════════════════════════════
  if (PLAYER.onLadder) {
    const lad = PLAYER.onLadder;
    const spd = LADDER_CLIMB_SPEED;

    // W/S = up/down
    pv.y = 0;
    if (keys['KeyW'] || keys['ArrowUp']) pv.y = spd;
    if (keys['KeyS'] || keys['ArrowDown']) pv.y = -spd;

    // A/D = side-to-side along the ladder face
    const tanInput = ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0)
                   - ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0);
    pv[lad.tanAxis] = tanInput * spd * lad.tanDir;
    pv[lad.axis] = 0; // no movement into/away from wall

    // Apply
    pp.y += pv.y;
    pp[lad.tanAxis] += pv[lad.tanAxis];
    pp[lad.axis] = lad.pos; // snap to ladder face

    // Roof step-off
    if (pp.y >= activeRoofY) {
      pp.y = activeRoofY;
      pv.y = 0;
      PLAYER.onGround = true;
      PLAYER.onLadder = null;
      if (lad.axis === 'x') pp.x = Math.sign(lad.pos) * (OUTER_EDGE - 2);
      else pp.z = Math.sign(lad.pos) * (OUTER_EDGE - 2);
    }

    // Ground step-off
    if (pp.y <= 0) {
      pp.y = 0;
      PLAYER.onGround = true;
      PLAYER.onLadder = null;
    }

    // Fall off if moved past lateral edges — clean drop
    if (Math.abs(pp[lad.tanAxis] - lad.tanPos) > LADDER_HALF_W) {
      PLAYER.onLadder = null;
      PLAYER.onGround = false;
      pv.y = 0;
      pv.x = 0;
      pv.z = 0;
      // Push clearly outside grab zone so we don't re-grab
      pp[lad.axis] = lad.pos + Math.sign(lad.pos) * (LADDER_ENTRY_DEPTH + 0.3);
    }

    // Jump off ladder (space)
    if (PLAYER.onLadder && keys['Space']) {
      PLAYER.onLadder = null;
      PLAYER.onGround = false;
      pv.y = JUMP_BASE;
      pv[lad.axis] = Math.sign(lad.pos) * 0.12; // push away from wall
      pv[lad.tanAxis] = 0;
    }

    // Walk cycle for climb animation
    if (Math.abs(pv.y) > 0.001 || Math.abs(pv[lad.tanAxis]) > 0.001) {
      PLAYER.walkCycle += 0.06;
    }

  } else {
  // ═══════════════════════════════════════════════════════════════
  // NORMAL GROUND/AIR MOVEMENT
  // ═══════════════════════════════════════════════════════════════

  let inputFwd = 0, inputRight = 0;
  if (keys['KeyW'] || keys['ArrowUp']) inputFwd = 1;
  if (keys['KeyA'] || keys['ArrowLeft']) inputRight = -1;
  if (keys['KeyD'] || keys['ArrowRight']) inputRight = 1;
  const hasBack = keys['KeyS'] || keys['ArrowDown'];

  const inputLen = Math.sqrt(inputFwd * inputFwd + inputRight * inputRight);
  walkingBackward = false;

  if (hasBack && !inputFwd) {
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
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'] ? SPRINT_MULT : 1;
    const spd = (PLAYER.carrying ? MOVE_SPEED * 0.75 : MOVE_SPEED) * sprint * _hungerMult();
    pv.x = worldX * spd;
    pv.z = worldZ * spd;
    PLAYER.walkCycle += 0.06;
  } else if (inputLen > 0) {
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
    const sprint2 = keys['ShiftLeft'] || keys['ShiftRight'] ? SPRINT_MULT : 1;
    const spd2 = (PLAYER.carrying ? MOVE_SPEED * 0.75 : MOVE_SPEED) * sprint2 * _hungerMult();
    pv.x = worldX * spd2;
    pv.z = worldZ * spd2;
    PLAYER.walkCycle += 0.06;
  } else {
    if (wasBackward) {
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

  // ── Jump charge (hold space — works on ground or mid-air) ──
  if (keys['Space']) {
    PLAYER.isCharging = true;
    PLAYER.chargeT = Math.min(PLAYER.chargeT + 1, CHARGE_MAX);
  }

  // ── Gravity ──
  if (!PLAYER.onGround) pv.y -= GRAVITY;

  // Capture pre-collision velocity for ladder entry detection
  const preVel = { x: pv.x, z: pv.z };

  // ── Apply velocity ──
  pp.x += pv.x;
  pp.z += pv.z;
  pp.y += pv.y;

  // ── Collision ──
  _checkTowerCollision();
  _checkTowerWalls();
  _checkFoundationWalls();
  _checkColumnCollision();
  _checkSiteCollision();
  _checkVehicleCollision();
  _checkLadderEntry(preVel);

  // ── Walk off edge ──
  if (PLAYER.onGround && pp.y > 0.1) {
    if (Math.abs(pp.y - activeRoofY) < 0.1) {
      if (Math.abs(pp.x) > OUTER_EDGE || Math.abs(pp.z) > OUTER_EDGE) PLAYER.onGround = false;
    } else if (pp.y >= BASE_H + FLOOR_H - 0.1) {
      if (!_isOnBeam(pp.x, pp.z)) PLAYER.onGround = false;
    } else if (Math.abs(pp.y - BASE_H) < 0.1) {
      if (!_isOnFoundation(pp.x, pp.z)) PLAYER.onGround = false;
    } else if (pp.y > 0.5 && pp.y < BASE_H - 1) {
      // Vehicle or heightmap terrain — fall if not on a vehicle and above terrain
      const _gH = _getExtTerrainHeight(pp.x, pp.z);
      if (!_isOnVehicle() && pp.y > _gH + 0.2) PLAYER.onGround = false;
    }
  }

  // ── Ground (heightmap-aware) ──
  const _groundH = _getExtTerrainHeight(pp.x, pp.z);
  if (pp.y <= _groundH) { pp.y = _groundH; pv.y = 0; PLAYER.onGround = true; }

  } // end normal movement

  // ── Bounds ──
  pp.x = Math.max(-500, Math.min(500, pp.x));
  pp.z = Math.max(-500, Math.min(500, pp.z));

  // ── Animation ──
  const walking = Math.abs(pv.x) > 0.005 || Math.abs(pv.z) > 0.005;
  const ud = playerGroup.userData;

  if (PLAYER.onLadder) {
    // Climbing animation — alternating arms/legs
    const climbing = Math.abs(pv.y) > 0.001;
    if (climbing) PLAYER.walkCycle += 0.08;
    const sw = climbing ? Math.sin(PLAYER.walkCycle * 3) * 0.5 : 0;
    ud.torso.position.y = 0.52;
    ud.leftLeg.rotation.x = sw;
    ud.rightLeg.rotation.x = -sw;
    ud.leftArm.rotation.x = -sw;
    ud.rightArm.rotation.x = sw;
    ud.leftArm.rotation.z = -0.3; // arms out to sides (gripping rungs)
    ud.rightArm.rotation.z = 0.3;
    ud.torso.rotation.z = 0;
    // Face the wall
    const lad = PLAYER.onLadder;
    const faceAngle = Math.atan2(-Math.sign(lad.pos) * (lad.axis === 'x' ? 1 : 0),
                                  -Math.sign(lad.pos) * (lad.axis === 'z' ? 1 : 0));
    playerGroup.rotation.y = faceAngle;
    playerGroup.rotation.x = 0;
  } else if (PLAYER.isCharging) {
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
    // Always face velocity direction — when walking backward, velocity points
    // toward camera so the character's face is visible
    const targetRot = Math.atan2(pv.x, pv.z);
    let delta = targetRot - playerGroup.rotation.y;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    playerGroup.rotation.y += delta * 0.15;
  }

  // ── Jump flip (1/2/3 spins with tuck) ──
  if (flipCommitted && !PLAYER.onGround) {
    const t = (flipInitVel - PLAYER.vel.y) / (2 * flipInitVel);
    const clamped = Math.max(0, Math.min(1, t));
    const eased = easeInOutSine(clamped);
    playerGroup.rotation.x = eased * Math.PI * 2 * flipSpins;
    const tuck = Math.sin(clamped * Math.PI);
    ud.leftArm.rotation.x = -2.2 * tuck;
    ud.rightArm.rotation.x = -2.2 * tuck;
    ud.leftArm.rotation.z = -0.4 * tuck;
    ud.rightArm.rotation.z = 0.4 * tuck;
    ud.leftLeg.rotation.x = -1.8 * tuck;
    ud.rightLeg.rotation.x = -1.8 * tuck;
    ud.torso.position.y = 0.52 - 0.06 * tuck;
  }

  if (PLAYER.onGround && (flipCommitted || playerGroup.rotation.x !== 0)) {
    playerGroup.rotation.x = 0;
    flipCommitted = false;
  }

  _updatePrompt();
  _updateRooftopWorkers(dt);

  // Update crane even when not operating (projectile physics + light blink)
  if (crane) crane.update(dt, PLAYER.pos, keys);
  // Update bulldozer even when not operating (idle vibration)
  if (_bulldozer && !_bulldozer.isOperating) _bulldozer.update(dt, PLAYER.pos, keys);
  // Update scaffolding even when not operating (seesaw visual)
  if (_scaffolding && !_scaffolding.isOperating) _scaffolding.update(dt, keys);

  if (PLAYER.carrying && carryBox) {
    carryBox.rotation.z = Math.sin(performance.now() * 0.003) * 0.04;
  }
}

// ── Accessors ──
export function getPlayerPos() { return PLAYER.pos; }
export function getPlayerVel() { return PLAYER.vel; }
export function getActiveRoofY() { return activeRoofY; }
export function getCrane() { return siteGroup?.userData?.crane || null; }

export function activateExterior() {
  PLAYER.active = true;
  PLAYER.isCharging = false;
  PLAYER.chargeT = 0;
  PLAYER.onLadder = null;
  _initHunger();
}

export function deactivateExterior() {
  PLAYER.active = false;
  keys = {};
  if (promptEl) { promptEl.remove(); promptEl = null; }
  if (dialogueEl) { dialogueEl.remove(); dialogueEl = null; }
  if (_doorAnim.fadeEl) { _doorAnim.fadeEl.remove(); _doorAnim.fadeEl = null; }
  _doorAnim.active = false; _doorAnim.phase = 0; _doorAnim.elapsed = 0; _doorAnim.callback = null;
  _syncHungerToSave();
  _syncBulldozerPosToSave();
  disposeHungerHUD();
}

export function setBuiltHeight(topBuilt) {
  activeMaxFloor = Math.max(0, topBuilt - 1);
  activeRoofY = BASE_H + Math.max(1, topBuilt) * FLOOR_H;
  floorsBuilt = topBuilt;
  if (!siteGroup) return;
  const ud = siteGroup.userData;
  // Reposition roof plate to match built height
  if (ud.roofPlate) ud.roofPlate.position.y = activeRoofY;
  // Reposition crane to sit on the active rooftop
  if (ud.crane) ud.crane.setRoofY(activeRoofY);
  // Reposition workers to the active rooftop
  if (ud.rooftopWorkers) {
    ud.rooftopWorkers.forEach(w => { w.group.position.y = activeRoofY; });
  }
  // Scale ladders to match built height
  if (ud.ladderMesh) {
    ud.ladderMesh.scale.y = activeRoofY / ROOF_Y;
  }
}

export function isExteriorActive() { return PLAYER.active; }
export function isWalkingBackward() { return walkingBackward; }
export function getBulldozer() { return _bulldozer; }
export function getScaffolding() { return _scaffolding; }

export function spawnScaffolding(scene) {
  if (_scaffolding) return _scaffolding;
  _scaffolding = buildScaffoldingGame(scene, activeRoofY, floorsBuilt, (completedFloor) => {
    floorsBuilt = completedFloor + 1;
    setBuiltHeight(floorsBuilt);
    if (_onFloorBuiltCallback) _onFloorBuiltCallback(floorsBuilt);
    _scaffolding.setRoofY(activeRoofY);
  });
  // Sync tower if scaffolding save is ahead — batch restore
  const prevBuilt = floorsBuilt;
  if (_scaffolding.currentFloor > prevBuilt) {
    floorsBuilt = _scaffolding.currentFloor;
    setBuiltHeight(floorsBuilt);
    // Call the callback once with final value — it restores the top floor,
    // adjusts columns, and syncs the save. We manually restore intermediate floors.
    if (_onFloorBuiltCallback) _onFloorBuiltCallback(floorsBuilt);
    _scaffolding.setRoofY(activeRoofY);
  }
  // Position BUILD arrow above the launch pad
  if (siteGroup?.userData?.buildArrow) {
    siteGroup.userData.buildArrow.position.x = _scaffolding.worldX;
    siteGroup.userData.buildArrow.position.z = _scaffolding.worldZ;
  }
  return _scaffolding;
}

// ── Heightmap data cache (read from save, shared with bulldozer terrain) ──
let _heightmapData = null;  // Float32Array or null
// Use constants from terrain system (T3D_SEGS=200 → 201 vertices, T3D_SIZE=400)
const _HM_SEGS = 201;
const _HM_SIZE = 400;

function _readHeightmapFromSave() {
  try {
    const raw = localStorage.getItem('spacetower_v15');
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.terrain3d && d.terrain3d.initialized && d.terrain3d.heightmap) {
      return new Float32Array(d.terrain3d.heightmap);
    }
  } catch (e) { /* ignore */ }
  return null;
}

function _readBulldozerPosFromSave() {
  try {
    const raw = localStorage.getItem('spacetower_v15');
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.bulldozer && d.bulldozer.wx != null) {
      return { wx: d.bulldozer.wx, wz: d.bulldozer.wz, wAngle: d.bulldozer.wAngle || 0 };
    }
  } catch (e) { /* ignore */ }
  return null;
}

function _syncBulldozerPosToSave() {
  if (!_bulldozer) return;
  try {
    const raw = localStorage.getItem('spacetower_v15');
    if (!raw) return;
    const d = JSON.parse(raw);
    const wp = _bulldozer.getWorldPos();
    if (!d.bulldozer) d.bulldozer = {};
    d.bulldozer.wx = wp.x;
    d.bulldozer.wz = wp.z;
    d.bulldozer.wAngle = _bulldozer.heading;
    localStorage.setItem('spacetower_v15', JSON.stringify(d));
  } catch (e) { /* ignore */ }
}

/** Get terrain height at world position — delegates to shared bilinear interpolation */
function _getExtTerrainHeight(wx, wz) {
  if (!_heightmapData) return 0;
  return sampleHeightmap(_heightmapData, _HM_SEGS, wx, wz, _HM_SIZE, _HM_SEGS - 1);
}

export function spawnBulldozer(scene) {
  if (_bulldozer) return _bulldozer;

  // Try to load heightmap from save
  _heightmapData = _readHeightmapFromSave();
  if (_heightmapData) {
    _terrainMesh = buildTerrainMeshFromHeightmap(scene, _heightmapData, _HM_SEGS, _HM_SIZE, 0);
  } else {
    _terrainMesh = buildTerrainMesh(scene, 0);
  }

  _bulldozer = buildPlayableBulldozer(scene, 0, _terrainMesh);

  // Read saved 3D position
  const savedPos = _readBulldozerPosFromSave();
  if (savedPos) {
    _bulldozer.setPosition(savedPos.wx, savedPos.wz);
    _bulldozer.setHeading(savedPos.wAngle);
  }

  // Provide terrain height function so bulldozer follows heightmap
  _bulldozer.setTerrainHeightFn(_getExtTerrainHeight);

  return _bulldozer;
}
