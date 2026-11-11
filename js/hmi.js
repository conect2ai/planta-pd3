// Supervisório no estilo ISA-101 (alto desempenho): cinza neutro, cor somente para condição anormal,
// indicadores analógicos com faixa normal, faceplates das malhas, tendência e lista de alarmes.
const f1 = (v, d = 1) => Number(v).toFixed(d).replace('.', ',');
const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mmss = t => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
const PRI = { crit: ['Crítica', 'crit'], high: ['Alta', 'high'], med: ['Média', 'med'] };

export class HMI {
  constructor(el, plant, ctl) {
    this.el = el; this.P = plant; this.ctl = ctl; this.sel = { kind: 'loop', id: 'TIC103' };
    this.window = 600; this.acked = new Set();
    el.innerHTML = `
      <div class="hmi-head">
        <div class="hmi-title"><b>PD3</b><span>Supervisório · Visão geral do processo</span></div>
        <div class="hmi-banner" id="hBanner"><span class="pri-shape"></span><span class="txt">Sem alarmes ativos</span></div>
        <div class="hmi-ctrl">
          <label>Cenário <select id="hScen"><option value="">Escolher…</option></select></label>
          <span class="clock" id="hClock">00:00</span>
          <button class="estop" id="hEstop" title="Parada de emergência">EMERGÊNCIA</button>
        </div>
      </div>
      <div class="hmi-body">
        <section class="hmi-syn"><svg id="hSvg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet"></svg></section>
        <section class="hmi-side">
          <div class="fps" id="hFps"></div>
          <div class="detail" id="hDetail"></div>
        </section>
        <section class="hmi-trend">
          <div class="tr-head"><b id="hTrTitle">Tendência</b><span class="lg"><i class="pv"></i>PV <i class="sp"></i>SP <i class="out"></i>Saída (%)</span><div class="seg sm" id="hWin"></div></div>
          <canvas id="hTrend"></canvas>
        </section>
        <section class="hmi-alarms">
          <div class="tr-head"><b>Alarmes e eventos</b><button class="btn sm" id="hAck">Reconhecer</button></div>
          <div class="al-list" id="hAl"></div>
        </section>
      </div>`;
    this.$ = id => el.querySelector('#' + id);
    this.buildSyn(); this.buildFaceplates(); this.buildControls(); this.renderDetail();
    this.$('hTrend').parentElement && new ResizeObserver(() => this.sizeTrend()).observe(this.$('hTrend').parentElement);
  }

