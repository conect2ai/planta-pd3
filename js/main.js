// Orquestração: modelo de processo, cena 3D, desmontagem, inspetor e supervisório.
import { Plant } from './process.js';
import { PlantScene, STAGES } from './plant3d.js';
import { COMPONENTS } from './components.js';
import { HMI } from './hmi.js';

const $ = id => document.getElementById(id);
const f1 = (v, d = 1) => Number(v).toFixed(d).replace('.', ',');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = location.hash.slice(1), GIF = (hash.match(/^gif=(\w+)$/) || [])[1];
if (GIF) document.body.classList.add('capture', 'cap-' + GIF);

const plant = new Plant();
const LOOP_OF = { fcv101: 'FIC101', ft101: 'FIC101', fi101: 'FIC101', fcv102: 'FIC102', ft102: 'FIC102', fi102: 'FIC102', tt101: 'TIC101', heater: 'TIC101', thy: 'TIC101', heatTank: 'TIC101', tt102: 'TIC101', tt103: 'TIC103', mixTank: 'TIC103', inv: 'FIC102' };
const state = { mode: 'teardown', speed: 10, explode: 0, target: null, playing: false, playT: 0, labels: true, camAuto: true, sel: null };

const SCENARIOS = [
  { name: 'Degrau no setpoint da mistura, 36 para 39 °C', run: P => { P.loops.TIC103.setMode('AUTO'); P.loops.FIC102.setMode('CAS'); P.loops.TIC103.sp = 39; } },
  { name: 'Perturbação na água fria, inversor de 60 para 40 Hz', run: P => { P.p.invHz = 40; } },
  { name: 'Cascata desfeita com a mesma perturbação', run: P => { P.loops.FIC102.setMode('AUTO'); P.loops.FIC102.sp = P.loops.FIC102.pv; P.loops.FIC102.setMode('MAN'); P.p.invHz = 40; } },
  { name: 'Degrau de vazão no aquecimento com antecipativo', run: P => { P.loops.TIC101.ffOn = true; P.loops.FIC101.sp = 330; } },
  { name: 'Degrau de vazão no aquecimento sem antecipativo', run: P => { P.loops.TIC101.ffOn = false; P.loops.FIC101.sp = 330; } },
  { name: 'Falha da bomba P-101', run: P => { P.p.pump1On = false; } },
  { name: 'Sensor TT-103 congelado', run: P => { P.p.tt.freeze = true; } },
  { name: 'Reiniciar a planta em regime', run: P => { P.reset(); hmi.renderDetail(); } }
];
const ctl = {
  get speed() { return state.speed; },
  setSpeed(v) { state.speed = v; renderSpeed(); },
  scenarios: SCENARIOS,
  runScenario(i) { SCENARIOS[i].run(plant); refreshInspector(); },
  onSelect(kind, id) { }
};

// ---------- Cena 3D ----------
const scene = new PlantScene($('stage'), { capture: !!GIF });
const hmi = new HMI($('hmi'), plant, ctl);

// ---------- Velocidade ----------
function renderSpeed() {
  const s = $('speed'); s.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.speed));
}
[1, 5, 10, 30, 60].forEach(v => { const b = document.createElement('button'); b.textContent = v + '×'; b.dataset.v = v; b.addEventListener('click', () => ctl.setSpeed(v)); $('speed').appendChild(b); });
renderSpeed();

