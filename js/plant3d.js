// Cena 3D da planta didática: estrutura, tanques, bombas, instrumentos, painel, fluxos e desmontagem em etapas.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const STAGES = ['Painel e eletrônica', 'Instrumentos', 'Válvulas e tubulação', 'Tanques e aquecimento', 'Bombas e reservatório'];

// Geometria principal (metros). Frente da bancada em +z.
const G = {
  W: 1.30, D: 0.70, H: 1.70, deck: 0.62,
  heat: { x: -0.33, z: -0.05, r: 0.16, y0: 0.98, y1: 1.43 },
  mix: { x: 0.05, z: -0.05, r: 0.1043, y0: 0.64, y1: 1.34 },
  res: { x0: -0.47, x1: 0.33, y0: 0.13, y1: 0.50, z0: -0.31, z1: 0.14 },
  p1: { x: -0.22 }, p2: { x: 0.10 }, front: 0.27, hline: 0.70, rot1: -0.56, rot2: 0.26
};

function envScene() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 12, 30), new THREE.MeshBasicMaterial({ color: 0x07080a, side: THREE.BackSide })));
  const strip = (w, h, x, y, z, ry, rx, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
  strip(10, 0.7, 0, 5.8, 0, 0, Math.PI / 2, 2.4); strip(10, 0.3, 0, 5.7, -3, 0, Math.PI / 2, 1.6); strip(10, 0.3, 0, 5.7, 3, 0, Math.PI / 2, 1.6);
  strip(0.4, 4, -9, 2.5, -4, Math.PI / 2, 0, 1.3); strip(0.4, 4, 9, 2.5, 3, Math.PI / 2, 0, 1.1); strip(6, 2, 0, 2, -14, 0, 0, 0.25); strip(6, 2, 0, 2, 14, 0, 0, 0.2);
  return s;
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// Caminho poligonal com cantos arredondados (curvas de tubulação)
function roundedPath(pts, rad = 0.05) {
  const path = new THREE.CurvePath();
  let prev = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i], last = i === pts.length - 1;
    if (last) { path.add(new THREE.LineCurve3(prev, a.clone())); break; }
    const b = pts[i + 1];
    const d1 = a.clone().sub(pts[i - 1]), d2 = b.clone().sub(a);
    const r = Math.min(rad, d1.length() * 0.45, d2.length() * 0.45);
    const p1 = a.clone().sub(d1.normalize().multiplyScalar(r)), p2 = a.clone().add(d2.normalize().multiplyScalar(r));
    if (prev.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(prev, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, a.clone(), p2));
    prev = p2;
  }
  return path;
}

