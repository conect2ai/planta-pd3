// Modelo dinâmico da planta didática PD3 (tanque de aquecimento, tanque de mistura e reservatório)
// Ordens de grandeza calibradas com os ensaios publicados (UFV): ~2,1 °C/kW e ~240 s a 400 L/h no aquecimento,
// ganho de ~-0,007 °C/(L/h) e ~60-90 s no tanque de mistura. Tags e demais parâmetros são ilustrativos.

const RHO_C = 1000 * 4186;          // J/(m³·K)
const LH = 1 / 3.6e6;               // (L/h) -> m³/s
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class PID {
  constructor(o) {
    Object.assign(this, { tag: '', desc: '', unit: '', lo: 0, hi: 100, sp: 50, kp: 1, ti: 60, td: 0, action: 'reverse', mode: 'AUTO', out: 0, outLo: 0, outHi: 100, ff: 0, ffOn: false, ffGain: 1, casAllowed: false }, o);
    this.i = this.out; this.prevPv = null; this.pv = 0;
  }
  pct(v) { return (v - this.lo) / (this.hi - this.lo) * 100; }
  step(pv, dt, casSp) {
    this.pv = pv;
    if (this.mode === 'CAS' && casSp !== undefined) this.sp = clamp(casSp, this.lo, this.hi);
    if (this.mode === 'MAN') { this.i = this.out - (this.ffOn ? this.ff : 0); this.prevPv = pv; return this.out; }
    const s = this.action === 'reverse' ? 1 : -1;
    const e = s * (this.pct(this.sp) - this.pct(pv));
    const dpv = this.prevPv === null ? 0 : s * -(this.pct(pv) - this.pct(this.prevPv)) / dt;
    this.prevPv = pv;
    const p = this.kp * e, d = this.kp * this.td * dpv;
    const ff = this.ffOn ? this.ff : 0;
    let u = p + this.i + d + ff;
    // integral com anti-windup por limitação condicional
    const sat = (u >= this.outHi && e > 0) || (u <= this.outLo && e < 0);
    if (!sat && this.ti > 0) this.i += this.kp * e * dt / this.ti;
    this.i = clamp(this.i, this.outLo - 100, this.outHi + 100);
    u = p + this.i + d + ff;
    this.out = clamp(u, this.outLo, this.outHi);
    return this.out;
  }
  setMode(m) { if (m === 'CAS' && !this.casAllowed) return; this.mode = m; }
}

