'use strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Suit Guides — ~10 permanent suit NPCs on the exterior.
 * They're the welcoming committee: they hired the builder, brought the seesaw,
 * and comment on progress via speech bubbles.
 * Suits always say "the work" / "our work." Never "building" or "construction."
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

// ── Dialogue pools ──
const ARRIVAL_LINES = [
  // Distributed across 10 suits (each gets ~3 from pool + cheer/miss lines)
  'There you are. We\'ve been waiting.',
  'The seesaw\'s here — just like you spec\'d it.',
  'The work crew\'s already on the roof.',
  'The board fast-tracked the budget. Don\'t ask how.',
  'Everything\'s approved. Just need you to start the work.',
  'We\'ve got steel, concrete, and... is that coffee?',
  'Management wants a status report. I told them "day one."',
  'The permits came through this morning. All of them.',
  'Seventeen signatures. That\'s what it took to get you here.',
  'Glad you could make it. The work doesn\'t start itself.',
  'We brought everything you asked for.',
  'The crane\'s already up. Your crew handles the rest.',
  'First floor by end of day? That\'s what I told the board.',
  'Don\'t worry about the paperwork. That\'s our work.',
  'You build it, we\'ll organize it. That\'s the arrangement.',
];

const BUILDING_LINES = [
  'Two floors already. The work is on schedule.',
  'Lobby\'s taking shape up there.',
  'At this rate we\'ll be orbital by Tuesday.',
  'The crane\'s yours too, if you want it.',
  'Have you seen inside yet?',
  'The lobby\'s ready for inspection.',
  'People are starting to move in.',
  'You should see what they did with your quarters.',
  'That\'s why we hired you.',
  'The work expands. As expected.',
];

const POST_RECKONING_LINES = [
  'Almost done, aren\'t you.',
  'The upper floors are... different now.',
  'Quiet up there.',
  'Good work.',
  'The work continues.',
];

const CHEER_LINES = ['YES!', 'Direct hit!', 'That\'s why we hired you!', 'Beautiful.', 'One more for the tower.'];
const MISS_LINES = ['Close one.', 'Wind, probably.', 'Next one.'];

const FLOOR1_LINES = [
  'FLOOR ONE! That\'s the hardest one.',
  'Nine more floors on this segment.',
  'So it begins. We\'re taking this thing to the stars.',
  'The board is going to love this.',
  'First floor is in. Keep going.',
  'You actually did it. I owe Kapoor twenty bucks.',
  'That\'s a foundation. Everything else builds on this.',
  'The work has officially begun.',
  'One down. The sky\'s not the limit anymore.',
  'I\'m calling the board. They need to see this.',
];

// ── Suit data (10 named guides) ──
const SUIT_COLORS = [
  0x0a0a12, 0x0e0e18, 0x0c0c14, 0x101018, 0x0d0d16,
  0x090910, 0x0f0f17, 0x0b0b13, 0x111119, 0x0a0a14,
];

const SUIT_NAMES = [
  'Hargrove', 'Chen', 'Ostrowski', 'Bellamy', 'Kapoor',
  'Whitfield', 'Tanaka', 'Dumont', 'Reeves', 'Farouk',
];

// ── Speech bubble canvas ──
const BUBBLE_W = 256, BUBBLE_H = 80;
const _bubbleCanvas = document.createElement('canvas');
_bubbleCanvas.width = BUBBLE_W; _bubbleCanvas.height = BUBBLE_H;
const _bubbleCtx = _bubbleCanvas.getContext('2d');