  // ---------- Sinóptico ----------
  s(tag, attrs, parent, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; (parent || this.svg).appendChild(e); return e; }
  line(pts, cls = 'pl', parent) { return this.s('polyline', { points: pts.map(p => p.join(',')).join(' '), class: cls }, parent); }
  bubble(x, y, a, b, opts = {}) {
    const g = this.s('g', { class: 'bub' + (opts.ctl ? ' ctl' : '') + (opts.click ? ' clk' : ''), transform: `translate(${x},${y})` });
    this.s('circle', { r: 19 }, g); if (opts.ctl) this.s('line', { x1: -19, x2: 19, y1: 0, y2: 0 }, g);
    this.s('text', { y: opts.ctl ? -5 : -3, class: 't1' }, g, a); this.s('text', { y: opts.ctl ? 13 : 11, class: 't2' }, g, b);
    if (opts.click) g.addEventListener('click', opts.click); return g;
  }
  vbox(x, y, unit, w = 74, anchor = 'start') {
    const g = this.s('g', { class: 'vb', transform: `translate(${x},${y})` });
    const r = this.s('rect', { x: anchor === 'end' ? -w : 0, y: -11, width: w, height: 22, rx: 2 }, g);
    const v = this.s('text', { x: (anchor === 'end' ? -w : 0) + w - 26, y: 5, class: 'v' }, g, '--');
    this.s('text', { x: (anchor === 'end' ? -w : 0) + w - 22, y: 5, class: 'u' }, g, unit);
    return { g, r, v };
  }
  // Indicador analógico móvel: barra com faixa normal, ponteiro de PV e marca de SP
  analog(x, y, lo, hi, nlo, nhi, w = 120) {
    const g = this.s('g', { class: 'ai', transform: `translate(${x},${y})` });
    this.s('rect', { x: 0, y: 0, width: w, height: 10, class: 'bg' }, g);
    this.s('rect', { x: (nlo - lo) / (hi - lo) * w, y: 0, width: (nhi - nlo) / (hi - lo) * w, height: 10, class: 'nr' }, g);
    const sp = this.s('rect', { x: 0, y: -3, width: 2, height: 16, class: 'sp' }, g);
    const pv = this.s('path', { d: 'M0,10 l-6,9 h12 z', class: 'pv' }, g);
    this.s('text', { x: 0, y: -5, class: 'sc' }, g, String(lo)); this.s('text', { x: w, y: -5, class: 'sc', 'text-anchor': 'end' }, g, String(hi));
    return { set: (v, s) => { pv.setAttribute('transform', `translate(${clamp((v - lo) / (hi - lo), 0, 1) * w},0)`); if (s !== undefined) sp.setAttribute('x', clamp((s - lo) / (hi - lo), 0, 1) * w - 1); }, g };
  }
  valveSym(x, y, rot, onclick) {
    const g = this.s('g', { class: 'valve clk', transform: `translate(${x},${y}) rotate(${rot})` });
    this.s('path', { d: 'M-14,-9 L14,9 L14,-9 L-14,9 Z', class: 'body' }, g);
    this.s('line', { x1: 0, y1: 0, x2: 0, y2: -18, class: 'stem' }, g);
    this.s('path', { d: 'M-11,-18 A11,9 0 0 1 11,-18 Z', class: 'act' }, g);
    if (onclick) g.addEventListener('click', onclick); return g;
  }
  pumpSym(x, y, onclick) {
    const g = this.s('g', { class: 'pump clk', transform: `translate(${x},${y})` });
    const c = this.s('circle', { r: 21, class: 'body' }, g);
    this.s('path', { d: 'M-8,-13 L15,0 L-8,13 Z', class: 'tri' }, g);
    if (onclick) g.addEventListener('click', onclick); return { g, c };
  }
  tank(x, y, w, h, cls = '') {
    const g = this.s('g', { class: 'tank ' + cls });
    const clip = this.s('clipPath', { id: 'clip' + x }, g); this.s('rect', { x, y, width: w, height: h, rx: 10 }, clip);
    const fill = this.s('rect', { x, y, width: w, height: h, class: 'liq', 'clip-path': `url(#clip${x})` }, g);
    this.s('rect', { x, y, width: w, height: h, rx: 10, class: 'wall' }, g);
    return { g, fill };
  }
  buildSyn() {
    const svg = this.svg = this.$('hSvg'), R = this.R = {}, sel = (kind, id) => () => this.select(kind, id);
    this.s('rect', { x: 0, y: 0, width: 1000, height: 600, class: 'synbg' });
    // Reservatório
    this.s('rect', { x: 110, y: 525, width: 820, height: 50, rx: 4, class: 'eq' });
    this.s('text', { x: 125, y: 556, class: 'eqt' }, null, 'TQ-100 · Reservatório');
    // ----- Linha 1 -----
    R.l1 = [this.line([[250, 525], [250, 491]]), this.line([[250, 449], [250, 110], [470, 110], [470, 150]])];
    R.fi1 = this.s('rect', { x: 242, y: 170, width: 16, height: 40, rx: 3, class: 'rot' });
    this.s('text', { x: 234, y: 194, class: 'tg', 'text-anchor': 'end' }, null, 'FI-101');
    R.fcv1 = this.valveSym(250, 300, -90, sel('loop', 'FIC101'));
    this.s('text', { x: 236, y: 280, class: 'tg', 'text-anchor': 'end' }, null, 'FCV-101'); R.v1 = this.s('text', { x: 236, y: 326, class: 'pct', 'text-anchor': 'end' }, null, '');
    this.bubble(120, 300, 'FIC', '101', { ctl: true, click: sel('loop', 'FIC101') });
    this.line([[139, 300], [232, 300]], 'sig');
    this.line([[250, 395], [199, 395]], 'imp'); this.bubble(180, 395, 'FT', '101', { click: sel('loop', 'FIC101') });
    this.line([[120, 319], [120, 395], [161, 395]], 'sig');
    R.ft1 = this.vbox(138, 432, 'L/h', 84);
    R.p1 = this.pumpSym(250, 470, sel('eq', 'p101'));
    this.s('text', { x: 278, y: 500, class: 'tg' }, null, 'P-101'); R.pTxt1 = this.s('text', { x: 278, y: 514, class: 'tg sub' }, null, '');
    // ----- Tanque de aquecimento -----
    R.t1 = this.tank(340, 150, 160, 180);
    this.s('text', { x: 395, y: 141, class: 'eqt', 'text-anchor': 'middle' }, null, 'TQ-101 · Aquecimento');
    R.ai1 = this.analog(370, 175, 20, 80, 35, 55, 100);
    R.heat = this.s('path', { d: 'M358,314 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12 l10,-12 l10,12', class: 'heater clk' }); R.heat.addEventListener('click', sel('eq', 'heater'));
    this.s('text', { x: 420, y: 352, class: 'tg', 'text-anchor': 'middle' }, null, 'EH-101 · Resistências');
    R.pw = this.vbox(380, 375, 'kW', 80);
    this.line([[340, 250], [319, 250]], 'imp'); this.bubble(300, 250, 'TT', '101', { click: sel('loop', 'TIC101') });
    R.tt1 = this.vbox(263, 214, '°C', 74);
    this.bubble(300, 430, 'TIC', '101', { ctl: true, click: sel('loop', 'TIC101') });
    this.line([[300, 269], [300, 411]], 'sig'); this.line([[319, 430], [420, 430], [420, 386]], 'sig');
    this.s('rect', { x: 330, y: 456, width: 30, height: 18, rx: 2, class: 'ffb' }); this.s('text', { x: 345, y: 469, class: 'fft', 'text-anchor': 'middle' }, null, 'FF');
    this.line([[199, 400], [330, 465]], 'sig ff'); this.line([[345, 456], [312, 445]], 'sig');
    R.ffTag = this.s('text', { x: 368, y: 469, class: 'tg' }, null, '');
    this.s('text', { x: 368, y: 483, class: 'tg sub' }, null, 'pela vazão e pela TT-102');
    // ----- Transbordo -----
    R.ov = this.line([[500, 172], [545, 172], [545, 235], [580, 235]]);
    this.s('text', { x: 507, y: 164, class: 'tg' }, null, 'Transbordo');
    // ----- Tanque de mistura -----
    R.t3 = this.tank(580, 210, 140, 260);
    this.s('text', { x: 640, y: 201, class: 'eqt', 'text-anchor': 'middle' }, null, 'TQ-103 · Mistura');
    R.ai3 = this.analog(600, 233, 20, 60, 30, 42, 100);
    R.outs = [0.10, 0.25, 0.38].map((h, i) => {
      const y = 470 - h / 0.70 * 260; this.line([[580, y], [530, y]]);
      const v = this.valveSym(555, y, 0, () => { this.P.p.outlets[i].open = !this.P.p.outlets[i].open; this.select('eq', 'outlets'); });
      v.setAttribute('transform', `translate(555,${y}) scale(0.7)`); return v;
    });
    this.line([[530, 470 - 0.38 / 0.70 * 260], [530, 525]]);
    this.s('text', { x: 538, y: 500, class: 'tg' }, null, 'HV-103'); this.s('text', { x: 538, y: 514, class: 'tg sub' }, null, 'saídas A, B, C');
    this.line([[720, 270], [741, 270]], 'imp'); this.bubble(760, 270, 'TT', '103', { click: sel('loop', 'TIC103') });
    R.tt3 = this.vbox(723, 234, '°C', 74);
    this.bubble(760, 365, 'TIC', '103', { ctl: true, click: sel('loop', 'TIC103') });
    this.line([[760, 289], [760, 346]], 'sig');
    this.line([[779, 365], [940, 365], [940, 319]], 'sig cas'); this.s('text', { x: 905, y: 382, class: 'tg sub', 'text-anchor': 'middle' }, null, 'cascata');
    this.line([[720, 440], [741, 440]], 'imp'); this.bubble(760, 440, 'LT', '103', { click: sel('eq', 'outlets') });
    R.lt = this.vbox(723, 478, 'cm', 74);
    R.air = this.s('g', { class: 'air clk' }); R.air.addEventListener('click', () => { this.P.p.air = !this.P.p.air; this.select('eq', 'air'); });
    for (let i = 0; i < 5; i++) this.s('circle', { cx: 608 + i * 21, cy: 458, r: 3 }, R.air);
    this.s('text', { x: 672, y: 496, class: 'tg', 'text-anchor': 'middle' }, null, 'Agitação por ar'); R.airT = this.s('text', { x: 672, y: 510, class: 'tg sub', 'text-anchor': 'middle' }, null, '');
    // ----- Linha 2 -----
    R.l2 = [this.line([[860, 525], [860, 491]]), this.line([[860, 449], [860, 130], [700, 130], [700, 210]])];
    R.fi2 = this.s('rect', { x: 852, y: 165, width: 16, height: 40, rx: 3, class: 'rot' }); this.s('text', { x: 878, y: 189, class: 'tg' }, null, 'FI-102');
    this.line([[860, 245], [901, 245]], 'imp'); this.bubble(920, 245, 'TT', '102', { click: sel('loop', 'TIC101') });
    R.tt2 = this.vbox(942, 245, '°C', 58);
    R.fcv2 = this.valveSym(860, 300, 90, sel('loop', 'FIC102'));
    this.s('text', { x: 838, y: 296, class: 'tg', 'text-anchor': 'end' }, null, 'FCV-102'); R.v2 = this.s('text', { x: 838, y: 313, class: 'pct', 'text-anchor': 'end' }, null, '');
    this.bubble(940, 300, 'FIC', '102', { ctl: true, click: sel('loop', 'FIC102') });
    this.line([[921, 300], [878, 300]], 'sig');
    this.line([[860, 410], [901, 410]], 'imp'); this.bubble(920, 410, 'FT', '102', { click: sel('loop', 'FIC102') });
    this.line([[959, 410], [975, 410], [975, 300], [959, 300]], 'sig');
    R.ft2 = this.vbox(886, 446, 'L/h', 84);
    R.p2 = this.pumpSym(860, 470, sel('eq', 'p102'));
    this.s('text', { x: 832, y: 500, class: 'tg', 'text-anchor': 'end' }, null, 'P-102'); R.pTxt2 = this.s('text', { x: 832, y: 514, class: 'tg sub', 'text-anchor': 'end' }, null, '');
    this.s('rect', { x: 886, y: 480, width: 60, height: 22, rx: 2, class: 'eq clk' }).addEventListener('click', sel('eq', 'p102'));
    R.hz = this.s('text', { x: 916, y: 496, class: 'v', 'text-anchor': 'middle' }, null, '60 Hz');
    this.s('text', { x: 952, y: 496, class: 'tg sub' }, null, 'SC-102');
  }