export class Plant {
  constructor() { this.reset(); }
  reset() {
    this.t = 0;
    // Parâmetros ajustáveis pelos componentes
    this.p = {
      tAmb: 27, tCold: 27,
      pump1On: true, pump2On: true, invHz: 60,
      fmax1: 1000, fmax2: 1000, char1: 'eq', char2: 'eq', stroke1: 4, stroke2: 4,
      heaterMax: 8, heaterInterlockLph: 60, tripTemp: 72,
      v1L: 27, uaHeat: 12,
      mixArea: 0.0342, mixHeight: 0.70, outlets: [{ h: 0.10, open: false }, { h: 0.25, open: false }, { h: 0.38, open: true }], kOut: 1.11e-3,
      air: true,
      tt: { noise: 0.05, lag: 8, bias: 0, freeze: false }, ft: { noise: 2, lag: 1.5, bias: 0 }, lt: { noise: 0.002, lag: 1 },
      estop: false
    };
    this.s = { T1: 27, T3: 27, h3: 0.39, F1: 0, F2: 0, P: 0, v1: 0, v2: 0, T1m: 27, T2m: 27, T3m: 27, F1m: 0, F2m: 0, h3m: 0.39, Fout: 0, heaterOk: true, tripped: false };
    this.loops = {
      FIC101: new PID({ tag: 'FIC-101', desc: 'Vazão para o aquecimento', unit: 'L/h', lo: 0, hi: 1000, sp: 250, kp: 0.35, ti: 2.5, out: 40 }),
      FIC102: new PID({ tag: 'FIC-102', desc: 'Vazão de água fria', unit: 'L/h', lo: 0, hi: 1000, sp: 250, kp: 0.35, ti: 2.5, out: 30, casAllowed: true, mode: 'CAS' }),
      TIC101: new PID({ tag: 'TIC-101', desc: 'Temperatura do aquecimento', unit: '°C', lo: 0, hi: 100, sp: 45, kp: 6, ti: 160, td: 0, out: 35 }),
      TIC103: new PID({ tag: 'TIC-103', desc: 'Temperatura da mistura', unit: '°C', lo: 0, hi: 100, sp: 36, kp: 12, ti: 70, action: 'direct', out: 30 })
    };
    this.loops.TIC101.ffOn = true;
    this.alarms = []; this.events = []; this.alarmState = {};
    this.noiseSeed = 1;
    this.hist = []; this.lastRec = null;
    this.warm(2400);
  }
  // Pré-aquecimento silencioso até o regime permanente, para a página abrir com a planta já operando
  warm(sec) { for (let i = 0; i < sec / 0.1; i++) this.step(0.1); this.t = 0; this.hist.forEach(r => r.t -= sec); this.lastRec = 0; this.events = []; this.alarmState = {}; this.checkAlarms(); this.events = []; }
  rnd() { this.noiseSeed = (this.noiseSeed * 16807) % 2147483647; return (this.noiseSeed / 2147483647 - 0.5) * 2; }
  valveChar(u, type) { const x = clamp(u / 100, 0, 1); return type === 'eq' ? (Math.pow(30, x - 1) - 1 / 30) / (1 - 1 / 30) : x; }