function _renderBubbleTexture(text) {
  const c = document.createElement('canvas');
  c.width = BUBBLE_W; c.height = BUBBLE_H;
  const ctx = c.getContext('2d');
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  _roundRect(ctx, 4, 4, BUBBLE_W - 8, BUBBLE_H - 16, 8);
  ctx.fill();
  // Triangle pointer
  ctx.beginPath();
  ctx.moveTo(BUBBLE_W / 2 - 6, BUBBLE_H - 12);
  ctx.lineTo(BUBBLE_W / 2, BUBBLE_H - 2);
  ctx.lineTo(BUBBLE_W / 2 + 6, BUBBLE_H - 12);
  ctx.fill();
  // Text (word wrap)
  ctx.fillStyle = '#fff';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Simple word wrap
  const words = text.split(' ');
  let lines = [], cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > BUBBLE_W - 24) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  const lineH = 16;
  const startY = (BUBBLE_H - 12) / 2 - (lines.length - 1) * lineH / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], BUBBLE_W / 2, startY + i * lineH);
  }
  return c;
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Build suit mesh (vertex-colored group with animated limbs) ──
function _buildSuitMesh(suitColor) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });

  // Static parts: torso, head, hardhat, briefcase, shoes
  const staticParts = [
    [new THREE.BoxGeometry(0.22, 0.28, 0.14), suitColor, 0, 0.50, 0],       // torso
    [new THREE.BoxGeometry(0.14, 0.14, 0.14), 0xd4a574, 0, 0.75, 0],        // head
    [new THREE.BoxGeometry(0.22, 0.04, 0.22), 0xFFD700, 0, 0.86, 0],        // hardhat brim
    [new THREE.BoxGeometry(0.16, 0.08, 0.16), 0xFFD700, 0, 0.90, 0],        // hardhat dome
    [new THREE.BoxGeometry(0.18, 0.12, 0.04), 0x3a2a1a, 0.18, 0.30, 0],     // briefcase
    [new THREE.BoxGeometry(0.09, 0.06, 0.12), 0x1a1a1a, -0.06, 0.03, 0.01], // left shoe
    [new THREE.BoxGeometry(0.09, 0.06, 0.12), 0x1a1a1a, 0.06, 0.03, 0.01],  // right shoe
    // Eyes
    [new THREE.BoxGeometry(0.03, 0.025, 0.01), 0x000000, -0.04, 0.77, 0.07],
    [new THREE.BoxGeometry(0.03, 0.025, 0.01), 0x000000, 0.04, 0.77, 0.07],
  ];
  const sGeos = staticParts.map(([geo, col, x, y, z]) => {
    _colorGeo(geo, col); geo.translate(x, y, z); return geo;
  });
  const staticMesh = new THREE.Mesh(mergeGeometries(sGeos, false), mat);
  group.add(staticMesh);
  sGeos.forEach(g => g.dispose());

  // Animated limbs (separate meshes for arm/leg swing)
  function _limb(color, w, h, d) {
    const geo = _colorGeo(new THREE.BoxGeometry(w, h, d), color);
    return new THREE.Mesh(geo, mat);
  }

  const leftArm = _limb(suitColor, 0.07, 0.22, 0.07);
  leftArm.position.set(-0.15, 0.46, 0);
  group.add(leftArm);
  const rightArm = _limb(suitColor, 0.07, 0.22, 0.07);
  rightArm.position.set(0.15, 0.46, 0);
  group.add(rightArm);
  const leftLeg = _limb(suitColor, 0.08, 0.20, 0.09);
  leftLeg.position.set(-0.06, 0.20, 0);
  group.add(leftLeg);
  const rightLeg = _limb(suitColor, 0.08, 0.20, 0.09);
  rightLeg.position.set(0.06, 0.20, 0);
  group.add(rightLeg);

  group.userData = { leftArm, rightArm, leftLeg, rightLeg };
  return group;
}

