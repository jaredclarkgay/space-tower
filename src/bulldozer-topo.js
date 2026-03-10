'use strict';
import * as THREE from 'three';
import { T3D_SEGS, T3D_SIZE, T3D_CONTOUR, T3D_EXCLUSION_R } from './constants.js';
import { getTerrainHeight, deformTerrain, decayHeat, isOnRoad } from './terrain.js';

/**
 * Bulldozer topo view — CRT-styled contour map for the control room full-screen.
 * Self-contained Three.js scene rendered to an overlay canvas.
 *
 * Usage:
 *   const topo = initTopoView(canvas);
 *   topo.enter(terrain3d, bulldozerState);
 *   // each frame while active:
 *   topo.update(dt);
 *   // when leaving:
 *   const pos = topo.exit(); // { wx, wz, wAngle }
 *   topo.dispose();
 */

// ═══ PHYSICS CONSTANTS (control room mode — heavy equipment feel) ═══
const MAX_SPEED = 40;
const ACCEL = 50;
const FRICTION = 25;
const TURN_ACCEL = 4;
const TURN_FRICTION = 5;
const MAX_TURN = 2.5;
const GRAVITY = 30;
const BOUNCE = 0.3;

// ═══ SHADERS ═══
const TERRAIN_VERT = `
  varying float vHeight;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  attribute float cutHeat;
  attribute float raiseHeat;
  varying float vCutHeat;
  varying float vRaiseHeat;
  void main() {
    vHeight = position.y;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalMatrix * normal;
    vCutHeat = cutHeat;
    vRaiseHeat = raiseHeat;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TERRAIN_FRAG = `
  uniform float uContourInterval;
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uLineColor;
  uniform vec3 uCutColor;
  uniform vec3 uRaiseColor;
  varying float vHeight;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCutHeat;
  varying float vRaiseHeat;
  void main() {
    float h = vHeight;
    float contour = abs(fract(h / uContourInterval + 0.5) - 0.5);
    float lineWidth = fwidth(h / uContourInterval) * 1.5;
    float line = 1.0 - smoothstep(0.0, lineWidth, contour);
    float majorContour = abs(fract(h / (uContourInterval * 4.0) + 0.5) - 0.5);
    float majorLineWidth = fwidth(h / (uContourInterval * 4.0)) * 2.0;
    float majorLine = 1.0 - smoothstep(0.0, majorLineWidth, majorContour);
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
    float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.5 + 0.5;
    vec3 base = uBaseColor * diffuse;
    float heightGrad = smoothstep(-4.0, 6.0, h);
    base = mix(base, base * 1.3, heightGrad);
    vec3 lineCol = mix(uLineColor * 0.4, uLineColor, majorLine);
    float lineAlpha = max(line * 0.6, majorLine * 1.0);
    float totalHeat = max(vCutHeat, vRaiseHeat);
    vec3 hotCol = uLineColor;
    if (vCutHeat > vRaiseHeat) hotCol = mix(uLineColor, uCutColor, vCutHeat);
    else if (vRaiseHeat > 0.01) hotCol = mix(uLineColor, uRaiseColor, vRaiseHeat);
    lineCol = mix(lineCol, hotCol, totalHeat);
    lineAlpha = max(lineAlpha, totalHeat * 0.5);
    base = mix(base, hotCol * 0.15, totalHeat * 0.4);
    float edgeFade = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)));
    lineAlpha += edgeFade * 0.15;
    // Subtle grid on flat terrain so it doesn't look completely blank
    float gx = abs(fract(vWorldPos.x / 20.0 + 0.5) - 0.5);
    float gz = abs(fract(vWorldPos.z / 20.0 + 0.5) - 0.5);
    float gridLine = 1.0 - smoothstep(0.0, 0.03, min(gx, gz));
    lineAlpha = max(lineAlpha, gridLine * 0.08);
    vec3 color = mix(base, lineCol, lineAlpha);
    float dist = length(vWorldPos - cameraPosition);
    float fog = 1.0 - exp(-dist * 0.006);
    color = mix(color, vec3(0.0), fog * 0.7);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const CRT_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const CRT_FRAG = `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    vec2 cent = uv - 0.5;
    float d = dot(cent, cent);
    uv = 0.5 + cent * (1.0 + d * 0.15);
    float aberr = 0.002 + d * 0.004;
    float r = texture2D(tDiffuse, uv + vec2(aberr, 0.0)).r;
    float g = texture2D(tDiffuse, uv).g;
    float b = texture2D(tDiffuse, uv - vec2(aberr, 0.0)).b;
    vec3 color = vec3(r, g, b);
    float scanline = sin(uv.y * uResolution.y * 1.5) * 0.5 + 0.5;
    scanline = pow(scanline, 0.8);
    color *= 0.85 + 0.15 * scanline;
    float flicker = sin(uTime * 3.0 + uv.y * 200.0) * 0.01;
    color += flicker;
    float vig = 1.0 - d * 1.2;
    color *= vig;
    color += color * 0.15;
    color.g += (1.0 - length(color)) * 0.02;
    color = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ═══ BUILD BULLDOZER MODEL ═══
function _buildDozerModel() {
  const group = new THREE.Group();
  // Bright emissive materials so bulldozer is visible through CRT shader
  const mat = (color, emissive) => new THREE.MeshPhongMaterial({ color, emissive: emissive || color, emissiveIntensity: 0.5, flatShading: true });

  // Body — bright yellow-orange
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.8), mat(0xffaa22, 0xcc8800));
  body.position.y = 0.6;
  group.add(body);

  // Cab
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.2), mat(0xffcc44, 0xddaa22));
  cab.position.set(0, 1.15, -0.4);
  group.add(cab);

  // Blade
  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.25), mat(0xbbbbbb, 0x888888));
  blade.position.set(0, 0.3, 1.65);
  blade.name = 'blade';
  group.add(blade);

  // Blade arms
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), mat(0xbbbbbb, 0x888888));
    arm.position.set(side * 0.7, 0.35, 1.2);
    group.add(arm);
  }

  // Treads
  for (const side of [-1, 1]) {
    const tread = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.0), mat(0x666666, 0x444444));
    tread.position.set(side * 1.05, 0.25, 0);
    group.add(tread);
  }

  // Exhaust
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.6, 6), mat(0x777777, 0x555555));
  exhaust.position.set(0.5, 1.5, -0.6);
  group.add(exhaust);

  // Headlights — glowing bright
  for (const side of [-0.7, 0.7]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshPhongMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 1.0 }));
    light.position.set(side, 0.7, 1.5);
    group.add(light);
  }

  // Stronger point light so dozer illuminates surroundings
  const dozerLight = new THREE.PointLight(0xffcc66, 2.0, 30);
  dozerLight.position.set(0, 3, 0);
  group.add(dozerLight);

  return group;
}

// ═══ EXCLUSION ZONE ═══
const TOWER_HALF = 37.5;
const EXCLUSION_R = T3D_EXCLUSION_R;

// ═══ BUILD TOWER BASE MODEL ═══
function _buildTowerBase() {
  const group = new THREE.Group();
  const hw = TOWER_HALF;

  // Foundation — solid block
  const foundGeo = new THREE.BoxGeometry(hw * 2, 3, hw * 2);
  const foundMat = new THREE.MeshPhongMaterial({ color: 0x334466, emissive: 0x112233, emissiveIntensity: 0.4, transparent: true, opacity: 0.7, flatShading: true });
  const foundation = new THREE.Mesh(foundGeo, foundMat);
  foundation.position.y = 1.5;
  group.add(foundation);

  // Tower outline — wireframe columns at corners
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(2, 30, 2),
        new THREE.MeshPhongMaterial({ color: 0x4466aa, emissive: 0x223355, emissiveIntensity: 0.5, transparent: true, opacity: 0.5 })
      );
      col.position.set(cx * (hw - 1), 15, cz * (hw - 1));
      group.add(col);
    }
  }

  // Exclusion zone ring
  const ringGeo = new THREE.RingGeometry(EXCLUSION_R - 0.5, EXCLUSION_R + 0.5, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x443322, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05;
  group.add(ring);

  // "NO WORK ZONE" label dots along exclusion boundary
  const dashGeo = new THREE.BufferGeometry();
  const dashVerts = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 32) {
    dashVerts.push(Math.cos(a) * EXCLUSION_R, 0.1, Math.sin(a) * EXCLUSION_R);
  }
  dashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dashVerts), 3));
  group.add(new THREE.Points(dashGeo, new THREE.PointsMaterial({ color: 0x886644, size: 2 })));

  return group;
}

// ═══ BUILD ROAD NETWORK ═══
// Matches exterior road layout from title-city.js
function _buildRoads() {
  const group = new THREE.Group();
  const roadMat = new THREE.MeshPhongMaterial({
    color: 0x223344, emissive: 0x112233, emissiveIntensity: 0.3,
    transparent: true, opacity: 0.5, flatShading: true
  });
  const roadW = 50;
  const innerR = 117.5; // TC.width/2 + 80

  // Inner ring road
  const ringGeo = new THREE.RingGeometry(innerR, innerR + roadW, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMesh = new THREE.Mesh(ringGeo, roadMat);
  ringMesh.position.y = 0.08;
  group.add(ringMesh);

  // 4 connecting spokes at 45°, 135°, 225°, 315°
  const spokeStart = innerR + roadW;
  const half = T3D_SIZE / 2;
  const spokeLen = half - spokeStart;
  const spokeW = roadW * 0.7;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const midR = spokeStart + spokeLen / 2;
    const spoke = new THREE.Mesh(new THREE.PlaneGeometry(spokeW, spokeLen), roadMat);
    spoke.rotation.x = -Math.PI / 2;
    spoke.rotation.z = -angle;
    spoke.position.set(Math.cos(angle) * midR, 0.08, Math.sin(angle) * midR);
    group.add(spoke);
  }

  // Road edge lines (dashed points along inner + outer ring edges)
  const edgeGeo = new THREE.BufferGeometry();
  const edgeVerts = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 48) {
    edgeVerts.push(Math.cos(a) * innerR, 0.12, Math.sin(a) * innerR);
    edgeVerts.push(Math.cos(a) * (innerR + roadW), 0.12, Math.sin(a) * (innerR + roadW));
  }
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgeVerts), 3));
  group.add(new THREE.Points(edgeGeo, new THREE.PointsMaterial({ color: 0x556677, size: 0.8 })));

  return group;
}

// ═══ INIT TOPO VIEW ═══
export function initTopoView(canvas) {
  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.005);

  // Camera
  const camera = new THREE.PerspectiveCamera(55, canvas.width / canvas.height, 0.1, 600);
  camera.position.set(0, 60, 80);
  camera.lookAt(0, 0, 0);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Render target for CRT pass
  let renderTarget = new THREE.WebGLRenderTarget(canvas.width, canvas.height);

  // CRT post-processing
  const crtQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: renderTarget.texture },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(canvas.width, canvas.height) },
      },
      vertexShader: CRT_VERT,
      fragmentShader: CRT_FRAG,
    })
  );
  const crtScene = new THREE.Scene();
  const crtCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  crtScene.add(crtQuad);

  // Lighting
  scene.add(new THREE.AmbientLight(0x1a2a4a, 0.6));
  const dirLight = new THREE.DirectionalLight(0x4488cc, 0.4);
  dirLight.position.set(20, 30, 10);
  scene.add(dirLight);

  // Grid
  const grid = new THREE.GridHelper(T3D_SIZE, 40, 0x112244, 0x0a1122);
  grid.position.y = -0.1;
  scene.add(grid);

  // Tower base model + exclusion zone
  const towerBase = _buildTowerBase();
  scene.add(towerBase);

  // Road network
  const roads = _buildRoads();
  scene.add(roads);

  // Bulldozer model
  const dozerModel = _buildDozerModel();
  scene.add(dozerModel);

  // Terrain mesh (built on enter)
  let terrainMesh = null;
  let terrainGeo = null;
  let terrainMat = null;

  // State refs
  let _terrain3d = null;
  let _bdState = null;
  let _active = false;

  // Local physics state
  const _phys = { speed: 0, turnSpeed: 0, vy: 0, grounded: true };

  // Camera orbit + zoom
  let camAngle = 0, camAngleTarget = 0;
  const CAM_PRESETS = [
    { height: 30, dist: 40 },   // close
    { height: 50, dist: 70 },   // default
    { height: 100, dist: 140 }, // far
    { height: 180, dist: 220 }, // overview
  ];
  let camPreset = 1;
  let camHeight = CAM_PRESETS[1].height, camDist = CAM_PRESETS[1].dist;

  // Terrain reset state (local to topo view — completes before player exits)
  let _resetting = false;
  let _resetT = 0;
  let _resetSnapshot = null;

  // Input
  const _keys = {};
  const _preventCodes = new Set(['Space','ShiftLeft','ShiftRight','KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape','KeyC','KeyR']);

  function _onKeyDown(e) {
    if (!_active) return;
    _keys[e.code] = true;
    if (_preventCodes.has(e.code)) e.preventDefault();

    // C = cycle camera zoom
    if (e.code === 'KeyC') {
      camPreset = (camPreset + 1) % CAM_PRESETS.length;
      camHeight = CAM_PRESETS[camPreset].height;
      camDist = CAM_PRESETS[camPreset].dist;
    }

    // R = start terrain reset
    if (e.code === 'KeyR' && !_resetting && _terrain3d) {
      _resetting = true;
      _resetT = 0;
      _resetSnapshot = new Float32Array(_terrain3d.heightmap);
    }
  }
  function _onKeyUp(e) {
    if (!_active) return;
    _keys[e.code] = false;
  }
  function _onResize() {
    if (!_active) return;
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = w; canvas.height = h;
    renderer.setSize(w, h);
    renderTarget.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    crtQuad.material.uniforms.uResolution.value.set(w, h);
  }

  // Boot sequence
  let _firstEntry = true;
  let _bootEl = null;
  let _bootTimer = 0;

  function _showBoot() {
    _bootEl = document.createElement('div');
    _bootEl.style.cssText = 'position:fixed;z-index:30;top:0;left:0;width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:"Courier New",monospace;color:#4af;';
    _bootEl.innerHTML = `
      <div style="font-size:10px;letter-spacing:8px;text-transform:uppercase;opacity:0.5;margin-bottom:20px">INITIALIZING</div>
      <div style="font-size:16px;letter-spacing:12px;text-transform:uppercase;text-shadow:0 0 20px rgba(68,170,255,0.6);animation:bootPulse 0.8s ease-in-out">TERRAIN SURVEY ONLINE</div>
      <style>@keyframes bootPulse{0%{opacity:0;transform:scale(0.95)}50%{opacity:1;transform:scale(1.02)}100%{opacity:1;transform:scale(1)}}</style>
    `;
    document.body.appendChild(_bootEl);
    _bootTimer = 2.0; // seconds
  }

  function _updateBoot(dt) {
    if (!_bootEl) return false;
    _bootTimer -= dt;
    if (_bootTimer <= 0) {
      _bootEl.style.transition = 'opacity 0.5s';
      _bootEl.style.opacity = '0';
      setTimeout(() => { if (_bootEl) { _bootEl.remove(); _bootEl = null; } }, 500);
      return false;
    }
    return true; // still booting
  }

  // HUD elements
  let _hudEl = null;

  function _createHUD() {
    _hudEl = document.createElement('div');
    _hudEl.id = 'topo-hud';
    _hudEl.style.cssText = 'position:fixed;z-index:25;pointer-events:none;font-family:"Courier New",monospace;';
    _hudEl.innerHTML = `
      <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);color:#4af;font-size:11px;letter-spacing:6px;text-transform:uppercase;text-shadow:0 0 12px rgba(68,170,255,0.5);opacity:0.7">TERRAIN SURVEY — SECTOR 01</div>
      <div style="position:fixed;bottom:20px;left:20px;color:#4af;font-size:12px;line-height:1.6;text-shadow:0 0 8px rgba(68,170,255,0.6)">
        <div>ARROWS / WASD — drive</div>
        <div>SPACE — blade down (cut)</div>
        <div>SHIFT — blade up (raise)</div>
        <div>Q/E — camera orbit</div>
        <div>C — camera zoom</div>
        <div>R — reset terrain</div>
        <div style="margin-top:8px;opacity:0.5">ESC — exit</div>
      </div>
      <div id="topo-blade-hud" style="position:fixed;bottom:20px;right:20px;color:#4af;font-size:11px;text-shadow:0 0 8px rgba(68,170,255,0.6);text-align:right;line-height:1.8">
        <div>BLADE: <span id="topo-blade-status">NEUTRAL</span></div>
        <div>ELEV: <span id="topo-elev">0.00</span></div>
      </div>
    `;
    document.body.appendChild(_hudEl);
  }

  function _removeHUD() {
    if (_hudEl) { _hudEl.remove(); _hudEl = null; }
  }

  function _updateHUD(bladeMode, elev) {
    const statusEl = document.getElementById('topo-blade-status');
    const elevEl = document.getElementById('topo-elev');
    if (statusEl) {
      if (_resetting) {
        const pct = Math.min(100, Math.round((_resetT / 30) * 100));
        statusEl.textContent = `RESETTING ${pct}%`;
        statusEl.style.color = '#fa0';
        statusEl.style.textShadow = '0 0 8px rgba(255,170,0,0.6)';
      } else {
        statusEl.textContent = bladeMode === -1 ? 'CUTTING' : bladeMode === 1 ? 'RAISING' : 'NEUTRAL';
        statusEl.style.color = bladeMode === -1 ? '#f64' : bladeMode === 1 ? '#2f8' : '#4af';
        statusEl.style.textShadow = bladeMode === -1 ? '0 0 8px rgba(255,100,68,0.6)' : bladeMode === 1 ? '0 0 8px rgba(34,255,136,0.6)' : '0 0 8px rgba(68,170,255,0.6)';
      }
    }
    if (elevEl) elevEl.textContent = elev.toFixed(2);
  }

  // ── Build terrain mesh from heightmap ──
  function _buildTerrainMesh() {
    if (terrainMesh) { scene.remove(terrainMesh); terrainGeo.dispose(); terrainMat.dispose(); }

    terrainGeo = new THREE.PlaneGeometry(T3D_SIZE, T3D_SIZE, T3D_SEGS, T3D_SEGS);
    terrainGeo.rotateX(-Math.PI / 2);

    const positions = terrainGeo.attributes.position.array;
    const segs = T3D_SEGS + 1;
    const hm = _terrain3d.heightmap;
    const cutH = _terrain3d.cutHeat;
    const raiseH = _terrain3d.raiseHeat;

    // Set vertex heights from heightmap
    for (let i = 0, len = segs * segs; i < len; i++) {
      positions[i * 3 + 1] = hm[i];
    }

    terrainGeo.computeVertexNormals();
    terrainGeo.attributes.position.needsUpdate = true;

    // Heat attributes
    terrainGeo.setAttribute('cutHeat', new THREE.BufferAttribute(new Float32Array(cutH), 1));
    terrainGeo.setAttribute('raiseHeat', new THREE.BufferAttribute(new Float32Array(raiseH), 1));

    terrainMat = new THREE.ShaderMaterial({
      uniforms: {
        uContourInterval: { value: T3D_CONTOUR },
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(0x0a1628) },
        uLineColor: { value: new THREE.Color(0x3388ff) },
        uCutColor: { value: new THREE.Color(0xff2211) },
        uRaiseColor: { value: new THREE.Color(0x22ff66) },
      },
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      side: THREE.DoubleSide,
    });

    terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);
  }

  // ── Update terrain mesh vertices from heightmap (live deformation) ──
  function _syncTerrainMesh(heightsChanged) {
    if (!terrainGeo || !_terrain3d) return;

    // Only recompute positions + normals when heights actually changed
    if (heightsChanged) {
      const positions = terrainGeo.attributes.position.array;
      const hm = _terrain3d.heightmap;
      const segs = T3D_SEGS + 1;
      for (let i = 0, len = segs * segs; i < len; i++) {
        positions[i * 3 + 1] = hm[i];
      }
      terrainGeo.attributes.position.needsUpdate = true;
      terrainGeo.computeVertexNormals();
    }

    // Heat attributes always update (decay happens every frame)
    const cutAttr = terrainGeo.attributes.cutHeat;
    const raiseAttr = terrainGeo.attributes.raiseHeat;
    cutAttr.array.set(_terrain3d.cutHeat);
    raiseAttr.array.set(_terrain3d.raiseHeat);
    cutAttr.needsUpdate = true;
    raiseAttr.needsUpdate = true;
  }

  // ═══ PUBLIC API ═══
  return {
    get active() { return _active; },

    enter(terrain3d, bulldozerState) {
      _terrain3d = terrain3d;
      _bdState = bulldozerState;
      _active = true;

      // Reset local physics
      _phys.speed = 0;
      _phys.turnSpeed = 0;
      _phys.vy = 0;
      _phys.grounded = true;

      // Build terrain mesh
      _buildTerrainMesh();

      // Position bulldozer at shared state
      dozerModel.position.set(_bdState.wx, getTerrainHeight(_terrain3d, _bdState.wx, _bdState.wz) + 0.25, _bdState.wz);
      dozerModel.rotation.y = _bdState.wAngle;

      // Size canvas
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      canvas.style.display = 'block';
      renderer.setSize(w, h);
      renderTarget.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      crtQuad.material.uniforms.uResolution.value.set(w, h);

      // Input + resize
      window.addEventListener('keydown', _onKeyDown);
      window.addEventListener('keyup', _onKeyUp);
      window.addEventListener('resize', _onResize);

      // HUD
      _createHUD();

      // Boot sequence (first entry only)
      if (_firstEntry) {
        _showBoot();
        _firstEntry = false;
      }

      // Reset camera
      camAngle = 0;
      camAngleTarget = 0;
    },

    exit() {
      _active = false;
      canvas.style.display = 'none';

      window.removeEventListener('keydown', _onKeyDown);
      window.removeEventListener('keyup', _onKeyUp);
      window.removeEventListener('resize', _onResize);
      for (const k in _keys) _keys[k] = false;

      _removeHUD();
      if (_bootEl) { _bootEl.remove(); _bootEl = null; }

      // Mark terrain dirty so exterior rebuilds
      if (_terrain3d) _terrain3d.dirty = true;

      return { wx: _bdState.wx, wz: _bdState.wz, wAngle: _bdState.wAngle };
    },

    update(dt) {
      if (!_active || !_terrain3d || !_bdState) return;

      // Boot sequence overlay
      if (_updateBoot(dt)) return; // still showing boot text, skip gameplay

      const ds = _bdState;
      const ph = _phys;

      // Blade mode
      ds.bladeMode = 0;
      if (_keys['Space']) ds.bladeMode = -1;
      if (_keys['ShiftLeft'] || _keys['ShiftRight']) ds.bladeMode = 1;

      // Acceleration
      let accelInput = 0;
      if (_keys['KeyW'] || _keys['ArrowUp']) accelInput = 1;
      if (_keys['KeyS'] || _keys['ArrowDown']) accelInput = -1;

      if (accelInput !== 0) {
        ph.speed += accelInput * ACCEL * dt;
      } else {
        if (Math.abs(ph.speed) < FRICTION * dt) ph.speed = 0;
        else ph.speed -= Math.sign(ph.speed) * FRICTION * dt;
      }
      ph.speed = Math.max(-MAX_SPEED * 0.5, Math.min(MAX_SPEED, ph.speed));
      ds.wSpeed = ph.speed;

      // Turning
      let turnInput = 0;
      if (_keys['KeyA'] || _keys['ArrowLeft']) turnInput = 1;
      if (_keys['KeyD'] || _keys['ArrowRight']) turnInput = -1;

      if (turnInput !== 0 && Math.abs(ph.speed) > 0.5) {
        ph.turnSpeed += turnInput * TURN_ACCEL * dt;
      } else {
        if (Math.abs(ph.turnSpeed) < TURN_FRICTION * dt) ph.turnSpeed = 0;
        else ph.turnSpeed -= Math.sign(ph.turnSpeed) * TURN_FRICTION * dt;
      }
      ph.turnSpeed = Math.max(-MAX_TURN, Math.min(MAX_TURN, ph.turnSpeed));

      // Apply turn (tank-style: scales with speed)
      const speedFactor = Math.min(1, Math.abs(ph.speed) / 4);
      ds.wAngle += ph.turnSpeed * speedFactor * dt;

      // Move
      ds.wx += Math.sin(ds.wAngle) * ph.speed * dt;
      ds.wz += Math.cos(ds.wAngle) * ph.speed * dt;

      // Clamp to terrain bounds
      const bound = T3D_SIZE * 0.45;
      ds.wx = Math.max(-bound, Math.min(bound, ds.wx));
      ds.wz = Math.max(-bound, Math.min(bound, ds.wz));

      // Terrain height + bounce
      const terrainH = getTerrainHeight(_terrain3d, ds.wx, ds.wz);
      const targetY = terrainH + 0.25;

      if (dozerModel.position.y <= targetY) {
        ph.vy = Math.max(ph.vy, 0);
        dozerModel.position.y = targetY;
        ph.grounded = true;

        // Bounce on steep descent
        const sH = getTerrainHeight(_terrain3d, ds.wx + Math.sin(ds.wAngle) * 0.5, ds.wz + Math.cos(ds.wAngle) * 0.5);
        const slopeDiff = terrainH - sH;
        if (Math.abs(ph.speed) > 3 && slopeDiff > 0.3) {
          ph.vy = Math.abs(ph.speed) * 0.15 * BOUNCE;
        }
      } else {
        ph.vy -= GRAVITY * dt;
        ph.grounded = false;
      }

      dozerModel.position.y += ph.vy * dt;
      if (dozerModel.position.y < targetY) {
        dozerModel.position.y = targetY;
        if (ph.vy < -2) ph.vy = Math.abs(ph.vy) * BOUNCE;
        else ph.vy = 0;
      }

      dozerModel.position.x = ds.wx;
      dozerModel.position.z = ds.wz;
      dozerModel.rotation.y = ds.wAngle;

      // Tilt based on terrain slope
      const sD = 1.0;
      const hF = getTerrainHeight(_terrain3d, ds.wx + Math.sin(ds.wAngle) * sD, ds.wz + Math.cos(ds.wAngle) * sD);
      const hB = getTerrainHeight(_terrain3d, ds.wx - Math.sin(ds.wAngle) * sD, ds.wz - Math.cos(ds.wAngle) * sD);
      dozerModel.rotation.x = -Math.atan2(hF - hB, sD * 2) * 0.6;
      const hL = getTerrainHeight(_terrain3d, ds.wx + Math.cos(ds.wAngle) * sD, ds.wz - Math.sin(ds.wAngle) * sD);
      const hR = getTerrainHeight(_terrain3d, ds.wx - Math.cos(ds.wAngle) * sD, ds.wz + Math.sin(ds.wAngle) * sD);
      dozerModel.rotation.z = Math.atan2(hL - hR, sD * 2) * 0.4;

      // Blade animation
      const blade = dozerModel.getObjectByName('blade');
      if (blade) {
        const bladeTarget = ds.bladeMode === -1 ? -0.15 : ds.bladeMode === 1 ? 0.25 : 0.05;
        blade.position.y += (bladeTarget - blade.position.y) * 8 * dt;
      }

      // Deform terrain if blade active, moving, and outside exclusion zone
      if (ds.bladeMode !== 0 && Math.abs(ph.speed) > 0.5 && !_resetting) {
        const bladeWX = ds.wx + Math.sin(ds.wAngle) * 1.65;
        const bladeWZ = ds.wz + Math.cos(ds.wAngle) * 1.65;
        const bladeDist = Math.sqrt(bladeWX * bladeWX + bladeWZ * bladeWZ);
        if (bladeDist > EXCLUSION_R && !isOnRoad(bladeWX, bladeWZ)) {
          deformTerrain(_terrain3d, bladeWX, bladeWZ, ds.wAngle, ds.bladeMode, ph.speed, dt);
        }
      }

      // Terrain reset — lerp heightmap toward zero over 30 seconds
      if (_resetting && _resetSnapshot) {
        _resetT += dt;
        const progress = Math.min(1, _resetT / 30);
        const hm = _terrain3d.heightmap;
        const snap = _resetSnapshot;
        for (let i = 0, len = hm.length; i < len; i++) {
          hm[i] = snap[i] * (1 - progress);
        }
        _terrain3d.cutHeat.fill(0);
        _terrain3d.raiseHeat.fill(0);
        _terrain3d.dirty = true;
        if (progress >= 1) {
          hm.fill(0);
          _resetting = false;
          _resetSnapshot = null;
        }
        // Move dozer in a spiral during reset (visual: bulldozer is leveling)
        const resetAngle = _resetT * 0.8;
        const resetR = EXCLUSION_R + 20 + Math.sin(_resetT * 0.3) * 30;
        ds.wx = Math.cos(resetAngle) * resetR;
        ds.wz = Math.sin(resetAngle) * resetR;
        ds.wAngle = resetAngle + Math.PI / 2;
        ds.bladeMode = -1; // blade down while resetting
        ph.speed = 20;
      }

      // Cool heat
      decayHeat(_terrain3d, dt);

      // Sync mesh (positions only when heights changed, heat always)
      const _heightsDirty = _terrain3d.dirty;
      _syncTerrainMesh(_heightsDirty);
      if (_heightsDirty) _terrain3d.dirty = false;

      // Camera orbit
      if (_keys['KeyQ']) camAngleTarget += 1.5 * dt;
      if (_keys['KeyE']) camAngleTarget -= 1.5 * dt;
      camAngle += (camAngleTarget - camAngle) * 3 * dt;

      const camTargetX = ds.wx - Math.sin(ds.wAngle + camAngle) * camDist;
      const camTargetZ = ds.wz - Math.cos(ds.wAngle + camAngle) * camDist;
      const camTargetY = dozerModel.position.y + camHeight;
      camera.position.x += (camTargetX - camera.position.x) * 3 * dt;
      camera.position.y += (camTargetY - camera.position.y) * 3 * dt;
      camera.position.z += (camTargetZ - camera.position.z) * 3 * dt;
      camera.lookAt(dozerModel.position.x, dozerModel.position.y + 1, dozerModel.position.z);

      // Update uniforms
      const now = performance.now() / 1000;
      if (terrainMat) terrainMat.uniforms.uTime.value = now;
      crtQuad.material.uniforms.uTime.value = now;

      // HUD
      _updateHUD(ds.bladeMode, terrainH);

      // Render: scene → target → CRT pass
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(crtScene, crtCamera);
    },

    resize(w, h) {
      if (!_active) return;
      canvas.width = w;
      canvas.height = h;
      renderer.setSize(w, h);
      renderTarget.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      crtQuad.material.uniforms.uResolution.value.set(w, h);
    },

    /** Check if ESC was pressed (caller handles exit) */
    wantsExit() {
      if (_keys['Escape'] && !_resetting) { _keys['Escape'] = false; return true; }
      _keys['Escape'] = false;
      return false;
    },

    dispose() {
      _active = false;
      _removeHUD();
      window.removeEventListener('keydown', _onKeyDown);
      window.removeEventListener('keyup', _onKeyUp);
      window.removeEventListener('resize', _onResize);
      if (terrainMesh) { scene.remove(terrainMesh); terrainGeo.dispose(); terrainMat.dispose(); }
      renderTarget.dispose();
      renderer.dispose();
    },
  };
}
