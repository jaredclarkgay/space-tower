'use strict';
import * as THREE from 'three';

/**
 * Constellation discovery system for the title screen.
 * Click stars to select them; matching a constellation pattern
 * draws permanent lines and lights a tower floor.
 */

const CONST_DEFS = [
  { name: 'The Crane', stars: [], color: 0xb4c8ff },
  { name: 'The Elevator', stars: [], color: 0xffc88c },
  { name: 'The Departure', stars: [], color: 0x8cffc8 },
  { name: 'The Window', stars: [], color: 0xc88cff },
  { name: 'The Foundation', stars: [], color: 0xffb4b4 }
];

const CS = { sel: [], completed: [], permLines: [], total: 0, selLines: [] };

let _renderer, _camera, _starPoints, _scene, _starData, _TC, _getDragState;
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 12;
const mouse = new THREE.Vector2();

// Seeded RNG (same sequence as reference)
let seed = 5555;
function sr() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

export function initConstellation(renderer, camera, starMeshes, scene, cityData, getDragState) {
  _renderer = renderer;
  _camera = camera;
  _starPoints = starMeshes;
  _scene = scene;
  _starData = cityData.starData;
  _TC = cityData.TC;
  _getDragState = getDragState;

  if (!_starPoints || !_starData) return;

  // Assign stars to constellations
  seed = 5555;
  const used = new Set();
  for (const cd of CONST_DEFS) {
    let att = 0;
    while (att++ < 200) {
      const ai = Math.floor(sr() * _starData.length);
      if (used.has(ai) || _starData[ai].y < 200) continue;
      const sa = _starData[ai];
      const nearby = [];
      for (let i = 0; i < _starData.length; i++) {
        if (i === ai || used.has(i)) continue;
        const s = _starData[i];
        const dx = s.x - sa.x, dy = s.y - sa.y, dz = s.z - sa.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 80 && d > 15) nearby.push({ idx: i, dist: d });
      }
      if (nearby.length >= 3) {
        nearby.sort((a, b) => a.dist - b.dist);
        const chosen = [ai, ...nearby.slice(0, 3 + Math.floor(sr() * 2)).map(x => x.idx)];
        cd.stars = chosen;
        chosen.forEach(si => {
          used.add(si);
          _starData[si].baseAlpha = Math.max(_starData[si].baseAlpha, 0.6);
          _starData[si].scale = Math.max(_starData[si].scale, 2.5);
          const sa2 = _starPoints.geometry.getAttribute('scale');
          const aa = _starPoints.geometry.getAttribute('alpha');
          sa2.array[si] = _starData[si].scale;
          aa.array[si] = _starData[si].baseAlpha;
        });
        _starPoints.geometry.getAttribute('scale').needsUpdate = true;
        _starPoints.geometry.getAttribute('alpha').needsUpdate = true;
        break;
      }
    }
  }
}

export function handleStarClick(cx, cy) {
  if (!_starPoints || !_starData) return;
  mouse.x = (cx / innerWidth) * 2 - 1;
  mouse.y = -(cy / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, _camera);
  const hits = raycaster.intersectObject(_starPoints);
  if (hits.length > 0) {
    const si = hits[0].index;
    const star = _starData[si];
    if (star.selected) {
      star.selected = false;
      CS.sel = CS.sel.filter(i => i !== si);
    } else {
      star.selected = true;
      CS.sel.push(si);
      _checkConstellations();
    }
    _rebuildSelLines();
  } else if (CS.sel.length) {
    CS.sel.forEach(i => { _starData[i].selected = false; });
    CS.sel = [];
    _rebuildSelLines();
  }
}

export function updateConstellationLines() {
  for (const cl of CS.permLines) {
    cl.mesh.material.opacity += (cl.target - cl.mesh.material.opacity) * 0.03;
  }
}

function _rebuildSelLines() {
  CS.selLines.forEach(m => { _scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  CS.selLines = [];
  for (let i = 0; i < CS.sel.length - 1; i++) {
    const s1 = _starData[CS.sel[i]], s2 = _starData[CS.sel[i + 1]];
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(s1.x, s1.y, s1.z),
      new THREE.Vector3(s2.x, s2.y, s2.z)
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe0e8ff, transparent: true, opacity: 0.7 }));
    _scene.add(line); CS.selLines.push(line);
  }
}

function _checkConstellations() {
  const selSet = new Set(CS.sel);
  for (const cd of CONST_DEFS) {
    if (CS.completed.includes(cd.name) || !cd.stars.length) continue;
    if (cd.stars.every(s => selSet.has(s))) {
      CS.completed.push(cd.name); CS.total++;
      // Draw permanent lines
      for (let i = 0; i < cd.stars.length; i++) {
        const s1 = _starData[cd.stars[i]], s2 = _starData[cd.stars[(i + 1) % cd.stars.length]];
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(s1.x, s1.y, s1.z),
          new THREE.Vector3(s2.x, s2.y, s2.z)
        ]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: cd.color, transparent: true, opacity: 0 }));
        _scene.add(line); CS.permLines.push({ mesh: line, target: 0.45 });
      }
      // Light a tower floor
      if (_TC) {
        for (let fi = _TC.maxFloors - 1; fi >= 0; fi--) {
          if (!_TC.litFloors[fi]) { _TC.litFloors[fi] = true; break; }
        }
      }
      // Clear selection
      CS.sel.forEach(i => { _starData[i].selected = false; });
      CS.sel = [];
      _rebuildSelLines();
      // Update counter
      const el = document.getElementById('constellations');
      if (el) { el.textContent = `\u2726 ${CS.total} / ${CONST_DEFS.length}`; el.classList.add('visible'); }
      break;
    }
  }
}

export function disposeConstellation() {
  CS.selLines.forEach(m => { _scene?.remove(m); m.geometry?.dispose(); m.material?.dispose(); });
  CS.permLines.forEach(cl => { _scene?.remove(cl.mesh); cl.mesh.geometry?.dispose(); cl.mesh.material?.dispose(); });
  CS.selLines = []; CS.permLines = []; CS.sel = []; CS.completed = []; CS.total = 0;
  _renderer = _camera = _starPoints = _scene = _starData = _TC = null;
}