// ══════════════════════════════════════
// PUBLIC: buildSuitGuides
// ══════════════════════════════════════
export function buildSuitGuides(scene, seesawX, seesawZ) {
  const suits = [];
  const vcMat = new THREE.MeshBasicMaterial({ vertexColors: true });

  // Semi-circle near seesaw, facing roughly toward tower
  const cx = seesawX, cz = seesawZ;
  const radius = 14;
  const arcStart = -Math.PI * 0.4;
  const arcEnd = Math.PI * 0.4;

  for (let i = 0; i < 10; i++) {
    const angle = arcStart + (arcEnd - arcStart) * (i / 9);
    const hx = cx + Math.cos(angle) * (radius + (i % 2) * 3);
    const hz = cz + Math.sin(angle) * (radius + (i % 2) * 3);

    const group = _buildSuitMesh(SUIT_COLORS[i]);
    group.position.set(hx, 0, hz);
    // Face toward tower (roughly -z direction from seesaw area)
    group.rotation.y = Math.atan2(0 - hx, 0 - hz);
    scene.add(group);

    // Speech bubble sprite
    const bubbleMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(_renderBubbleTexture('')),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const bubble = new THREE.Sprite(bubbleMat);
    bubble.scale.set(4, 1.5, 1);
    bubble.position.set(0, 1.4, 0);
    bubble.visible = false;
    group.add(bubble);

    // Distribute dialogue lines
    const lineStart = Math.floor(i / 10 * ARRIVAL_LINES.length);
    const arrivalPool = [
      ARRIVAL_LINES[(lineStart) % ARRIVAL_LINES.length],
      ARRIVAL_LINES[(lineStart + 5) % ARRIVAL_LINES.length],
      ARRIVAL_LINES[(lineStart + 10) % ARRIVAL_LINES.length],
    ];
    const buildPool = [
      BUILDING_LINES[(i) % BUILDING_LINES.length],
      BUILDING_LINES[(i + 5) % BUILDING_LINES.length],
    ];

    suits.push({
      group,
      bubble,
      bubbleMat,
      name: SUIT_NAMES[i],
      homeX: hx, homeZ: hz,
      walkCycle: Math.random() * 6,
      wanderTimer: 3 + Math.random() * 5,
      wanderVx: 0, wanderVz: 0,
      bubbleTimer: 0,
      bubbleFade: 0,
      cheerTimer: 0,
      scatterVx: 0, scatterVz: 0, scatterTimer: 0,
      drifting: false,
      dialogue: { arrival: arrivalPool, building: buildPool, postReckoning: POST_RECKONING_LINES },
      ci: 0,
    });
  }

  // ── Bubble management ──
  let _visibleBubbles = 0;
  const MAX_BUBBLES = 3;
  let _ambientTimer = 3 + Math.random() * 5; // time until next ambient bubble
  let _prevScaffPhase = 'idle';
  let _tutorialShown = false; // first approach to seesaw triggers a hint

  // Read reckoning state from save
  let _reckoningDone = false;
  try {
    const raw = localStorage.getItem('spacetower_v15');
    if (raw) { const d = JSON.parse(raw); _reckoningDone = !!d.reckoning?.played; }
  } catch {}

  function _showBubble(suit, text, duration) {
    if (_visibleBubbles >= MAX_BUBBLES && suit.bubbleTimer <= 0) return;
    const canvas = _renderBubbleTexture(text);
    suit.bubbleMat.map.image = canvas;
    suit.bubbleMat.map.needsUpdate = true;
    suit.bubbleMat.opacity = 1;
    suit.bubble.visible = true;
    suit.bubbleTimer = duration || 5;
    suit.bubbleFade = 0;
  }

  function _hideBubble(suit) {
    suit.bubble.visible = false;
    suit.bubbleMat.opacity = 0;
    suit.bubbleTimer = 0;
    suit.bubbleFade = 0;
  }

  function _getPhasePool(suit, floorsBuilt) {
    if (_reckoningDone) return suit.dialogue.postReckoning;
    if (floorsBuilt >= 1) return suit.dialogue.building;
    return suit.dialogue.arrival;
  }

  // ── Update ──
  function update(dt, playerPos, scaffolding, bulldozer, floorsBuilt) {
    // Count visible bubbles
    _visibleBubbles = suits.filter(s => s.bubbleTimer > 0).length;

    // ── Scaffolding reaction (cheering / consoling) ──
    const scaffPhase = scaffolding?.phase || 'idle';
    if (scaffPhase !== _prevScaffPhase) {
      if (scaffPhase === 'birdseye') {
        // Hit — 3-4 suits cheer
        const cheerCount = 3 + (Math.random() > 0.5 ? 1 : 0);
        const shuffled = suits.slice().sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(cheerCount, shuffled.length); i++) {
          const s = shuffled[i];
          s.cheerTimer = 2.5;
          _showBubble(s, CHEER_LINES[Math.floor(Math.random() * CHEER_LINES.length)], 3);
        }
      } else if (scaffPhase === 'miss_reset') {
        // Miss — 1-2 suits console
        const count = 1 + (Math.random() > 0.5 ? 1 : 0);
        const shuffled = suits.slice().sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(count, shuffled.length); i++) {
          _showBubble(shuffled[i], MISS_LINES[Math.floor(Math.random() * MISS_LINES.length)], 3);
        }
      }
      _prevScaffPhase = scaffPhase;
    }

    // ── Drift toward door (after 3+ floors) ──
    if (floorsBuilt >= 3) {
      let drifters = 0;
      for (const s of suits) {
        if (s.drifting) { drifters++; continue; }
        if (drifters < 3) {
          s.drifting = true;
          drifters++;
        }
      }
    }

    // ── Ambient speech bubbles ──
    _ambientTimer -= dt;
    if (_ambientTimer <= 0 && _visibleBubbles < MAX_BUBBLES) {
      _ambientTimer = 4 + Math.random() * 6;
      // Pick a random suit without an active bubble
      const candidates = suits.filter(s => s.bubbleTimer <= 0);
      if (candidates.length) {
        const s = candidates[Math.floor(Math.random() * candidates.length)];
        const pool = _getPhasePool(s, floorsBuilt);
        _showBubble(s, pool[Math.floor(Math.random() * pool.length)], 4 + Math.random() * 2);
      }
    }

    // ── First approach tutorial: suit near seesaw explains the mechanic ──
    if (!_tutorialShown && playerPos && floorsBuilt < 1) {
      const dx = playerPos.x - cx, dz = playerPos.z - cz;
      if (dx * dx + dz * dz < 400) { // within 20 units of seesaw
        _tutorialShown = true;
        const nearest = suits.reduce((a, b) => {
          const da = (a.group.position.x - playerPos.x) ** 2 + (a.group.position.z - playerPos.z) ** 2;
          const db = (b.group.position.x - playerPos.x) ** 2 + (b.group.position.z - playerPos.z) ** 2;
          return da < db ? a : b;
        });
        _showBubble(nearest, 'Just jump on the other end. We\'ll handle the rest.', 6);
      }
    }

    // ── Per-suit update ──
    for (const s of suits) {
      const g = s.group;
      const ud = g.userData;

      // ── Bulldozer scatter ──
      if (bulldozer?.isOperating && s.scatterTimer <= 0) {
        const bPos = bulldozer.getWorldPos ? bulldozer.getWorldPos() : null;
        if (bPos) {
          const dx = g.position.x - bPos.x, dz = g.position.z - bPos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < 225) { // within 15 units
            const dist = Math.sqrt(distSq) || 1;
            s.scatterVx = (dx / dist) * 0.15;
            s.scatterVz = (dz / dist) * 0.15;
            s.scatterTimer = 3;
          }
        }
      }

      // ── Scatter movement ──
      if (s.scatterTimer > 0) {
        s.scatterTimer -= dt;
        g.position.x += s.scatterVx;
        g.position.z += s.scatterVz;
        s.scatterVx *= 0.96;
        s.scatterVz *= 0.96;
        if (s.scatterTimer <= 0) {
          // Return home
          s.scatterVx = 0; s.scatterVz = 0;
        }
      }
      // ── Return to home after scatter ──
      else if (s.scatterTimer <= 0 && s.scatterTimer > -1) {
        // already handled
      }

      // ── Drift toward door ──
      if (s.drifting && s.scatterTimer <= 0) {
        const doorX = 0, doorZ = 40; // near tower entrance
        const dx = doorX - g.position.x, dz = doorZ - g.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 3) {
          const spd = 0.02;
          g.position.x += (dx / dist) * spd;
          g.position.z += (dz / dist) * spd;
          s.walkCycle += dt * 4;
          // Face walk direction
          g.rotation.y = Math.atan2(dx, dz);
        }
      }
      // ── Wander near home ──
      else if (s.scatterTimer <= 0 && !s.drifting) {
        s.wanderTimer -= dt;
        if (s.wanderTimer <= 0) {
          s.wanderTimer = 3 + Math.random() * 5;
          if (Math.random() < 0.4) {
            s.wanderVx = 0; s.wanderVz = 0;
          } else {
            const a = Math.random() * Math.PI * 2;
            s.wanderVx = Math.cos(a) * 0.015;
            s.wanderVz = Math.sin(a) * 0.015;
          }
        }
        g.position.x += s.wanderVx;
        g.position.z += s.wanderVz;
        // Leash to home position
        const dhx = g.position.x - s.homeX, dhz = g.position.z - s.homeZ;
        if (dhx * dhx + dhz * dhz > 36) {
          g.position.x = s.homeX + dhx * 0.95;
          g.position.z = s.homeZ + dhz * 0.95;
          s.wanderVx *= -1; s.wanderVz *= -1;
        }
        if (s.wanderVx !== 0 || s.wanderVz !== 0) {
          s.walkCycle += dt * 3;
          g.rotation.y = Math.atan2(s.wanderVx, s.wanderVz);
        }
      }

      // ── Face player when close ──
      if (playerPos) {
        const dx = playerPos.x - g.position.x, dz = playerPos.z - g.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 64 && s.wanderVx === 0 && s.wanderVz === 0 && !s.drifting) {
          const targetY = Math.atan2(dx, dz);
          let delta = targetY - g.rotation.y;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          g.rotation.y += delta * 0.05;
        }
      }

      // ── Animate limbs ──
      const walk = Math.sin(s.walkCycle);
      const swing = (s.wanderVx !== 0 || s.wanderVz !== 0 || s.drifting) ? walk * 0.3 : 0;
      ud.leftArm.rotation.x = swing;
      ud.rightArm.rotation.x = -swing;
      ud.leftLeg.rotation.x = -swing * 0.6;
      ud.rightLeg.rotation.x = swing * 0.6;

      // ── Cheer animation ──
      if (s.cheerTimer > 0) {
        s.cheerTimer -= dt;
        ud.leftArm.rotation.x = -2.5;  // arms up
        ud.rightArm.rotation.x = -2.5;
        g.position.y = Math.abs(Math.sin(s.cheerTimer * 8)) * 0.15; // hop
      } else {
        if (g.position.y > 0.01) g.position.y *= 0.9;
        else g.position.y = 0;
      }

      // ── Bubble timer ──
      if (s.bubbleTimer > 0) {
        s.bubbleTimer -= dt;
        // Fade out in last 0.5s
        if (s.bubbleTimer <= 0.5) {
          s.bubbleMat.opacity = Math.max(0, s.bubbleTimer / 0.5);
        }
        if (s.bubbleTimer <= 0) _hideBubble(s);
      }
    }
  }

  // ── Get nearby suit for E interaction ──
  function getNearby(playerPos) {
    for (const s of suits) {
      const dx = playerPos.x - s.group.position.x;
      const dz = playerPos.z - s.group.position.z;
      if (dx * dx + dz * dz < 16 && playerPos.y < 1.5) return s;
    }
    return null;
  }

  // ── Get dialogue line for E interaction ──
  function getDialogueLine(suit, floorsBuilt) {
    const pool = _getPhasePool(suit, floorsBuilt);
    const line = pool[suit.ci % pool.length];
    suit.ci = (suit.ci + 1) % pool.length;
    return line;
  }

  // ── Dispose ──
  function dispose() {
    for (const s of suits) {
      scene.remove(s.group);
      s.group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    }
  }

  // Floor 1 celebration — all suits cheer with staggered speech bubbles
  function celebrate() {
    const shuffled = suits.slice().sort(() => Math.random() - 0.5);
    const lines = FLOOR1_LINES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      const s = shuffled[i];
      const line = lines[i % lines.length];
      const delay = i * 0.6; // stagger bubbles
      s.cheerTimer = 4;
      setTimeout(() => {
        _showBubble(s, line, 5 + Math.random() * 2);
      }, delay * 1000);
    }
  }

  return { suits, update, getNearby, getDialogueLine, celebrate, dispose };
}