// ---------- Modos ----------
function setMode(m) {
  state.mode = m;
  document.body.dataset.mode = m;
  $('modes').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  $('hmi').hidden = m !== 'hmi';
  if (m === 'op' && state.explode > 0) { state.target = 0; state.playing = false; }
  if (m === 'hmi') hmi.sizeTrend();
  try { localStorage.setItem('pd3-mode', m); } catch { }
}
$('modes').querySelectorAll('button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));

// ---------- Desmontagem ----------
const ticks = $('tdTicks');
STAGES.forEach((s, i) => { const t = document.createElement('button'); t.style.left = (i + 0.5) / 5 * 100 + '%'; t.innerHTML = `<i></i><span>${s}</span>`; t.addEventListener('click', () => { state.target = i + 1; state.playing = false; if (state.mode !== 'teardown') setMode('teardown'); }); ticks.appendChild(t); });
$('tdRange').addEventListener('input', e => { state.explode = +e.target.value; state.target = null; state.playing = false; if (state.mode === 'op') setMode('teardown'); });
$('tdPlay').addEventListener('click', () => {
  if (state.playing) { state.playing = false; return; }
  state.playing = true; state.playT = state.explode >= 4.99 ? 0 : state.explode * 1.6; if (state.explode >= 4.99) state.target = 0;
  if (state.mode !== 'teardown') setMode('teardown');
});
function stageInfo(e) {
  if (e < 0.05) return ['Planta montada', 'Arraste para desmontar peça por peça'];
  const k = clamp(Math.ceil(e - 0.45), 1, 5);
  return [`Etapa ${k} de 5 · ${STAGES[k - 1]}`, e >= 4.98 ? 'Clique em uma peça para ver detalhes' : 'Continue arrastando para a próxima etapa'];
}

// ---------- Etiquetas ----------
const labelEls = {};
const labelIds = Object.keys(COMPONENTS).filter(k => scene.labelAnchors[k] && (COMPONENTS[k].label || COMPONENTS[k].instr));
labelIds.forEach(k => {
  const d = document.createElement('div'); d.className = 'lbl'; d.innerHTML = `<i class="dot"></i><i class="ln"></i><div class="box"><b class="t"></b><span class="s"></span></div>`;
  d.addEventListener('click', () => selectComp(k)); $('labels').appendChild(d); labelEls[k] = { el: d, t: d.querySelector('.t'), s: d.querySelector('.s'), box: d.querySelector('.box') };
});
let activeLabels = [];
function updateLabels() {
  const e = scene.explode, M = state.mode, out = [];
  if (M !== 'hmi' && state.labels) {
    const cur = clamp(Math.ceil(e - 0.45), 0, 5);
    labelIds.forEach(k => {
      const C = COMPONENTS[k], st = scene.comps[k].userData.stage; let show = false;
      if (M === 'teardown' && e > 0.05) show = C.label && ((e >= 4.95) ? !!C.hero : (st === cur - 1 && scene.compFactor(k) > 0.45));
      else if (e <= 0.05) show = !!C.instr;
      if (state.sel === k) show = true;
      if (show) out.push(k);
    });
  }
  activeLabels = out;
  const W = innerWidth, items = [];
  labelIds.forEach(k => { const L = labelEls[k]; if (!out.includes(k)) { L.el.classList.remove('on'); return; } const p = scene.anchorScreen(k); if (!p || p.x < 0 || p.x > W || p.y < 50 || p.y > innerHeight) { L.el.classList.remove('on'); return; } items.push({ k, p, L }); });
  // texto
  items.forEach(({ k, L }) => { const C = COMPONENTS[k]; const full = M === 'teardown' && e > 0.05; L.t.textContent = full ? C.name : C.tag; L.s.textContent = full ? C.tag : (C.instr ? C.instr(plant) : ''); L.el.classList.toggle('sel', state.sel === k); L.el.classList.toggle('inst', !full); });
  // posicionamento com desvio de colisão por lado
  const cx = W / 2 + (M === 'op' && !$('insp').classList.contains('min') ? -160 : 0);
  ['l', 'r'].forEach(side => {
    const arr = items.filter(i => (i.p.x < cx) === (side === 'l')).sort((a, b) => a.p.y - b.p.y);
    let lastBottom = -1e9;
    arr.forEach(i => { const h = i.L.box.offsetHeight || 34; let y = Math.max(i.p.y - h / 2, lastBottom + 6); i.y = y; lastBottom = y + h; });
    arr.forEach(i => {
      const L = i.L, dx = side === 'l' ? -46 : 46, bw = L.box.offsetWidth || 120, h = L.box.offsetHeight || 34;
      L.el.classList.add('on'); L.el.classList.toggle('left', side === 'l');
      L.el.style.transform = `translate(${i.p.x}px,${i.p.y}px)`;
      const by = i.y - i.p.y;
      L.box.style.transform = `translate(${side === 'l' ? dx - bw : dx}px,${by}px)`;
      const ly = by + h / 2, len = Math.hypot(dx, ly), ang = Math.atan2(ly, dx);
      L.el.querySelector('.ln').style.cssText = `width:${len}px;transform:rotate(${ang}rad)`;
    });
  });
}

// ---------- Inspetor ----------
function selectComp(id) {
  if (id && !COMPONENTS[id]) id = null;
  state.sel = id; scene.select(id);
  $('inspEmpty').hidden = !!id; $('inspBody').hidden = !id;
  if (!id) return;
  const C = COMPONENTS[id];
  $('iTag').textContent = C.tag; $('iName').textContent = C.name; $('iDesc').textContent = C.desc;
  const box = $('iParams'); box.innerHTML = '';
  C.params.forEach(p => {
    const w = document.createElement('div'); w.className = 'ip ' + p.type;
    if (p.type === 'range') {
      w.innerHTML = `<div class="ipl"><span>${p.label}</span><b></b></div><input type="range" min="${p.min}" max="${p.max}" step="${p.step}">`;
      const r = w.querySelector('input'), b = w.querySelector('b'), show = () => b.textContent = f1(p.get(plant), p.step < 1 ? (p.step < 0.1 ? 2 : 1) : 0) + ' ' + p.unit;
      r.value = p.get(plant); show(); r.addEventListener('input', () => { p.set(plant, +r.value); show(); });
      w._sync = () => { if (document.activeElement !== r) { r.value = p.get(plant); show(); } };
    } else if (p.type === 'toggle') {
      w.innerHTML = `<label class="tog"><input type="checkbox"><i></i><span>${p.label}</span></label>`;
      const c = w.querySelector('input'); c.checked = !!p.get(plant); c.addEventListener('change', () => p.set(plant, c.checked));
      w._sync = () => { c.checked = !!p.get(plant); };
    } else if (p.type === 'select') {
      w.innerHTML = `<div class="ipl"><span>${p.label}</span></div><div class="seg"></div>`;
      const sg = w.querySelector('.seg'); p.options.forEach(([v, t]) => { const b = document.createElement('button'); b.textContent = t; b.dataset.v = v; b.addEventListener('click', () => { p.set(plant, v); w._sync(); }); sg.appendChild(b); });
      w._sync = () => sg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === p.get(plant)));
      w._sync();
    }
    box.appendChild(w);
  });
  $('iHmi').hidden = !LOOP_OF[id];
  refreshInspector();
}
function refreshInspector() {
  if (!state.sel) return;
  const C = COMPONENTS[state.sel];
  const html = C.live(plant).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  if ($('iLive')._h !== html) { $('iLive').innerHTML = html; $('iLive')._h = html; }
  $('iParams').querySelectorAll('.ip').forEach(w => w._sync && w._sync());
}
$('iClose').addEventListener('click', () => selectComp(null));
$('iHmi').addEventListener('click', () => { const l = LOOP_OF[state.sel]; if (l) { hmi.select('loop', l); setMode('hmi'); } });