  step(dt) {
    const p = this.p, s = this.s, L = this.loops;
    this.t += dt;
    // Controladores (amostragem igual ao passo)
    const u1 = L.FIC101.step(s.F1m, dt);
    // Antecipativo: potência para levar a vazão medida de T2 até o SP, mais perdas
    const tic = L.TIC101;
    tic.ff = clamp((s.F1m * LH * RHO_C * (tic.sp - s.T2m) + p.uaHeat * (tic.sp - p.tAmb)) / (p.heaterMax * 1000) * 100 * tic.ffGain, 0, 100);
    const uh = tic.step(s.T1m, dt);
    const casSp = L.TIC103.step(s.T3m, dt) / 100 * 1000;
    const u2 = L.FIC102.step(s.F2m, dt, casSp);

    // Válvulas com tempo de curso
    s.v1 += clamp(u1 - s.v1, -100 * dt / p.stroke1, 100 * dt / p.stroke1);
    s.v2 += clamp(u2 - s.v2, -100 * dt / p.stroke2, 100 * dt / p.stroke2);
    const run1 = p.pump1On && !p.estop, run2 = p.pump2On && !p.estop;
    const f1t = run1 ? p.fmax1 * this.valveChar(s.v1, p.char1) : 0;
    const f2t = run2 ? p.fmax2 * this.valveChar(s.v2, p.char2) * (p.invHz / 60) : 0;
    s.F1 += (f1t - s.F1) * Math.min(1, dt / 1.2);
    s.F2 += (f2t - s.F2) * Math.min(1, dt / 1.2);

    // Resistência via módulo a tiristor (4-20 mA -> 0-Pmax), com intertravamentos
    const flowOk = s.F1 > p.heaterInterlockLph;
    if (s.T1 > p.tripTemp) s.tripped = true;
    if (s.tripped && s.T1 < p.tripTemp - 8) s.tripped = false;
    s.heaterOk = flowOk && !s.tripped && !p.estop;
    const pTarget = s.heaterOk ? uh / 100 * p.heaterMax * 1000 : 0;
    s.P += (pTarget - s.P) * Math.min(1, dt / 1.0);

    // Tanque de aquecimento (sempre cheio, transborda para a mistura)
    const q1 = s.F1 * LH, q2 = s.F2 * LH, V1 = p.v1L / 1000;
    s.T1 += (RHO_C * q1 * (p.tCold - s.T1) + s.P - p.uaHeat * (s.T1 - p.tAmb)) / (RHO_C * V1) * dt;

    // Tanque de mistura: nível e temperatura
    let qout = 0; p.outlets.forEach(o => { if (o.open && s.h3 > o.h) qout += p.kOut * Math.sqrt(s.h3 - o.h); });
    if (s.h3 >= p.mixHeight) qout = Math.max(qout, q1 + q2); // transbordo
    const vol = Math.max(0.0005, p.mixArea * s.h3);
    s.h3 = clamp(s.h3 + (q1 + q2 - qout) / p.mixArea * dt, 0.005, p.mixHeight);
    s.Fout = qout / LH;
    const mixLoss = 3 * (s.T3 - p.tAmb);
    s.T3 += ((q1 * (s.T1 - s.T3) + q2 * (p.tCold - s.T3)) / vol - mixLoss / (RHO_C * vol)) * dt;

    // Transmissores: atraso de primeira ordem, ruído e polarização
    const lag = (m, v, tau) => m + (v - m) * Math.min(1, dt / Math.max(0.05, tau));
    const tt = p.tt, mixLag = tt.lag + (p.air ? 0 : 25);
    if (!tt.freeze) {
      s.T1m = lag(s.T1m, s.T1 + tt.bias, tt.lag) + this.rnd() * tt.noise * 0.3;
      s.T3m = lag(s.T3m, s.T3 + tt.bias, mixLag) + this.rnd() * tt.noise * 0.3;
    }
    s.T2m = lag(s.T2m, p.tCold, tt.lag) + this.rnd() * tt.noise * 0.3;
    s.F1m = Math.max(0, lag(s.F1m, s.F1 + p.ft.bias, p.ft.lag) + this.rnd() * p.ft.noise);
    s.F2m = Math.max(0, lag(s.F2m, s.F2 + p.ft.bias, p.ft.lag) + this.rnd() * p.ft.noise);
    s.h3m = lag(s.h3m, s.h3, p.lt.lag) + this.rnd() * p.lt.noise;
    this.checkAlarms();
    // histórico de 1 s para as tendências do supervisório
    const ts = Math.floor(this.t + 1e-6);
    if (ts !== this.lastRec) { this.lastRec = ts; const row = { t: ts }; for (const k in L) row[k] = [L[k].pv, L[k].sp, L[k].out]; this.hist.push(row); if (this.hist.length > 3800) this.hist.splice(0, 200); }
  }

  checkAlarms() {
    const s = this.s, p = this.p;
    const conds = [
      ['TAHH-101', 'crit', 'Desarme da resistência por temperatura muito alta', s.tripped],
      ['TAH-101', 'high', 'Temperatura alta no tanque de aquecimento', s.T1m > 62 && !s.tripped],
      ['FAL-101', 'high', 'Vazão baixa no aquecimento, resistência intertravada', !(s.F1 > p.heaterInterlockLph) && !p.estop],
      ['LAH-103', 'high', 'Nível alto no tanque de mistura', s.h3m > p.mixHeight * 0.9],
      ['LAL-103', 'med', 'Nível baixo no tanque de mistura', s.h3m < 0.06],
      ['ESD', 'crit', 'Parada de emergência acionada', p.estop]
    ];
    const active = [];
    conds.forEach(([tag, pri, msg, on]) => {
      const was = this.alarmState[tag];
      if (on && !was) this.events.unshift({ t: this.t, tag, pri, msg, kind: 'ativo' });
      if (!on && was) this.events.unshift({ t: this.t, tag, pri, msg, kind: 'normalizado' });
      this.alarmState[tag] = on;
      if (on) active.push({ tag, pri, msg });
    });
    if (this.events.length > 60) this.events.length = 60;
    this.alarms = active;
  }
}