  // ---------- Faceplates ----------
  buildFaceplates() {
    const box = this.$('hFps'); this.fp = {};
    Object.entries(this.P.loops).forEach(([k, L]) => {
      const d = document.createElement('div'); d.className = 'fp'; d.dataset.k = k;
      d.innerHTML = `<div class="fh"><b>${L.tag}</b><span class="md"></span></div><div class="fd">${L.desc}</div>
        <div class="fb"><div class="bar"><i class="o"></i><i class="p"></i><i class="s"></i></div>
        <div class="fv"><div class="pv"><span></span><small>${L.unit}</small></div><div class="r"><span>SP</span><b class="sp"></b></div><div class="r"><span>Saída</span><b class="out"></b></div></div></div>`;
      d.addEventListener('click', () => this.select('loop', k)); box.appendChild(d);
      this.fp[k] = { d, md: d.querySelector('.md'), pv: d.querySelector('.pv span'), sp: d.querySelector('.sp'), out: d.querySelector('.out'), bp: d.querySelector('.bar .p'), bs: d.querySelector('.bar .s'), bo: d.querySelector('.bar .o') };
    });
  }
  select(kind, id) { this.sel = { kind, id }; this.renderDetail(); if (this.ctl.onSelect) this.ctl.onSelect(kind, id); }