// Seleção por clique na cena (ignora arrasto da câmera)
let down = null;
const cv = scene.renderer.domElement;
cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
cv.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) selectComp(scene.pick(e.clientX, e.clientY)); down = null; });
cv.addEventListener('pointermove', e => { if (e.buttons) return; const id = scene.pick(e.clientX, e.clientY); cv.style.cursor = id && COMPONENTS[id] ? 'pointer' : 'grab'; });
scene.controls.addEventListener('start', () => { state.camAuto = false; });

// ---------- Opções ----------
$('tgXray').addEventListener('change', e => scene.setXray(e.target.checked));
$('tgLabels').addEventListener('change', e => { state.labels = e.target.checked; });

// ---------- Painel de indicadores ----------
const kpiDefs = [['TT-101', () => f1(plant.s.T1m) + ' °C', 'Aquecimento'], ['TT-103', () => f1(plant.s.T3m) + ' °C', 'Mistura'], ['FT-101', () => f1(plant.s.F1m, 0) + ' L/h', 'Linha 1'], ['FT-102', () => f1(plant.s.F2m, 0) + ' L/h', 'Linha 2'], ['EH-101', () => f1(plant.s.P / 1000, 2) + ' kW', 'Potência'], ['LT-103', () => f1(plant.s.h3m * 100) + ' cm', 'Nível']];
$('kpi').innerHTML = `<div class="kh"><b>Processo</b><span id="kClock"></span></div>` + kpiDefs.map(([t, , s], i) => `<div class="kr"><span>${t}<small>${s}</small></span><b id="k${i}"></b></div>`).join('') + `<div class="kal" id="kAl"></div>`;
function updateKpi() {
  kpiDefs.forEach(([, f], i) => $('k' + i).textContent = f());
  const t = Math.floor(plant.t); $('kClock').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const a = plant.alarms[0]; $('kAl').className = 'kal' + (a ? ' p-' + a.pri : ''); $('kAl').textContent = a ? `${a.tag} · ${a.msg}` : 'Sem alarmes ativos';
}

