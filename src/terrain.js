'use strict';
import { T3D_SEGS, T3D_SIZE, T3D_DEFORM_R, T3D_DEFORM_STR, T3D_BERM_STR, T3D_EXCLUSION_R } from './constants.js';

const _EXCLUSION_R2 = T3D_EXCLUSION_R * T3D_EXCLUSION_R;

// ═══ ROAD GEOMETRY (matches title-city.js) ═══
// Inner ring road around tower: r=117.5 to r=167.5
const ROAD_INNER_R2 = 117.5 * 117.5;  // squared for fast check
const ROAD_OUTER_R2 = 167.5 * 167.5;
const ROAD_SPOKE_W = 17.5;            // half-width of spokes (50*0.7/2)
// 4 spoke direction vectors (unit) at 45°, 135°, 225°, 315°
const INV_SQRT2 = 1 / Math.sqrt(2);
const SPOKE_DIRS = [
  { dx: INV_SQRT2, dz: INV_SQRT2 },   // 45°
  { dx: -INV_SQRT2, dz: INV_SQRT2 },  // 135°
  { dx: -INV_SQRT2, dz: -INV_SQRT2 }, // 225°
  { dx: INV_SQRT2, dz: -INV_SQRT2 },  // 315°
];

/** Returns true if world-position (wx, wz) is on a road. No trig — uses squared distances and cross products. */
export function isOnRoad(wx, wz) {
  const d2 = wx * wx + wz * wz;
  // Inner ring road (squared distance check)
  if (d2 >= ROAD_INNER_R2 && d2 <= ROAD_OUTER_R2) return true;
  // Spokes (from outer ring edge outward) — cross product gives perpendicular distance
  if (d2 > ROAD_OUTER_R2) {
    for (let i = 0; i < 4; i++) {
      const s = SPOKE_DIRS[i];
      // Cross product |wx * dz - wz * dx| = perpendicular distance to spoke line
      const cross = Math.abs(wx * s.dz - wz * s.dx);
      if (cross < ROAD_SPOKE_W) {
        // Check we're on the correct side (dot product > 0 means same direction as spoke)
        if (wx * s.dx + wz * s.dz > 0) return true;
      }
    }
  }
  return false;
}

// ═══ HEIGHTMAP INITIALIZATION ═══
// Starts flat — terrain only changes from bulldozer deformation in the topo view.
export function initTerrain(terrain3d) {
  terrain3d.heightmap.fill(0);
  terrain3d.cutHeat.fill(0);
  terrain3d.raiseHeat.fill(0);
  terrain3d.dirty = true;
  terrain3d.initialized = true;
}

// ═══ HEIGHTMAP QUERY ═══
// Bilinear interpolation of 4 nearest vertices. Returns world-space Y.
// Portable version: works with any Float32Array heightmap.
export function sampleHeightmap(hm, stride, wx, wz, worldSize, segsPerAxis) {
  const gx = (wx / worldSize + 0.5) * segsPerAxis;
  const gz = (wz / worldSize + 0.5) * segsPerAxis;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  if (ix < 0 || ix >= segsPerAxis || iz < 0 || iz >= segsPerAxis) return 0;
  const fx = gx - ix;
  const fz = gz - iz;
  const h00 = hm[iz * stride + ix] || 0;
  const h10 = hm[iz * stride + ix + 1] || 0;
  const h01 = hm[(iz + 1) * stride + ix] || 0;
  const h11 = hm[(iz + 1) * stride + ix + 1] || 0;
  return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
}

// Convenience wrapper for game state terrain3d object.
export function getTerrainHeight(terrain3d, wx, wz) {
  return sampleHeightmap(terrain3d.heightmap, T3D_SEGS + 1, wx, wz, T3D_SIZE, T3D_SEGS);
}