  num(label, val, unit, step, onset, disabled) {
    const w = document.createElement('label'); w.className = 'num' + (disabled ? ' dis' : '');
    w.innerHTML = `<span>${label}</span><div><button>−</button><input type="number" step="${step}" value="${val}" ${disabled ? 'disabled' : ''}><button>+</button><em>${unit}</em></div>`;
    const inp = w.querySelector('input'), [b1, b2] = w.querySelectorAll('button');
    const commit = v => { if (disabled) return; v = Math.round(v / step) * step; inp.value = +v.toFixed(4); onset(v); };
    inp.addEventListener('change', () => commit(parseFloat(inp.value) || 0));
    b1.addEventListener('click', e => { e.preventDefault(); commit(parseFloat(inp.value) - step); });
    b2.addEventListener('click', e => { e.preventDefault(); commit(parseFloat(inp.value) + step); });
    w._inp = inp; return w;
  }
  renderDetail() {
    const D = this.$('hDetail'); D.innerHTML = '';
    Object.entries(this.fp).forEach(([k, f]) => f.d.classList.toggle('sel', this.sel.kind === 'loop' && this.sel.id === k));
    const h = (t, s) => { const e = document.createElement('div'); e.className = 'dh'; e.innerHTML = `<b>${t}</b><span>${s}</span>`; D.appendChild(e); };
    this.live = {};
    if (this.sel.kind === 'loop') {
      const L = this.P.loops[this.sel.id], k = this.sel.id;
      h(L.tag + ' · Sintonia e operação', L.desc + (k === 'TIC103' ? ' · mestre da cascata' : k === 'FIC102' ? ' · escravo da cascata' : ''));
      const modes = document.createElement('div'); modes.className = 'seg modes';
      ['MAN', 'AUTO'].concat(L.casAllowed ? ['CAS'] : []).forEach(m => { const b = document.createElement('button'); b.textContent = m; b.classList.toggle('on', L.mode === m); b.addEventListener('click', () => { L.setMode(m); this.renderDetail(); }); modes.appendChild(b); });
      D.appendChild(modes);
      const grid = document.createElement('div'); grid.className = 'ngrid'; D.appendChild(grid);
      const spStep = L.unit === 'L/h' ? 10 : 0.5;
      this.live.sp = this.num('Setpoint', +L.sp.toFixed(1), L.unit, spStep, v => L.sp = clamp(v, L.lo, L.hi), L.mode === 'CAS'); grid.appendChild(this.live.sp);
      this.live.out = this.num('Saída', +L.out.toFixed(1), '%', 1, v => L.out = clamp(v, 0, 100), L.mode !== 'MAN'); grid.appendChild(this.live.out);
      grid.appendChild(this.num('Ganho Kc', L.kp, '', L.kp >= 2 ? 0.5 : 0.05, v => L.kp = Math.max(0, v)));
      grid.appendChild(this.num('Integral Ti', L.ti, 's', L.ti >= 20 ? 5 : 0.5, v => L.ti = Math.max(0, v)));
      grid.appendChild(this.num('Derivativo Td', L.td, 's', 1, v => L.td = Math.max(0, v)));
      const act = document.createElement('div'); act.className = 'kv'; act.innerHTML = `<span>Ação</span><b>${L.action === 'reverse' ? 'Reversa' : 'Direta'}</b>`; grid.appendChild(act);
      if (k === 'TIC101') {
        const ff = document.createElement('div'); ff.className = 'ffrow';
        ff.innerHTML = `<label class="tog"><input type="checkbox" ${L.ffOn ? 'checked' : ''}><i></i><span>Antecipativo pela vazão FT-101 e temperatura TT-102</span></label>`;
        ff.querySelector('input').addEventListener('change', e => { L.ffOn = e.target.checked; });
        D.appendChild(ff); grid.appendChild(this.num('Ganho do antecipativo', L.ffGain, '', 0.1, v => L.ffGain = clamp(v, 0, 2)));
      }
      const note = document.createElement('p'); note.className = 'note';
      note.textContent = { FIC101: 'Malha rápida de vazão. A válvula FCV-101 define quanta água entra no aquecimento.', FIC102: 'Em CAS, o setpoint vem da TIC-103. Perturbações na água fria, como a frequência do inversor, são corrigidas aqui antes de chegarem à temperatura.', TIC101: 'Controle por realimentação da temperatura do aquecimento atuando na potência. O antecipativo calcula a potência pelo balanço de energia e o PI corrige o resíduo.', TIC103: 'Mestre da cascata. Ação direta, pois para baixar a temperatura é preciso mais água fria.' }[k];
      D.appendChild(note);
    } else {
      const P = this.P, p = P.p, id = this.sel.id;
      const tog = (label, get, set) => { const e = document.createElement('label'); e.className = 'tog'; e.innerHTML = `<input type="checkbox" ${get() ? 'checked' : ''}><i></i><span>${label}</span>`; e.querySelector('input').addEventListener('change', ev => set(ev.target.checked)); D.appendChild(e); };
      if (id === 'p101') { h('P-101 · Bomba da linha 1', 'Partida direta'); tog('Bomba ligada', () => p.pump1On, v => p.pump1On = v); }
      if (id === 'p102') { h('P-102 · Bomba da linha 2', 'Acionada pelo inversor SC-102'); tog('Bomba ligada', () => p.pump2On, v => p.pump2On = v); const g = document.createElement('div'); g.className = 'ngrid'; g.appendChild(this.num('Frequência', p.invHz, 'Hz', 1, v => p.invHz = clamp(v, 20, 60))); D.appendChild(g); }
      if (id === 'outlets') { h('HV-103 · Saídas da mistura', 'A saída aberta define o nível de equilíbrio'); [10, 25, 38].forEach((c, i) => tog(`Saída a ${c} cm aberta`, () => p.outlets[i].open, v => p.outlets[i].open = v)); }
      if (id === 'air') { h('Agitação por ar', 'Homogeneíza o tanque de mistura'); tog('Agitação ligada', () => p.air, v => p.air = v); }
      if (id === 'heater') { h('EH-101 · Resistências', 'Intertravadas por vazão e temperatura'); const g = document.createElement('div'); g.className = 'ngrid'; g.appendChild(this.num('Vazão mínima', p.heaterInterlockLph, 'L/h', 10, v => p.heaterInterlockLph = clamp(v, 0, 300))); g.appendChild(this.num('Desarme', p.tripTemp, '°C', 1, v => p.tripTemp = clamp(v, 40, 95))); g.appendChild(this.num('Potência máxima', p.heaterMax, 'kW', 0.5, v => p.heaterMax = clamp(v, 1, 12))); D.appendChild(g); }
    }
  }