export class PlantScene {
  constructor(container, opts = {}) {
    this.container = container; this.capture = !!opts.capture;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: this.capture, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.92;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0f12); scene.fog = new THREE.FogExp2(0x0d0f12, 0.07);
    scene.environment = new THREE.PMREMGenerator(r).fromScene(envScene(), 0.03).texture;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    this.camera.position.set(1.3, 1.85, 3.75);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.07; c.minDistance = 0.5; c.maxDistance = 9; c.maxPolarAngle = Math.PI * 0.49; c.target.set(-0.02, 0.86, 0);
    scene.add(new THREE.HemisphereLight(0xa9bdd0, 0x0a0a0c, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(2.5, 5, 3.5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.6, bottom: -1, near: 1, far: 12 }); key.shadow.bias = -0.0005; key.shadow.radius = 5;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 0.7); rim.position.set(-4, 2.5, -3.5); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xfff1e0, 0.35); fill.position.set(-3, 1.5, 4); scene.add(fill);

    this.mats();
    this.comps = {}; this.flows = []; this.labelAnchors = {};
    this.root = new THREE.Group(); scene.add(this.root);
    this.buildStudio(); this.buildFrame(); this.buildReservoir(); this.buildPumps(); this.buildHeatTank(); this.buildMixTank();
    this.buildPipes(); this.buildValves(); this.buildRotameters(); this.buildInstruments(); this.buildAir(); this.buildPanel();
    this.finalize();

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const comp = this.composer = new EffectComposer(r, rt);
    comp.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.4, 1.0); comp.addPass(this.bloom);
    comp.addPass(new OutputPass());
    this.explode = 0; this.xray = true; this.selected = null;
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x3fd6f5)); this.selBox.visible = false; this.selBox.material.depthTest = false; this.selBox.renderOrder = 10; scene.add(this.selBox);
    this.ray = new THREE.Raycaster();
    this.resize(); window.addEventListener('resize', () => this.resize());
  }

  mats() {
    const S = (o) => new THREE.MeshStandardMaterial(o), P = (o) => new THREE.MeshPhysicalMaterial(o);
    this.M = {
      steel: P({ color: 0xc8ced4, metalness: 1, roughness: 0.27, envMapIntensity: 1.1 }),
      brushed: P({ color: 0xaeb5bc, metalness: 1, roughness: 0.42 }),
      shell: P({ color: 0xc8ced4, metalness: 1, roughness: 0.3, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
      alu: S({ color: 0xb4bac0, metalness: 0.85, roughness: 0.4 }),
      blue: S({ color: 0x1d5fc4, metalness: 0.2, roughness: 0.45 }),
      dark: S({ color: 0x1d2024, metalness: 0.35, roughness: 0.55 }),
      black: S({ color: 0x101114, metalness: 0.1, roughness: 0.75 }),
      rubber: S({ color: 0x18191b, roughness: 0.9 }),
      orange: P({ color: 0xec6f17, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
      ld: P({ color: 0x8d97a1, metalness: 0.55, roughness: 0.38, clearcoat: 0.4 }),
      tt: P({ color: 0x2b62c6, metalness: 0.2, roughness: 0.35, clearcoat: 0.6 }),
      motor: P({ color: 0x2a4f80, metalness: 0.4, roughness: 0.4, clearcoat: 0.5 }),
      panel: S({ color: 0xd3d6d3, metalness: 0.05, roughness: 0.55 }),
      panelIn: S({ color: 0xb9bdb9, roughness: 0.7 }),
      glass: P({ color: 0xe8f6ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false }),
      red: P({ color: 0xc8262b, roughness: 0.3, clearcoat: 0.8 }),
      yellow: S({ color: 0xf2c230, roughness: 0.45 }),
      green: S({ color: 0x2f8f4a, roughness: 0.5 }),
      copper: S({ color: 0xb87333, metalness: 0.9, roughness: 0.35 }),
      white: S({ color: 0xe9ebec, roughness: 0.6 }),
      hose: S({ color: 0x23262b, roughness: 0.7 }),
      airHose: S({ color: 0x3a8fd1, roughness: 0.5 })
    };
  }

  // Registra um componente com etapa de desmontagem e direção de afastamento
  comp(id, stage, dir, anchor) {
    const g = new THREE.Group(); g.name = id; g.userData.compId = id; g.userData.stage = stage; g.userData.dir = dir || V3(0, 0, 0);
    this.root.add(g); this.comps[id] = g; if (anchor) this.labelAnchors[id] = anchor; return g;
  }
  mesh(parent, geo, mat, x = 0, y = 0, z = 0, cast = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
  box(p, w, h, d, mat, x, y, z, r = 0.006) { return this.mesh(p, r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
  cyl(p, rt, rb, h, mat, x, y, z, axis = 'y', seg = 32, open = false) {
    const m = this.mesh(p, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat, x, y, z);
    if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'z') m.rotation.x = Math.PI / 2; return m;
  }
  tube(p, pts, r, mat, rad = 0.05) { const path = roundedPath(pts, rad); const m = this.mesh(p, new THREE.TubeGeometry(path, Math.max(24, pts.length * 24), r, 12), mat); return { mesh: m, path }; }
  flange(p, x, y, z, axis = 'y', r = 0.024) { return this.cyl(p, r, r, 0.012, this.M.steel, x, y, z, axis, 20); }

  buildStudio() {
    const s = this.scene;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.4 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const grid = canvasTex(1024, 1024, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(0,170,208,0.10)'; g.lineWidth = 1; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } const gr = g.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(13,15,18,1)'); g.globalCompositeOperation = 'destination-out'; const g2 = g.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w / 2); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = g2; g.fillRect(0, 0, w, h); });
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: grid, transparent: true, depthWrite: false })); gm.rotation.x = -Math.PI / 2; gm.position.y = 0.002; s.add(gm);
    const ao = canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.8)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const aoM = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false })); aoM.rotation.x = -Math.PI / 2; aoM.position.y = 0.004; s.add(aoM);
    const wallTex = canvasTex(16, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#07080a'); gr.addColorStop(0.62, '#191d22'); gr.addColorStop(0.82, '#20262d'); gr.addColorStop(1, '#15181c'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 7, 96, 1, true), new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.BackSide, fog: false })); wall.position.y = 3.5; s.add(wall);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.565, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00aad0).multiplyScalar(0.9), transparent: true, opacity: 0.4 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; s.add(ring);
  }

  buildFrame() {
    const g = this.comp('frame', 5, V3(0, 0, 0), V3(-0.65, 1.66, 0.35)), M = this.M, P = 0.04, hw = G.W / 2, hd = G.D / 2;
    const prof = (w, h, d, x, y, z, ins) => { this.box(g, w, h, d, M.alu, x, y, z, 0.004); if (ins) { const b = this.box(g, ins === 'x' ? w * 0.98 : 0.012, ins === 'y' ? h * 0.98 : 0.012, 0.004, M.blue, x, y, z + d / 2 + 0.001, 0); if (ins === 'x') { b.scale.y = 1; } } };
    [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].forEach(([x, z]) => {
      prof(P, G.H - 0.1, P, x, 0.1 + (G.H - 0.1) / 2, z, z > 0 ? 'y' : null);
      this.cyl(g, 0.035, 0.035, 0.03, M.rubber, x, 0.045, z, 'x', 20); this.box(g, 0.06, 0.03, 0.06, M.dark, x, 0.085, z, 0.004);
    });
    [0.12, G.deck - 0.03, G.H].forEach(y => {
      prof(G.W, P, P, 0, y, hd, 'x'); prof(G.W, P, P, 0, y, -hd, null);
      prof(P, P, G.D, -hw, y, 0, null); prof(P, P, G.D, hw, y, 0, null);
    });
    // Mesa intermediária e piso inferior
    this.box(g, G.W - 0.04, 0.012, G.D - 0.04, M.brushed, 0, G.deck, 0, 0.003);
    this.box(g, G.W - 0.04, 0.01, G.D - 0.04, M.dark, 0, 0.145, 0, 0.003);
    // Travessa traseira para o painel e suportes do tanque de aquecimento
    prof(P, G.H - G.deck, P, 0.02, G.deck + (G.H - G.deck) / 2, -hd, null);
    const h = G.heat; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => this.cyl(g, 0.012, 0.012, h.y0 - G.deck, M.steel, h.x + a * 0.1, (G.deck + h.y0) / 2, h.z + b * 0.1, 'y', 12));
  }

  buildReservoir() {
    const R = G.res, g = this.comp('reservoir', 4, V3(0, -0.02, -0.75), V3(R.x0 + 0.1, R.y1, R.z0)), M = this.M;
    const w = R.x1 - R.x0, h = R.y1 - R.y0, d = R.z1 - R.z0, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    this.box(g, w, h, d, M.brushed, cx, R.y0 + h / 2, cz, 0.012);
    this.box(g, w + 0.01, 0.01, d + 0.01, M.steel, cx, R.y1 + 0.004, cz, 0.004);
    // visor de nível
    this.box(g, 0.025, h * 0.7, 0.006, M.glass, R.x0 + 0.06, R.y0 + h / 2, R.z1 + 0.003, 0);
    const water = this.box(g, 0.018, h * 0.45, 0.004, new THREE.MeshStandardMaterial({ color: 0x2f7fd0, emissive: 0x0d3a66, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }), R.x0 + 0.06, R.y0 + h * 0.28, R.z1 + 0.004, 0);
    this.cyl(g, 0.02, 0.02, 0.04, M.steel, cx - 0.1, R.y1 + 0.02, cz + 0.05, 'y', 16);
  }

  pump(id, x, stageDir, anchor) {
    const g = this.comp(id, 4, stageDir, anchor), M = this.M, y = 0.22, z = G.front - 0.02;
    this.box(g, 0.34, 0.012, 0.16, M.dark, x - 0.13, 0.156, z, 0.003);
    this.cyl(g, 0.055, 0.055, 0.2, M.motor, x - 0.19, y, z, 'x', 28);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; this.box(g, 0.18, 0.008, 0.008, M.motor, x - 0.2, y + Math.sin(a) * 0.057, z + Math.cos(a) * 0.057, 0.002); }
    this.cyl(g, 0.05, 0.05, 0.03, M.black, x - 0.305, y, z, 'x', 24);
    this.box(g, 0.07, 0.05, 0.07, M.motor, x - 0.18, y + 0.075, z, 0.008);
    this.box(g, 0.08, 0.02, 0.1, M.dark, x - 0.19, y - 0.062, z, 0.004);
    const coup = this.cyl(g, 0.03, 0.03, 0.04, M.steel, x - 0.07, y, z, 'x', 16);
    const shaftMark = this.box(coup, 0.012, 0.042, 0.006, M.orange, 0, 0, 0.026, 0);
    const vol = this.cyl(g, 0.065, 0.065, 0.055, M.steel, x, y, z, 'x', 32);
    this.cyl(g, 0.022, 0.022, 0.07, M.steel, x + 0.05, y, z, 'x', 16);
    this.cyl(g, 0.02, 0.02, 0.08, M.steel, x, y + 0.08, z, 'y', 16);
    g.userData.spin = coup;
  }
  buildPumps() {
    this.pump('p101', G.p1.x, V3(-0.35, 0, 0.5), V3(G.p1.x - 0.3, 0.3, G.front));
    this.pump('p102', G.p2.x, V3(0.3, 0, 0.5), V3(G.p2.x - 0.3, 0.3, G.front));
  }

  buildHeatTank() {
    const h = G.heat, M = this.M, H = h.y1 - h.y0;
    const g = this.comp('heatTank', 3, V3(-0.35, 0.5, -0.05), V3(h.x - h.r, h.y0 + H * 0.6, h.z));
    this.cyl(g, h.r, h.r, H, M.shell, h.x, h.y0 + H / 2, h.z, 'y', 48, true);
    this.cyl(g, h.r + 0.004, h.r + 0.004, 0.01, M.steel, h.x, h.y1, h.z, 'y', 48);
    this.cyl(g, h.r + 0.004, h.r + 0.004, 0.01, M.steel, h.x, h.y0, h.z, 'y', 48);
    this.cyl(g, h.r + 0.004, h.r + 0.004, 0.006, M.brushed, h.x, h.y1 + 0.006, h.z, 'y', 48);
    const wm = this.waterMat1 = new THREE.MeshPhysicalMaterial({ color: 0x2f7fd0, roughness: 0.15, transparent: true, opacity: 0.55, emissive: 0x0b2a48, emissiveIntensity: 0.5, depthWrite: false });
    const wl = (h.y1 - 0.06) - h.y0; this.water1 = this.cyl(g, h.r - 0.006, h.r - 0.006, wl, wm, h.x, h.y0 + wl / 2 + 0.006, h.z, 'y', 40); this.water1.castShadow = false;
    // isolamento térmico (faixa) e transbordo
    this.cyl(g, h.r + 0.002, h.r + 0.002, 0.02, M.dark, h.x, h.y0 + 0.08, h.z, 'y', 48, true);
    // Resistências (componente separado que sai do tanque)
    const r = this.comp('heater', 3, V3(-0.35, 0.72, -0.05), V3(h.x - 0.06, h.y1 + 0.14, h.z));
    this.heaterMat = new THREE.MeshStandardMaterial({ color: 0x5a5f66, metalness: 0.8, roughness: 0.35, emissive: 0xff5a10, emissiveIntensity: 0 });
    [-0.06, 0, 0.06].forEach((dx, i) => {
      const x = h.x - 0.05 + dx, zz = h.z + (i - 1) * 0.03;
      const pts = [V3(x, h.y1 + 0.02, zz - 0.025), V3(x, h.y0 + 0.08, zz - 0.025), V3(x, h.y0 + 0.08, zz + 0.025), V3(x, h.y1 + 0.02, zz + 0.025)];
      this.tube(r, pts, 0.006, this.heaterMat, 0.02);
    });
    this.box(r, 0.16, 0.06, 0.12, M.black, h.x - 0.05, h.y1 + 0.05, h.z, 0.01);
    this.cyl(r, 0.012, 0.012, 0.05, M.dark, h.x - 0.05, h.y1 + 0.1, h.z + 0.04, 'y', 12);
  }

  buildMixTank() {
    const m = G.mix, M = this.M, H = m.y1 - m.y0;
    const g = this.comp('mixTank', 3, V3(0.15, 0.55, -0.1), V3(m.x + m.r, m.y0 + H * 0.65, m.z));
    this.cyl(g, m.r, m.r, H, M.shell, m.x, m.y0 + H / 2, m.z, 'y', 48, true);
    [m.y0, m.y1].forEach(y => this.cyl(g, m.r + 0.004, m.r + 0.004, 0.01, M.steel, m.x, y, m.z, 'y', 48));
    this.cyl(g, m.r + 0.004, m.r + 0.004, 0.006, M.brushed, m.x, m.y1 + 0.006, m.z, 'y', 48);
    [-1, 1].forEach(a => [-1, 1].forEach(b => this.cyl(g, 0.01, 0.01, 0.02, M.steel, m.x + a * 0.07, G.deck + 0.012, m.z + b * 0.07, 'y', 10)));
    // escala graduada
    const sc = canvasTex(64, 512, (c, w, hh) => { c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, hh); c.fillStyle = '#e9eef2'; for (let i = 0; i <= 70; i++) { const y = hh - i / 70 * hh; c.fillRect(0, y - 1, i % 10 === 0 ? 34 : i % 5 === 0 ? 22 : 12, 2); if (i % 10 === 0 && i) { c.font = '22px IBM Plex Mono, monospace'; c.fillText(String(i), 36, y + 8); } } });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.045, H), new THREE.MeshBasicMaterial({ map: sc, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 }));
    sm.position.set(m.x - 0.02, m.y0 + H / 2, m.z + m.r + 0.004); g.add(sm);
    this.waterMat3 = new THREE.MeshPhysicalMaterial({ color: 0x2f7fd0, roughness: 0.15, transparent: true, opacity: 0.55, emissive: 0x0b2a48, emissiveIntensity: 0.5, depthWrite: false });
    this.water3 = this.cyl(g, m.r - 0.005, m.r - 0.005, 1, this.waterMat3, m.x, m.y0, m.z, 'y', 40); this.water3.castShadow = false;
    this.water3.geometry.translate(0, 0.5, 0);
    // bolhas de ar
    const nb = 70, bp = new Float32Array(nb * 3); this.bubbleSeed = Array.from({ length: nb }, (_, i) => ({ a: Math.random() * 6.28, r: Math.random() * 0.07, u: Math.random(), s: 0.5 + Math.random() * 0.6 }));
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xdff4ff, size: 0.012, transparent: true, opacity: 0.8, depthWrite: false })); g.add(this.bubbles);
    // Saídas manuais com registros
    const og = this.comp('outlets', 2, V3(0.05, 0.2, -0.55), V3(m.x + 0.05, m.y0 + 0.38, m.z - m.r - 0.1));
    this.outletHandles = [];
    [0.10, 0.25, 0.38].forEach((hh, i) => {
      const y = m.y0 + hh, x = m.x + (i - 1) * 0.045, z0 = m.z - m.r;
      const pts = [V3(x, y, z0), V3(x, y, z0 - 0.08), V3(x, y - 0.05, z0 - 0.13), V3(x, G.res.y1 + 0.02, z0 - 0.13)];
      this.tube(og, pts, 0.011, M.steel, 0.03);
      this.cyl(og, 0.017, 0.017, 0.04, M.brushed, x, y, z0 - 0.045, 'z', 16);
      const hd = this.box(og, 0.012, 0.01, 0.07, M.red, x, y + 0.022, z0 - 0.045, 0.003); hd.geometry.translate(0, 0, 0.0);
      this.outletHandles.push(hd);
    });
  }

  buildPipes() {
    const M = this.M, f = G.front, hl = G.hline, h = G.heat, m = G.mix, R = G.res;
    const g1 = this.comp('pipe1', 2, V3(-0.05, 0.08, 0.42), V3(G.rot1, 1.53, f));
    const g2 = this.comp('pipe2', 2, V3(0.05, 0.08, 0.42), V3(G.rot2 + 0.02, 1.49, f));
    const gx = this.comp('overflow', 2, V3(0, 0.75, -0.2), V3(-0.02, 1.42, h.z));
    const p1 = G.p1.x, p2 = G.p2.x, yp = 0.22;
    // Linha 1: reservatório, bomba, FT, FCV, rotâmetro, tanque de aquecimento
    const s1 = [V3(p1 + 0.11, yp, R.z1 - 0.02), V3(p1 + 0.11, yp, f - 0.02), V3(p1 + 0.08, yp, f - 0.02)];
    const d1 = [V3(p1, yp + 0.12, f - 0.02), V3(p1, hl, f - 0.02), V3(G.rot1, hl, f - 0.02), V3(G.rot1, 0.80, f - 0.02)];
    const u1 = [V3(G.rot1, 1.24, f - 0.02), V3(G.rot1, 1.52, f - 0.02), V3(G.rot1, 1.52, h.z + 0.07), V3(h.x - 0.02, 1.52, h.z + 0.07), V3(h.x - 0.02, h.y1 - 0.02, h.z + 0.07)];
    this.tube(g1, s1, 0.013, M.steel, 0.04); this.tube(g1, d1, 0.011, M.steel, 0.05); this.tube(g1, u1, 0.011, M.steel, 0.05);
    // Linha 2: água fria direto para o tanque de mistura
    const s2 = [V3(p2 + 0.11, yp, R.z1 - 0.02), V3(p2 + 0.11, yp, f - 0.02), V3(p2 + 0.08, yp, f - 0.02)];
    const d2 = [V3(p2, yp + 0.12, f - 0.02), V3(p2, hl, f - 0.02), V3(G.rot2, hl, f - 0.02), V3(G.rot2, 0.80, f - 0.02)];
    const u2 = [V3(G.rot2, 1.24, f - 0.02), V3(G.rot2, 1.48, f - 0.02), V3(G.rot2, 1.48, m.z + 0.02), V3(m.x + 0.04, 1.48, m.z + 0.02), V3(m.x + 0.04, m.y1 - 0.03, m.z + 0.02)];
    this.tube(g2, s2, 0.013, M.steel, 0.04); this.tube(g2, d2, 0.011, M.steel, 0.05); this.tube(g2, u2, 0.011, M.steel, 0.05);
    // Transbordo do aquecimento para a mistura
    const ov = [V3(h.x + h.r - 0.01, h.y1 - 0.05, h.z), V3(m.x - 0.05, h.y1 - 0.05, h.z), V3(m.x - 0.05, m.y1 - 0.03, h.z)];
    this.tube(gx, ov, 0.014, M.steel, 0.04);
    [[g1, p1], [g2, p2]].forEach(([g, x]) => { this.flange(g, x, hl - 0.06, f - 0.02); });
    // Caminhos das partículas
    const join = (...a) => a.flat();
    this.flowPaths = {
      f1: roundedPath(join(s1, [V3(p1, yp, f - 0.02)], d1, u1, [V3(h.x - 0.02, h.y0 + 0.12, h.z + 0.07)]), 0.05),
      f2: roundedPath(join(s2, [V3(p2, yp, f - 0.02)], d2, u2, [V3(m.x + 0.04, m.y0 + 0.2, m.z + 0.02)]), 0.05),
      ov: roundedPath(join([V3(h.x + 0.02, h.y1 - 0.05, h.z)], ov, [V3(m.x - 0.05, m.y0 + 0.25, h.z)]), 0.04)
    };
  }

  valve(id, x, dir, anchor) {
    const g = this.comp(id, 2, dir, anchor), M = this.M, y = G.hline, z = G.front - 0.02;
    this.cyl(g, 0.026, 0.026, 0.11, M.steel, x, y, z, 'x', 24);
    this.mesh(g, new THREE.SphereGeometry(0.038, 24, 16), M.steel, x, y, z);
    [-0.06, 0.06].forEach(d => this.cyl(g, 0.034, 0.034, 0.012, M.steel, x + d, y, z, 'x', 24));
    this.cyl(g, 0.022, 0.026, 0.03, M.steel, x, y + 0.045, z, 'y', 20);
    // castelo (yoke) e haste
    [-1, 1].forEach(s => this.box(g, 0.01, 0.1, 0.012, M.steel, x + s * 0.028, y + 0.11, z, 0.002));
    const stem = this.cyl(g, 0.005, 0.005, 0.1, M.brushed, x, y + 0.11, z, 'y', 10);
    const ind = this.box(g, 0.018, 0.004, 0.014, M.yellow, x, y + 0.1, z, 0.001);
    // atuador pneumático de diafragma (laranja)
    this.cyl(g, 0.075, 0.075, 0.016, M.orange, x, y + 0.17, z, 'y', 40);
    this.mesh(g, new THREE.SphereGeometry(0.075, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2.6), M.orange, x, y + 0.172, z);
    this.mesh(g, new THREE.SphereGeometry(0.075, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2.6), M.orange, x, y + 0.168, z).rotation.x = Math.PI;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this.cyl(g, 0.004, 0.004, 0.026, M.steel, x + Math.cos(a) * 0.07, y + 0.17, z + Math.sin(a) * 0.07, 'y', 6); }
    // posicionador (cinza) com manômetros
    this.box(g, 0.075, 0.09, 0.05, M.ld, x + 0.075, y + 0.11, z + 0.02, 0.008);
    this.cyl(g, 0.014, 0.014, 0.012, M.white, x + 0.06, y + 0.135, z + 0.05, 'z', 16);
    this.cyl(g, 0.014, 0.014, 0.012, M.white, x + 0.09, y + 0.135, z + 0.05, 'z', 16);
    this.box(g, 0.035, 0.02, 0.003, M.black, x + 0.075, y + 0.095, z + 0.046, 0);
    this.tube(g, [V3(x + 0.075, y + 0.155, z + 0.02), V3(x + 0.075, y + 0.205, z + 0.02), V3(x + 0.02, y + 0.205, z + 0.02)], 0.003, M.copper, 0.015);
    g.userData.stem = stem; g.userData.ind = ind; g.userData.y = y;
  }
  buildValves() {
    this.valve('fcv101', (G.p1.x + G.rot1) / 2 + 0.02, V3(-0.05, 0.22, 0.85), V3((G.p1.x + G.rot1) / 2 + 0.02, G.hline + 0.25, G.front));
    this.valve('fcv102', (G.p2.x + G.rot2) / 2 - 0.01, V3(0.05, 0.22, 0.85), V3((G.p2.x + G.rot2) / 2 - 0.01, G.hline + 0.25, G.front));
  }

  rotameter(id, x, dir, anchor) {
    const g = this.comp(id, 2, dir, anchor), M = this.M, z = G.front - 0.02, y0 = 0.80, y1 = 1.24;
    this.box(g, 0.05, 0.03, 0.05, M.steel, x, y0 + 0.015, z, 0.004); this.box(g, 0.05, 0.03, 0.05, M.steel, x, y1 - 0.015, z, 0.004);
    this.cyl(g, 0.016, 0.012, y1 - y0 - 0.06, M.glass, x, (y0 + y1) / 2, z, 'y', 20);
    [-1, 1].forEach(s => this.box(g, 0.006, y1 - y0 - 0.06, 0.006, M.steel, x + s * 0.024, (y0 + y1) / 2, z - 0.018, 0.001));
    const sc = canvasTex(32, 512, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#e9eef2'; for (let i = 0; i <= 10; i++) { const yy = h - 12 - i / 10 * (h - 24); c.fillRect(0, yy - 1, i % 5 ? 10 : 18, 2); } });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.012, y1 - y0 - 0.06), new THREE.MeshBasicMaterial({ map: sc, transparent: true, toneMapped: false, depthWrite: false })); sm.position.set(x + 0.02, (y0 + y1) / 2, z + 0.006); g.add(sm);
    const flt = this.mesh(g, new THREE.ConeGeometry(0.011, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0xc23a2b, metalness: 0.5, roughness: 0.3, emissive: 0x3a0a05 }), x, y0 + 0.05, z);
    flt.rotation.x = Math.PI; g.userData.float = flt; g.userData.y0 = y0 + 0.045; g.userData.y1 = y1 - 0.045;
  }
  buildRotameters() {
    this.rotameter('fi101', G.rot1, V3(-0.2, 0.25, 0.85), V3(G.rot1 - 0.03, 1.02, G.front));
    this.rotameter('fi102', G.rot2, V3(0.05, 0.25, 0.85), V3(G.rot2 + 0.03, 1.02, G.front));
  }

  // Transmissor de pressão diferencial (carcaça com duas tampas) e transmissor de temperatura (cabeçote)
  ldHousing(g, x, y, z, rotY = 0) {
    const M = this.M, h = new THREE.Group(); h.position.set(x, y, z); h.rotation.y = rotY; g.add(h);
    this.box(h, 0.05, 0.05, 0.05, M.ld, 0, 0, 0, 0.01);
    this.cyl(h, 0.032, 0.032, 0.03, M.ld, -0.035, 0, 0, 'x', 24); this.cyl(h, 0.032, 0.032, 0.03, M.ld, 0.035, 0, 0, 'x', 24);
    this.cyl(h, 0.026, 0.026, 0.004, M.glass, 0.052, 0, 0, 'x', 24);
    const lcd = this.cyl(h, 0.02, 0.02, 0.002, new THREE.MeshBasicMaterial({ color: 0x9fbf8a, toneMapped: false }), 0.051, 0, 0, 'x', 20);
    this.cyl(h, 0.01, 0.012, 0.03, M.ld, 0, 0.035, 0, 'y', 16);
    this.box(h, 0.07, 0.025, 0.04, M.steel, 0, -0.045, 0, 0.004);
    [-0.025, 0.025].forEach(d => this.cyl(h, 0.005, 0.005, 0.03, M.steel, d, -0.07, 0, 'y', 8));
    return h;
  }
  ttHead(g, x, y, z, len = 0.12) {
    const M = this.M;
    this.cyl(g, 0.005, 0.005, len, M.steel, x, y - len / 2, z, 'y', 10);
    this.cyl(g, 0.009, 0.009, 0.03, M.steel, x, y + 0.012, z, 'y', 12);
    this.cyl(g, 0.032, 0.032, 0.034, M.tt, x, y + 0.045, z, 'y', 28);
    this.cyl(g, 0.033, 0.033, 0.01, M.ld, x, y + 0.066, z, 'y', 28);
    this.cyl(g, 0.007, 0.007, 0.02, M.black, x + 0.03, y + 0.045, z, 'x', 10);
  }
  buildInstruments() {
    const f = G.front, h = G.heat, m = G.mix;
    const ft1 = this.comp('ft101', 1, V3(-0.05, -0.02, 0.75), V3(G.p1.x + 0.06, 0.47, f));
    this.ldHousing(ft1, G.p1.x + 0.06, 0.47, f + 0.03, 0); this.tube(ft1, [V3(G.p1.x + 0.035, 0.40, f + 0.03), V3(G.p1.x + 0.01, 0.40, f + 0.03), V3(G.p1.x + 0.01, 0.40, f - 0.02)], 0.004, this.M.steel, 0.01);
    this.box(ft1, 0.05, 0.03, 0.04, this.M.steel, G.p1.x, 0.38, f - 0.02, 0.004);
    const ft2 = this.comp('ft102', 1, V3(0.05, -0.02, 0.75), V3(G.p2.x + 0.06, 0.47, f));
    this.ldHousing(ft2, G.p2.x + 0.06, 0.47, f + 0.03, 0); this.tube(ft2, [V3(G.p2.x + 0.035, 0.40, f + 0.03), V3(G.p2.x + 0.01, 0.40, f + 0.03), V3(G.p2.x + 0.01, 0.40, f - 0.02)], 0.004, this.M.steel, 0.01);
    this.box(ft2, 0.05, 0.03, 0.04, this.M.steel, G.p2.x, 0.38, f - 0.02, 0.004);
    const t1 = this.comp('tt101', 1, V3(-0.12, 0.38, -0.5), V3(h.x + 0.08, h.y1 + 0.12, h.z - 0.08)); this.ttHead(t1, h.x + 0.08, h.y1 + 0.03, h.z - 0.08, 0.3);
    const t3 = this.comp('tt103', 1, V3(0.12, 0.38, -0.5), V3(m.x + 0.02, m.y1 + 0.12, m.z - 0.06)); this.ttHead(t3, m.x + 0.02, m.y1 + 0.03, m.z - 0.06, 0.45);
    const t2 = this.comp('tt102', 1, V3(0.25, 0.1, 0.7), V3(G.p2.x + 0.04, 0.6, f)); this.ttHead(t2, G.p2.x + 0.035, 0.58, f - 0.02, 0.0); t2.children.forEach(c => { c.position.x += 0.0; });
    const lt = this.comp('lt103', 1, V3(0.55, -0.05, 0.1), V3(m.x + m.r + 0.07, m.y0 + 0.06, m.z));
    const hh = this.ldHousing(lt, m.x + m.r + 0.075, m.y0 + 0.06, m.z, -Math.PI / 2);
    this.tube(lt, [V3(m.x + m.r, m.y0 + 0.015, m.z), V3(m.x + m.r + 0.075, m.y0 + 0.015, m.z)], 0.006, this.M.steel, 0.01);
  }

  buildAir() {
    const M = this.M, m = G.mix, x = G.W / 2 - 0.02, z = -G.D / 2 + 0.03;
    const g = this.comp('air', 1, V3(0.55, 0.15, -0.35), V3(x, 1.18, z));
    this.box(g, 0.06, 0.12, 0.05, M.dark, x - 0.03, 1.15, z + 0.03, 0.008);
    this.cyl(g, 0.028, 0.028, 0.06, M.glass, x - 0.03, 1.07, z + 0.03, 'y', 20);
    this.cyl(g, 0.024, 0.024, 0.012, M.white, x - 0.03, 1.2, z + 0.06, 'z', 24);
    this.cyl(g, 0.014, 0.014, 0.03, M.black, x - 0.03, 1.235, z + 0.03, 'y', 16);
    this.tube(g, [V3(x - 0.06, 1.15, z + 0.03), V3(m.x + 0.06, 1.15, z + 0.03), V3(m.x + 0.06, 1.42, m.z - 0.05), V3(m.x + 0.06, m.y1 - 0.02, m.z - 0.05)], 0.005, M.airHose, 0.06);
    const sp = this.comp('sparger', 3, V3(0.15, 0.55, -0.1), V3(m.x, m.y0 + 0.05, m.z));
    this.tube(sp, [V3(m.x + 0.06, m.y1 - 0.02, m.z - 0.05), V3(m.x + 0.06, m.y0 + 0.04, m.z - 0.05)], 0.004, M.steel, 0.01);
    const ring = this.mesh(sp, new THREE.TorusGeometry(0.06, 0.004, 8, 40), M.steel, m.x, m.y0 + 0.035, m.z); ring.rotation.x = Math.PI / 2;
  }

  buildPanel() {
    const M = this.M, x0 = 0.36, x1 = 0.63, y0 = 0.68, y1 = 1.46, z0 = 0.11, z1 = 0.32, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const enc = this.comp('panel', 0, V3(0.55, 0.05, -0.05), V3(x1, y1 - 0.05, z0));
    this.box(enc, w, h, 0.012, M.panel, cx, cy, z0 + 0.006, 0.004);
    this.box(enc, 0.012, h, d, M.panel, x0 + 0.006, cy, (z0 + z1) / 2, 0.004); this.box(enc, 0.012, h, d, M.panel, x1 - 0.006, cy, (z0 + z1) / 2, 0.004);
    this.box(enc, w, 0.012, d, M.panel, cx, y1 - 0.006, (z0 + z1) / 2, 0.004); this.box(enc, w, 0.012, d, M.panel, cx, y0 + 0.006, (z0 + z1) / 2, 0.004);
    this.box(enc, w - 0.03, h - 0.03, 0.004, M.panelIn, cx, cy, z0 + 0.014, 0);
    this.cyl(enc, 0.012, 0.012, 0.03, M.black, x0 + 0.05, y0 - 0.01, (z0 + z1) / 2, 'y', 12); this.cyl(enc, 0.012, 0.012, 0.03, M.black, x0 + 0.1, y0 - 0.01, (z0 + z1) / 2, 'y', 12);
    // Componentes internos
    const zi = z0 + 0.03;
    const rail = this.comp('rail', 0, V3(0.62, 0.32, 0.45), V3(cx, y1 - 0.12, zi + 0.04));
    this.box(rail, w - 0.05, 0.035, 0.008, M.brushed, cx, y1 - 0.12, zi, 0.001);
    for (let i = 0; i < 6; i++) { this.box(rail, 0.018, 0.08, 0.06, i < 2 ? M.white : M.dark, x0 + 0.04 + i * 0.03, y1 - 0.12, zi + 0.03, 0.003); this.box(rail, 0.008, 0.012, 0.01, i < 2 ? M.dark : M.white, x0 + 0.04 + i * 0.03, y1 - 0.105, zi + 0.064, 0.001); }
    const plc = this.comp('plc', 0, V3(0.72, 0.12, 0.42), V3(cx, y1 - 0.25, zi + 0.06));
    this.box(plc, 0.2, 0.1, 0.07, M.dark, cx, y1 - 0.25, zi + 0.035, 0.006);
    for (let i = 0; i < 4; i++) { this.box(plc, 0.035, 0.085, 0.004, M.black, x0 + 0.055 + i * 0.045, y1 - 0.25, zi + 0.072, 0.002); for (let j = 0; j < 4; j++) this.box(plc, 0.004, 0.004, 0.002, new THREE.MeshBasicMaterial({ color: j % 2 ? 0x3fd66b : 0xf0a43c, toneMapped: false }), x0 + 0.045 + i * 0.045, y1 - 0.22 - j * 0.012, zi + 0.075, 0); }
    const thy = this.comp('thy', 0, V3(0.78, -0.05, 0.42), V3(x0 + 0.07, cy - 0.06, zi + 0.08));
    this.box(thy, 0.09, 0.14, 0.03, M.brushed, x0 + 0.07, cy - 0.07, zi + 0.015, 0.003);
    for (let i = 0; i < 7; i++) this.box(thy, 0.004, 0.14, 0.03, M.brushed, x0 + 0.03 + i * 0.013, cy - 0.07, zi + 0.045, 0.001);
    this.box(thy, 0.08, 0.1, 0.03, M.dark, x0 + 0.07, cy - 0.07, zi + 0.075, 0.004);
    this.thyLed = this.box(thy, 0.008, 0.008, 0.004, new THREE.MeshBasicMaterial({ color: 0xff7a30, toneMapped: false }), x0 + 0.09, cy - 0.04, zi + 0.092, 0);
    const inv = this.comp('inv', 0, V3(0.8, -0.2, 0.38), V3(x1 - 0.07, y0 + 0.2, zi + 0.08));
    this.box(inv, 0.1, 0.16, 0.07, new THREE.MeshPhysicalMaterial({ color: 0x3a5d8f, metalness: 0.3, roughness: 0.45 }), x1 - 0.07, y0 + 0.2, zi + 0.035, 0.008);
    this.box(inv, 0.07, 0.05, 0.004, M.black, x1 - 0.07, y0 + 0.24, zi + 0.072, 0.002);
    // Porta com sinalizadores, emergência e interface do inversor
    const door = this.comp('door', 0, V3(0.95, 0.04, 0.32), V3(cx, y1 - 0.03, z1));
    this.box(door, w, h, 0.016, M.panel, cx, cy, z1 + 0.008, 0.006);
    this.box(door, 0.012, 0.08, 0.02, M.dark, x1 - 0.025, cy, z1 + 0.025, 0.003);
    const lampDef = [['run', 0x2fd06a], ['alarm', 0xf0a43c], ['trip', 0xff3030]];
    this.lamps = {};
    lampDef.forEach(([k, col], i) => {
      const xx = x0 + 0.05 + i * 0.05, yy = y1 - 0.08;
      this.cyl(door, 0.018, 0.018, 0.012, M.dark, xx, yy, z1 + 0.022, 'z', 20);
      const lm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.1, roughness: 0.3 });
      this.lamps[k] = this.mesh(door, new THREE.SphereGeometry(0.014, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lm, xx, yy, z1 + 0.028); this.lamps[k].rotation.x = Math.PI / 2;
    });
    // seletores das bombas
    [0, 1].forEach(i => { const xx = x0 + 0.06 + i * 0.07, yy = y1 - 0.18; this.cyl(door, 0.02, 0.02, 0.01, M.dark, xx, yy, z1 + 0.02, 'z', 20); this.box(door, 0.008, 0.03, 0.016, M.black, xx, yy, z1 + 0.03, 0.002); });
    // botão de emergência
    this.box(door, 0.07, 0.07, 0.006, M.yellow, x0 + 0.17, y1 - 0.18, z1 + 0.018, 0.006);
    this.estopBtn = this.cyl(door, 0.024, 0.02, 0.022, M.red, x0 + 0.17, y1 - 0.18, z1 + 0.032, 'z', 28);
    // interface remota do inversor (display)
    this.box(door, 0.09, 0.11, 0.012, M.dark, cx, y0 + 0.22, z1 + 0.018, 0.006);
    this.kpCanvas = document.createElement('canvas'); this.kpCanvas.width = 256; this.kpCanvas.height = 96;
    this.kpTex = new THREE.CanvasTexture(this.kpCanvas); this.kpTex.colorSpace = THREE.SRGBColorSpace;
    const kp = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.026), new THREE.MeshBasicMaterial({ map: this.kpTex, toneMapped: false })); kp.position.set(cx, y0 + 0.25, z1 + 0.025); door.add(kp);
    for (let i = 0; i < 6; i++) this.box(door, 0.016, 0.012, 0.006, M.black, cx - 0.025 + (i % 3) * 0.025, y0 + 0.21 - Math.floor(i / 3) * 0.02, z1 + 0.026, 0.002);
    // conduítes até as bombas e resistência
    const cg = this.comp('conduit', 2, V3(0.3, 0.05, 0.3), null);
    this.tube(cg, [V3(x0 + 0.04, y0, (z0 + z1) / 2), V3(x0 + 0.04, 0.4, (z0 + z1) / 2), V3(G.p2.x - 0.18, 0.4, G.front - 0.02), V3(G.p2.x - 0.18, 0.3, G.front - 0.02)], 0.008, M.hose, 0.06);
    this.tube(cg, [V3(x0 + 0.09, y0, (z0 + z1) / 2), V3(x0 + 0.09, 0.36, 0.0), V3(G.p1.x - 0.18, 0.36, 0.05), V3(G.p1.x - 0.18, 0.3, G.front - 0.03)], 0.008, M.hose, 0.06);
    this.tube(cg, [V3(x0 + 0.05, y1, (z0 + z1) / 2), V3(x0 + 0.05, 1.6, -0.1), V3(G.heat.x - 0.05, 1.6, G.heat.z), V3(G.heat.x - 0.05, G.heat.y1 + 0.08, G.heat.z)], 0.008, M.hose, 0.08);
  }

  finalize() {
    // Posição original de cada componente e lista de malhas para seleção
    this.pickables = [];
    Object.values(this.comps).forEach(g => { g.userData.home = g.position.clone(); g.traverse(o => { if (o.isMesh) { o.userData.compId = g.userData.compId; this.pickables.push(o); } }); });
    // Materiais próprios da estrutura para que ela fique translúcida na desmontagem
    this.frameMats = [];
    this.comps.frame.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; this.frameMats.push(o.material); } });
    // Fluxos de partículas
    const dot = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const mk = (key, n, size) => {
      const path = this.flowPaths[key], len = path.getLength(), lut = path.getSpacedPoints(400);
      const pos = new Float32Array(n * 3), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ map: dot, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x3fd6f5, sizeAttenuation: true });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; this.scene.add(pts);
      const f = { key, n, len, lut, pos, geo, mat, pts, u: Array.from({ length: n }, (_, i) => i / n + Math.random() * 0.3 / n), speed: 0 };
      this.flows.push(f); return f;
    };
    mk('f1', 120, 0.032); mk('f2', 120, 0.032); mk('ov', 50, 0.03);
  }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    const pr = this.capture ? 1 : Math.min(devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.bloom.setSize(w * pr / 2, h * pr / 2);
    this.camera.aspect = w / h; this.camera.fov = w / h < 0.9 ? Math.min(65, 27 / (w / h)) : 30; this.camera.updateProjectionMatrix();
  }

  setXray(on) { this.xray = on; this.M.shell.opacity = on ? 0.22 : 1; this.M.shell.depthWrite = !on; this.M.shell.transparent = on; this.M.shell.needsUpdate = true; this.water1.visible = this.water3.visible = on; }

  setExplode(e) {
    this.explode = e;
    Object.values(this.comps).forEach(g => {
      const k = ease(clamp(e - g.userData.stage, 0, 1));
      g.position.copy(g.userData.home).addScaledVector(g.userData.dir, k);
    });
    const ghost = clamp(e / 0.8, 0, 1);
    this.frameMats.forEach(m => { m.opacity = 1 - 0.82 * ghost; m.depthWrite = ghost < 0.5; });
    this.comps.frame.traverse(o => { if (o.isMesh) o.castShadow = ghost < 0.5; });
    const vis = e < 0.02; this.flows.forEach(f => f.pts.visible = vis); this.bubbles.visible = vis;
    if (this.selected) this.select(this.selected);
  }
  compFactor(id) { const g = this.comps[id]; return ease(clamp(this.explode - g.userData.stage, 0, 1)); }

  pick(clientX, clientY) {
    const rc = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2((clientX - rc.left) / rc.width * 2 - 1, -(clientY - rc.top) / rc.height * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hits = this.ray.intersectObjects(this.pickables, false).filter(h => h.object.visible && h.object.material !== this.M.glass);
    return hits.length ? hits[0].object.userData.compId : null;
  }
  select(id) {
    this.selected = id;
    if (!id || !this.comps[id]) { this.selBox.visible = false; return; }
    this.comps[id].updateMatrixWorld(true);
    this.selBox.box.setFromObject(this.comps[id]).expandByScalar(0.01); this.selBox.visible = true;
  }
  anchorScreen(id) {
    const a = this.labelAnchors[id]; if (!a) return null;
    const g = this.comps[id], p = a.clone().add(g.position).sub(g.userData.home).project(this.camera);
    if (p.z > 1) return null;
    const rc = this.renderer.domElement.getBoundingClientRect();
    return { x: rc.left + (p.x + 1) / 2 * rc.width, y: rc.top + (1 - p.y) / 2 * rc.height };
  }

  // Atualiza o estado visual a partir do modelo de processo
  update(dt, plant, t) {
    const s = plant.s, p = plant.p;
    // água: cor por temperatura
    const C0 = new THREE.Color(0x2c7fd6), C1 = new THREE.Color(0xd99a3e), C2 = new THREE.Color(0xf0502a);
    const tc = T => { const k = clamp((T - 25) / 35, 0, 1); return k < 0.5 ? C0.clone().lerp(C1, k * 2) : C1.clone().lerp(C2, k * 2 - 1); };
    this.waterMat1.color.copy(tc(s.T1)); this.waterMat1.emissive.copy(tc(s.T1)).multiplyScalar(0.25);
    this.waterMat3.color.copy(tc(s.T3)); this.waterMat3.emissive.copy(tc(s.T3)).multiplyScalar(0.25);
    this.water3.scale.y = Math.max(0.005, s.h3 - 0.005);
    this.heaterMat.emissiveIntensity = (s.P / (p.heaterMax * 1000)) * 2.2;
    this.thyLed.material.color.setHex(s.P > 50 ? 0xff7a30 : 0x331a0c);
    // bombas e válvulas
    [['p101', p.pump1On && !p.estop, 1], ['p102', p.pump2On && !p.estop, p.invHz / 60]].forEach(([id, on, k]) => { const g = this.comps[id]; g.userData.w = (g.userData.w || 0) + ((on ? 60 * k : 0) - (g.userData.w || 0)) * Math.min(1, dt * 2); g.userData.spin.rotation.x += g.userData.w * dt; });
    [['fcv101', s.v1], ['fcv102', s.v2]].forEach(([id, v]) => { const g = this.comps[id], y = g.userData.y; g.userData.stem.position.y = y + 0.1 + v / 100 * 0.025; g.userData.ind.position.y = y + 0.095 + v / 100 * 0.025; });
    [['fi101', s.F1], ['fi102', s.F2]].forEach(([id, F]) => { const g = this.comps[id]; g.userData.float.position.y = g.userData.y0 + clamp(F / 1000, 0, 1) * (g.userData.y1 - g.userData.y0) + Math.sin(t * 9 + F) * 0.0015 * (F > 5 ? 1 : 0); });
    p.outlets.forEach((o, i) => { this.outletHandles[i].rotation.y = o.open ? 0 : Math.PI / 2; });
    // sinalizadores e IHM do inversor
    const al = plant.alarms.length > 0, trip = s.tripped || p.estop;
    this.lamps.run.material.emissiveIntensity = (p.pump1On || p.pump2On) && !p.estop ? 2.2 : 0.05;
    this.lamps.alarm.material.emissiveIntensity = al && !trip ? (Math.sin(t * 6) > 0 ? 2.4 : 0.2) : 0.05;
    this.lamps.trip.material.emissiveIntensity = trip ? 2.6 : 0.05;
    this.estopBtn.position.z = (p.estop ? 0.32 + 0.028 : 0.32 + 0.032);
    if (!this._kpT || t - this._kpT > 0.25) {
      this._kpT = t; const c = this.kpCanvas.getContext('2d');
      c.fillStyle = '#1a0606'; c.fillRect(0, 0, 256, 96); c.fillStyle = (p.pump2On && !p.estop) ? '#ff3b2f' : '#5a1a14'; c.font = 'bold 64px IBM Plex Mono, monospace'; c.textAlign = 'right';
      c.fillText(((p.pump2On && !p.estop) ? p.invHz : 0).toFixed(1), 200, 72); c.font = 'bold 26px IBM Plex Mono, monospace'; c.fillText('Hz', 248, 72); this.kpTex.needsUpdate = true;
    }
    // partículas
    const tcol = T => tc(T).offsetHSL(0, 0.1, 0.18);
    const defs = { f1: [s.F1, p.tCold], f2: [s.F2, p.tCold], ov: [s.F1, s.T1] };
    this.flows.forEach(f => {
      const [F, T] = defs[f.key]; const v = F / 1000 * 0.55;
      f.mat.color.copy(tcol(T)); f.mat.opacity = clamp(F / 120, 0, 1) * 0.95;
      for (let i = 0; i < f.n; i++) { f.u[i] = (f.u[i] + v * dt / f.len * 1.6) % 1; const q = f.u[i] * (f.lut.length - 1), i0 = Math.floor(q), fr = q - i0, a = f.lut[i0], b = f.lut[Math.min(i0 + 1, f.lut.length - 1)]; f.pos[i * 3] = a.x + (b.x - a.x) * fr; f.pos[i * 3 + 1] = a.y + (b.y - a.y) * fr; f.pos[i * 3 + 2] = a.z + (b.z - a.z) * fr; }
      f.geo.attributes.position.needsUpdate = true;
    });
    // bolhas
    const m = G.mix, top = m.y0 + s.h3 - 0.01, bp = this.bubbles.geometry.attributes.position.array;
    this.bubbles.material.opacity = p.air ? 0.75 : 0;
    this.bubbleSeed.forEach((b, i) => { b.u = (b.u + dt * 0.5 * b.s) % 1; const y = m.y0 + 0.04 + b.u * (top - m.y0 - 0.04); bp[i * 3] = m.x + Math.cos(b.a + b.u * 3) * b.r; bp[i * 3 + 1] = y; bp[i * 3 + 2] = m.z + Math.sin(b.a + b.u * 3) * b.r; });
    this.bubbles.geometry.attributes.position.needsUpdate = true;
  }
  render() { this.controls.update(); this.composer.render(); }
}