// ═══ WORLD ↔ GRID HELPERS ═══
function _worldToGrid(wx, wz) {
  return {
    gx: (wx / T3D_SIZE + 0.5) * T3D_SEGS,
    gz: (wz / T3D_SIZE + 0.5) * T3D_SEGS,
  };
}

// ═══ TERRAIN DEFORMATION ═══
// Called by control room topo mode. Modifies heightmap + heat channels.
// mode: -1 (cut) or 1 (raise). Returns true if vertices changed.
export function deformTerrain(terrain3d, wx, wz, angle, mode, speed, dt) {
  const segs = T3D_SEGS + 1;
  const hm = terrain3d.heightmap;
  const cutH = terrain3d.cutHeat;
  const raiseH = terrain3d.raiseHeat;
  const { gx: cgx, gz: cgz } = _worldToGrid(wx, wz);
  const radiusInGrid = T3D_DEFORM_R / T3D_SIZE * T3D_SEGS;

  const minX = Math.max(0, Math.floor(cgx - radiusInGrid));
  const maxX = Math.min(segs - 1, Math.ceil(cgx + radiusInGrid));
  const minZ = Math.max(0, Math.floor(cgz - radiusInGrid));
  const maxZ = Math.min(segs - 1, Math.ceil(cgz + radiusInGrid));

  const fwd = { x: Math.sin(angle), z: Math.cos(angle) };
  const strength = T3D_DEFORM_STR * Math.abs(speed) * dt * 10;
  const bermRatio = T3D_BERM_STR / T3D_DEFORM_STR * 0.5; // precompute constant

  let changed = false;

  for (let iz = minZ; iz <= maxZ; iz++) {
    for (let ix = minX; ix <= maxX; ix++) {
      const idx = iz * segs + ix;

      // World position of vertex
      const vx = (ix / T3D_SEGS - 0.5) * T3D_SIZE;
      const vz = (iz / T3D_SEGS - 0.5) * T3D_SIZE;

      // Skip vertices inside tower exclusion zone
      if (vx * vx + vz * vz < _EXCLUSION_R2) continue;

      // Skip vertices on roads
      if (isOnRoad(vx, vz)) continue;

      const dx = vx - wx;
      const dz = vz - wz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > T3D_DEFORM_R) continue;

      // Cosine falloff — wide, rounded/scooped shape
      const t = dist / T3D_DEFORM_R;
      const smooth = 0.5 * (1 + Math.cos(Math.PI * t));

      if (mode === -1) {
        // CUT: lower terrain under blade, berm on sides
        const cutAmount = smooth * strength;
        hm[idx] -= cutAmount;

        // Side berms
        const cross = dx * fwd.z - dz * fwd.x;
        const bermFactor = Math.abs(cross) / T3D_DEFORM_R;
        if (bermFactor > 0.3 && bermFactor < 0.9) {
          hm[idx] += cutAmount * bermRatio * smooth;
        }

        cutH[idx] = Math.min(1, cutH[idx] + smooth * 0.5);
        raiseH[idx] *= 0.9;
      } else if (mode === 1) {
        // RAISE: push terrain up
        const raiseAmount = smooth * strength * 0.8;
        hm[idx] += raiseAmount;

        raiseH[idx] = Math.min(1, raiseH[idx] + smooth * 0.5);
        cutH[idx] *= 0.9;
      }

      changed = true;
    }
  }

  if (changed) terrain3d.dirty = true;
  return changed;
}

// ═══ HEAT DECAY ═══
// Call each frame to cool down heat channels.
export function decayHeat(terrain3d, dt) {
  const cutH = terrain3d.cutHeat;
  const raiseH = terrain3d.raiseHeat;
  const rate = dt * 0.12;
  for (let i = 0, len = cutH.length; i < len; i++) {
    if (cutH[i] > 0) cutH[i] = Math.max(0, cutH[i] - rate);
    if (raiseH[i] > 0) raiseH[i] = Math.max(0, raiseH[i] - rate);
  }
}