  buildControls() {
    const wn = this.$('hWin'); [[300, '5 min'], [600, '10 min'], [1800, '30 min']].forEach(([v, t]) => { const b = document.createElement('button'); b.textContent = t; b.dataset.v = v; b.classList.toggle('on', v === this.window); b.addEventListener('click', () => { this.window = v; wn.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.v === v)); }); wn.appendChild(b); });
    const sc = this.$('hScen'); (this.ctl.scenarios || []).forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.name; sc.appendChild(o); });
    sc.addEventListener('change', () => { if (sc.value !== '') this.ctl.runScenario(+sc.value); sc.value = ''; });
    this.$('hEstop').addEventListener('click', () => { this.P.p.estop = !this.P.p.estop; });
    this.$('hAck').addEventListener('click', () => this.P.alarms.forEach(a => this.acked.add(a.tag)));
  }

  record() { }
  clearHist() { }
  get hist() { return this.P.hist; }

  sizeTrend() { const c = this.$('hTrend'), r = c.getBoundingClientRect(), pr = Math.min(devicePixelRatio || 1, 2); c.width = Math.max(10, r.width * pr); c.height = Math.max(10, r.height * pr); this.pr = pr; }
  drawTrend() {
    const c = this.$('hTrend'), g = c.getContext('2d'), pr = this.pr || 1; if (!c.width) this.sizeTrend();
    const W = c.width / pr, H = c.height / pr; g.setTransform(pr, 0, 0, pr, 0, 0); g.clearRect(0, 0, W, H);
    const k = this.sel.kind === 'loop' ? this.sel.id : 'TIC103', L = this.P.loops[k];
    this.$('hTrTitle').textContent = 'Tendência · ' + L.tag;
    const ml = 44, mr = 40, mt = 8, mb = 20, pw = W - ml - mr, ph = H - mt - mb;
    const t1 = this.P.t, t0 = t1 - this.window, data = this.hist.filter(r => r.t >= t0);
    let lo = Infinity, hi = -Infinity; data.forEach(r => { lo = Math.min(lo, r[k][0], r[k][1]); hi = Math.max(hi, r[k][0], r[k][1]); });
    if (!isFinite(lo)) { lo = L.sp - 1; hi = L.sp + 1; }
    const span = Math.max(hi - lo, L.unit === 'L/h' ? 40 : 2); const mid = (hi + lo) / 2; lo = mid - span * 0.6; hi = mid + span * 0.6;
    const X = t => ml + (t - t0) / this.window * pw, Y = v => mt + (1 - (v - lo) / (hi - lo)) * ph, Yo = v => mt + (1 - v / 100) * ph;
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.fillStyle = '#8a929a'; g.font = '10px IBM Plex Mono, monospace';
    for (let i = 0; i <= 4; i++) { const y = mt + i / 4 * ph; g.beginPath(); g.moveTo(ml, y); g.lineTo(ml + pw, y); g.stroke(); const v = hi - i / 4 * (hi - lo); g.textAlign = 'right'; g.fillText(f1(v, L.unit === 'L/h' ? 0 : 1), ml - 6, y + 3); g.textAlign = 'left'; g.fillText(String(100 - i * 25), ml + pw + 6, y + 3); }
    const step = this.window / 5; for (let i = 0; i <= 5; i++) { const x = ml + i / 5 * pw; g.beginPath(); g.moveTo(x, mt); g.lineTo(x, mt + ph); g.stroke(); g.textAlign = 'center'; g.fillText(i === 5 ? 'agora' : '−' + Math.round((5 - i) * step / 60) + ' min', x, H - 6); }
    const plot = (idx, Yf, style, w, dash) => { g.beginPath(); data.forEach((r, i) => { const x = X(r.t), y = Yf(r[k][idx]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = style; g.lineWidth = w; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); };
    plot(2, Yo, 'rgba(160,168,176,0.55)', 1.2); plot(1, Y, '#3fd6f5', 1.4, [5, 4]); plot(0, Y, '#f2f5f6', 1.8);
  }

  update() {
    const P = this.P, s = P.s, p = P.p, L = P.loops, R = this.R;
    this.record();
    this.$('hClock').textContent = mmss(P.t);
    this.$('hEstop').classList.toggle('on', p.estop);
    // Sinóptico
    const run1 = p.pump1On && !p.estop, run2 = p.pump2On && !p.estop;
    R.p1.g.classList.toggle('run', run1); R.p2.g.classList.toggle('run', run2);
    R.pTxt1.textContent = run1 ? 'Ligada' : 'Desligada'; R.pTxt2.textContent = run2 ? 'Ligada' : 'Desligada';
    R.l1.forEach(l => l.classList.toggle('flow', s.F1 > 20)); R.l2.forEach(l => l.classList.toggle('flow', s.F2 > 20)); R.ov.classList.toggle('flow', s.F1 > 20);
    R.v1.textContent = f1(s.v1, 0) + ' %'; R.v2.textContent = f1(s.v2, 0) + ' %';
    R.ft1.v.textContent = f1(s.F1m, 0); R.ft2.v.textContent = f1(s.F2m, 0); R.tt1.v.textContent = f1(s.T1m); R.tt3.v.textContent = f1(s.T3m); R.tt2.v.textContent = f1(s.T2m); R.lt.v.textContent = f1(s.h3m * 100);
    R.pw.v.textContent = f1(s.P / 1000, 2); R.hz.textContent = f1(run2 ? p.invHz : 0, 0) + ' Hz';
    R.heat.classList.toggle('on', s.P > 100); R.heat.classList.toggle('lock', !s.heaterOk);
    R.t1.fill.setAttribute('y', 150 + 180 * 0.12); R.t1.fill.setAttribute('height', 180 * 0.88);
    const lv = clamp(s.h3 / 0.70, 0, 1); R.t3.fill.setAttribute('y', 210 + 260 * (1 - lv)); R.t3.fill.setAttribute('height', 260 * lv);
    R.ai1.set(s.T1m, L.TIC101.sp); R.ai3.set(s.T3m, L.TIC103.sp);
    R.outs.forEach((v, i) => v.classList.toggle('open', p.outlets[i].open));
    R.air.classList.toggle('on', p.air); R.airT.textContent = p.air ? 'Ligada' : 'Desligada';
    R.ffTag.textContent = L.TIC101.ffOn ? 'Antecipativo ligado' : 'Antecipativo desligado';
    // Alarmes nos valores (cor somente quando anormal)
    const st = P.alarmState;
    R.tt1.g.classList.toggle('a-high', !!st['TAH-101']); R.tt1.g.classList.toggle('a-crit', !!st['TAHH-101']);
    R.ft1.g.classList.toggle('a-high', !!st['FAL-101']); R.lt.g.classList.toggle('a-high', !!(st['LAH-103'])); R.lt.g.classList.toggle('a-med', !!st['LAL-103']);
    // Faceplates
    Object.entries(L).forEach(([k, l]) => {
      const f = this.fp[k], span = l.hi - l.lo, d = l.unit === 'L/h' ? 0 : 1;
      f.pv.textContent = f1(l.pv, d); f.sp.textContent = f1(l.sp, d) + ' ' + l.unit; f.out.textContent = f1(l.out) + ' %';
      f.md.textContent = l.mode; f.md.className = 'md m-' + l.mode;
      f.bp.style.bottom = clamp((l.pv - l.lo) / span * 100, 0, 100) + '%'; f.bs.style.bottom = clamp((l.sp - l.lo) / span * 100, 0, 100) + '%'; f.bo.style.height = clamp(l.out, 0, 100) + '%';
    });
    if (this.sel.kind === 'loop' && this.live.sp) {
      const l = L[this.sel.id];
      if (document.activeElement !== this.live.sp._inp) this.live.sp._inp.value = +l.sp.toFixed(1);
      if (document.activeElement !== this.live.out._inp) this.live.out._inp.value = +l.out.toFixed(1);
      const m = this.$('hDetail').querySelectorAll('.modes button'); m.forEach(b => b.classList.toggle('on', b.textContent === l.mode));
      this.live.sp.classList.toggle('dis', l.mode === 'CAS'); this.live.sp._inp.disabled = l.mode === 'CAS';
      this.live.out.classList.toggle('dis', l.mode !== 'MAN'); this.live.out._inp.disabled = l.mode !== 'MAN';
    }
    // Alarmes
    P.alarms.forEach(a => { if (!this.acked.has(a.tag)) { } }); Array.from(this.acked).forEach(t => { if (!st[t]) this.acked.delete(t); });
    const ban = this.$('hBanner'), top = P.alarms.slice().sort((a, b) => ['crit', 'high', 'med'].indexOf(a.pri) - ['crit', 'high', 'med'].indexOf(b.pri))[0];
    ban.className = 'hmi-banner' + (top ? ' p-' + top.pri + (this.acked.has(top.tag) ? '' : ' blink') : '');
    ban.querySelector('.txt').textContent = top ? `${top.tag}  ${top.msg}` + (P.alarms.length > 1 ? `  (+${P.alarms.length - 1})` : '') : 'Sem alarmes ativos';
    const rows = P.alarms.map(a => `<div class="ar p-${a.pri}${this.acked.has(a.tag) ? '' : ' un'}"><span class="pri-shape"></span><b>${a.tag}</b><span class="m">${a.msg}</span><em>${PRI[a.pri][0]}</em></div>`)
      .concat(P.events.slice(0, 14).map(e => `<div class="ev"><span class="tm">${mmss(e.t)}</span><b>${e.tag}</b><span class="m">${e.kind === 'ativo' ? 'Ativou' : 'Normalizou'}</span></div>`));
    const html = rows.join('') || '<p class="empty">Nenhum alarme ou evento registrado</p>';
    if (html !== this._alHtml) { this.$('hAl').innerHTML = html; this._alHtml = html; }
    this.drawTrend();
  }
}