// ---------- Laço principal ----------
let acc = 0, uiT = 0, simT = 0;
const base = { pos: scene.camera.position.clone(), target: scene.controls.target.clone() };
let lastE = 0;
function camRig() {
  // Afasta a câmera proporcionalmente à desmontagem, preservando o zoom escolhido pelo usuário
  const e = scene.explode; if (e === lastE) return;
  const k = (1 + 0.5 * e / 5) / (1 + 0.5 * lastE / 5); lastE = e;
  const c = scene.camera, tg = scene.controls.target, v = c.position.clone().sub(tg).multiplyScalar(k);
  tg.y = base.target.y + 0.3 * e / 5; tg.x = base.target.x + 0.2 * e / 5; c.position.copy(tg).add(v);
}
function stepTeardown(dt) {
  if (state.playing) {
    state.playT += dt;
    const e = Math.min(5, state.playT / 1.6); state.explode = e;
    if (e >= 5) { state.playing = false; }
  } else if (state.target !== null) {
    const d = state.target - state.explode, s = Math.sign(d) * Math.min(Math.abs(d), dt / 1.4 * 1.2 + Math.abs(d) * dt * 1.5);
    state.explode += s; if (Math.abs(state.target - state.explode) < 0.002) { state.explode = state.target; state.target = null; }
  }
  if (scene.explode !== state.explode) scene.setExplode(state.explode);
  $('tdRange').value = state.explode;
  const [a, b] = stageInfo(state.explode); $('tdStage').textContent = a; $('tdHint').textContent = b;
  $('tdPlay').classList.toggle('on', state.playing);
  ticks.querySelectorAll('button').forEach((t, i) => t.classList.toggle('on', state.explode > i + 0.5));
}
function frame(dt) {
  dt = clamp(dt, 0, 0.1);
  // simulação com passo fixo de 0,1 s
  acc += dt * state.speed; let n = 0; while (acc >= 0.1 && n < 1200) { plant.step(0.1); acc -= 0.1; n++; }
  simT += dt;
  if (state.mode === 'hmi') { uiT += dt; if (uiT > 0.1 || GIF) { hmi.update(); uiT = 0; } return; }
  stepTeardown(dt); camRig();
  scene.update(dt, plant, simT); scene.render();
  updateLabels();
  uiT += dt; if (uiT > 0.2 || GIF) { updateKpi(); refreshInspector(); uiT = 0; hmi.record(); }
}

// ---------- Inicialização ----------
let initMode = 'teardown'; try { initMode = localStorage.getItem('pd3-mode') || 'teardown'; } catch { }
if (['teardown', 'op', 'hmi'].indexOf(initMode) < 0) initMode = 'teardown';
setMode(initMode); scene.setXray(true); scene.setExplode(0); updateKpi();

if (!GIF) {
  let last = performance.now();
  const loop = now => { const dt = Math.max(0, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
} else {
  // Modo de captura determinístico para gerar as animações dos slides
  const cap = $('capcap'); cap.hidden = true;
  $('capDots').innerHTML = STAGES.map(() => '<i></i>').join('');
  if (GIF === 'teardown') {
    setMode('teardown'); state.camAuto = false; state.speed = 1;
    const T = 16, bp = base.pos.clone().sub(base.target);
    window.__frame = (dt) => {
      simT += dt; const t = simT % T;
      // 0-1,2 montada | 1,2-10,2 desmonta | 10,2-13 explodida | 13-15,2 monta | 15,2-16 montada
      let e = 0; if (t < 1.2) e = 0; else if (t < 10.2) e = (t - 1.2) / 9 * 5; else if (t < 13) e = 5; else if (t < 15.2) { const u = (t - 13) / 2.2; e = 5 * (1 - (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)); } else e = 0;
      state.explode = e; state.target = null; state.playing = false; scene.setExplode(e);
      const az = Math.sin(t / T * Math.PI * 2) * 0.28, r = 1 + 0.5 * e / 5;
      const v = bp.clone().applyAxisAngle({ x: 0, y: 1, z: 0 }, az).multiplyScalar(r);
      scene.controls.target.set(base.target.x + 0.2 * e / 5, base.target.y + 0.22 * e / 5, base.target.z);
      scene.camera.position.copy(scene.controls.target).add(v); scene.camera.lookAt(scene.controls.target);
      acc += dt; while (acc >= 0.1) { plant.step(0.1); acc -= 0.1; }
      scene.update(dt, plant, simT); scene.composer.render();
      updateLabels();
      const k = e < 0.05 ? 0 : clamp(Math.ceil(e - 0.45), 1, 5);
      $('capStage').textContent = k ? `Etapa ${k} de 5 · ${STAGES[k - 1]}` : 'Planta montada';
      $('capDots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < k));
    };
  } else if (GIF === 'hmi') {
    setMode('hmi'); state.speed = 30;
    window.__scenario = i => SCENARIOS[i].run(plant);
    window.__frame = (dt) => { acc += dt * state.speed; while (acc >= 0.1) { plant.step(0.1); acc -= 0.1; } hmi.update(); };
    window.__hmi = hmi; window.__plant = plant;
  } else if (GIF === 'op') {
    setMode('op'); state.camAuto = false;
    window.__frame = (dt) => { frame(dt); };
  }
  window.__labels = () => activeLabels.map(k => { const L = labelEls[k], b = L.box.getBoundingClientRect(); return { k, t: L.t.textContent, s: L.s.textContent, box: [b.left, b.top, b.width, b.height] }; });
  window.__ready = true;
}
window.__plant = plant; window.__scene = scene;
