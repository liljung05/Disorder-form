/* 3D 시각화
   2D 형태(원작의 질환별 윤곽)를 같은 좌표·같은 윤곽의 회전체로 세운 뒤, VAD(추정)와 측정 수치로 구동한다.
   · 형태: 윤곽(편집 규칙) · 표면의 결(V) · 맥동 속도(A) · 크기와 흔들림(D) · 색 띠(SDS 측정)
   · 정서 궤도: 점 1,000개. 색 점의 수 = 평생 유병률(측정). 궤도의 질서 = 정서가, 속도 = 각성도
     (affectivedesign.kr ‘정서 궤도’의 규칙: 정서가는 궤도의 질서를, 각성도는 속도를 바꾼다)
   · 연령 선: 첫 발병 나이와 첫 도움까지의 기간(측정)
   · VAD 공간: 16개 형태를 정서가·각성도·통제감 좌표에 놓은 보기
   좌표: SVG(1920×1080)의 1단위 = 3D의 0.01단위, 화면 중심 (960,540) = 원점. */
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const DATA = window.DISORDERS, DOMAINS = window.DOMAINS, SRC = window.SOURCES, S = window.SHAPES, WAVE = window.WAVE_STATE;
const stage = document.querySelector('#stage');
const $ = s => stage.querySelector(s);
const canvas = $('.viz'), panel = $('.panel'), labelsEl = $('.labels'), tip = $('.tip');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = v => (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + Math.abs(v).toFixed(2);

const PROFILE_DESC = {
  defiant: '규칙적으로 솟는 뾰족한 날. 반복되는 맞섬과 충돌', scatter: '불규칙하게 흩어지는 굴곡. 여기저기로 새는 주의',
  encounter: '평소엔 가늘다가 한 지점에서 크게 부푼다. 대상을 마주친 순간', burst: '잔잔하다 한가운데서 촘촘히 터진다. 짧고 큰 폭발',
  pulse: '간격을 두고 커지는 맥. 반복되는 사용', corridor: '양 끝이 부풀고 가운데가 좁다. 빠져나가기 어려운 통로',
  weekly: '일정한 간격의 일곱 봉우리. 주기적인 술자리', shrink: '막대보다 안쪽으로 오그라든다. 시선 앞에서 작아지는 몸',
  apart: '두 덩어리가 가운데서 끊긴다. 떨어짐', ramp: '뒤로 갈수록 두꺼워진다. 늘어나는 사용량(내성)',
  tremor: '잘게 떨리는 가장자리. 금단의 손떨림', swing: '위아래로 크게 흔들리는 중심선. 조증과 우울의 오감',
  attack: '갑자기 치솟았다 빠르게 꺼지는 세 번의 정점. 공황발작', worry: '끊이지 않고 겹쳐 오는 잔물결. 멈추지 않는 걱정',
  heavy: '아래로 처지는 무게. 오래 가라앉은 기분', intrusion: '예고 없이 튀어나오는 가는 침. 침습하는 기억'
};

/* ---------- 렌더러·장면 ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, .1, 300);
const D = 20;
camera.position.set(0, 0, D);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .06; controls.enablePan = false;
controls.minDistance = 7; controls.maxDistance = 48; controls.enabled = false; controls.autoRotateSpeed = .45;
scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(6, 9, 10); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(-8, -3, -10); scene.add(rim);

/* ---------- 회전체(튜브) 공용 ---------- */
function makeTube(NT, NR, material) {
  const geo = new THREE.BufferGeometry(), count = (NT + 1) * NR;
  const pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3), col = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  geo.setAttribute('position', pos); geo.setAttribute('color', col);
  const idx = [];
  for (let i = 0; i < NT; i++) for (let j = 0; j < NR; j++) { const a = i * NR + j, b = i * NR + (j + 1) % NR, c = (i + 1) * NR + j, e = (i + 1) * NR + (j + 1) % NR; idx.push(a, c, b, b, c, e); }
  geo.setIndex(idx);
  return { NT, NR, geo, pos, col, mesh: new THREE.Mesh(geo, material) };
}
function tint(hex, k) { const c = new THREE.Color(hex); return k >= 0 ? c.lerp(new THREE.Color(1, 1, 1), k) : c.multiplyScalar(1 + k); }
const bandCache = new Map();
function bandsOf(d) {
  if (bandCache.has(d.id)) return bandCache.get(d.id);
  let B;
  if (!d.sds) B = { bands: [[0, 1]], colors: [new THREE.Color(d.color)] };
  else { const tot = d.sds.reduce((a, b) => a + b, 0); let acc = 0; B = { bands: d.sds.map(x => { const a = acc; acc += x / tot; return [a, acc]; }), colors: [0, .28, -.22, .5].map(k => tint(d.color, k)) }; }
  bandCache.set(d.id, B); return B;
}
const bandAt = (B, t) => { let k = 0; for (let i = 0; i < B.bands.length; i++) if (t >= B.bands[i][0]) k = i; return k; };
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
function writeTube(tube, p) {
  const { NT, NR } = tube, P = tube.pos.array, C = tube.col.array;
  const base = WAVE.base, wave = WAVE.wave * p.breathe, cy = WAVE.cy, min = base * .05 + 1.5;
  for (let i = 0; i <= NT; i++) {
    const t = i / NT, a = S.sampleAt(p.A, t), b = p.k > 0 ? S.sampleAt(p.B, t) : a;
    const u = lerp(a[0], b[0], p.k), dn = lerp(a[1], b[1], p.k), m = lerp(a[2], b[2], p.k);
    const env = S.envelope(t), e = env * wave;
    const rw = 1 + p.ripple * Math.sin(t * 38 - p.time * p.speed * 2.2) * env;
    const taper = lerp(1, Math.pow(Math.sin(Math.PI * t), .4), p.life);
    const hu = Math.max(min, base / 2 + u * e) * rw * taper / 100, hd = Math.max(min, base / 2 + dn * e) * rw * taper / 100;
    const mid = -(cy + m * e - 540) / 100, X = (t * WAVE.w - 960) / 100;
    const ka = bandAt(p.BA, t); tmpC.copy(p.BA.colors[ka]);
    if (p.k > 0) tmpC.lerp(tmpC2.copy(p.BB.colors[bandAt(p.BB, t)]), p.k);
    if (p.hlBands) tmpC.multiplyScalar(1 + .45 * Math.max(0, Math.sin(p.time * 5 - ka * 1.6)));
    const rz = (hu + hd) / 2;
    for (let j = 0; j < NR; j++) {
      const th = j / NR * Math.PI * 2, s = Math.sin(th), co = Math.cos(th), r = s >= 0 ? hu : hd;
      const n = Math.sin(t * 61 * p.roughF / 6 + th * 3 + p.time * p.speed) * Math.sin(t * 23 * p.roughF / 6 - th * 5 + p.time * p.speed * 1.37) + .5 * Math.sin(t * 131 + th * 7 - p.time * p.speed * .8);
      const kk = 1 + p.rough * n * env / Math.max(.25, rz), o = (i * NR + j) * 3;
      P[o] = X; P[o + 1] = mid + r * s * kk; P[o + 2] = rz * co * kk;
      const sh = .86 + .14 * co; C[o] = tmpC.r * sh; C[o + 1] = tmpC.g * sh; C[o + 2] = tmpC.b * sh;
    }
  }
  tube.pos.needsUpdate = true; tube.col.needsUpdate = true;
  tube.geo.computeVertexNormals();
}
function vadParams(vad, life, boost = {}) {
  const [V, A] = vad, neg = (1 - V) / 2, ar = (A + 1) / 2;
  return {
    rough: life * (.03 + .32 * Math.pow(neg, 1.6)) * (boost.surface ? 2.2 : 1), roughF: 3 + 9 * neg,
    speed: (.25 + 3.2 * ar * ar) * (boost.motion ? 2.4 : 1), ripple: life * (.04 + .22 * ar) * (boost.motion ? 1.6 : 1)
  };
}

/* ---------- 주 형태 ---------- */
const root = new THREE.Group(); scene.add(root);
const form = new THREE.Group(); root.add(form);
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .42, metalness: .08, side: THREE.DoubleSide, transparent: true, emissive: 0x000000 });
const main = makeTube(420, 40, mat); form.add(main.mesh);

/* 정서 궤도: 점 1,000개 */
const N_PTS = 1000;
const ptsGeo = new THREE.BufferGeometry();
const ptsPos = new Float32Array(N_PTS * 3), ptsCol = new Float32Array(N_PTS * 3), ptsTarget = new Float32Array(N_PTS * 3);
ptsGeo.setAttribute('position', new THREE.BufferAttribute(ptsPos, 3));
ptsGeo.setAttribute('color', new THREE.BufferAttribute(ptsCol, 3));
const ptsMat = new THREE.PointsMaterial({ size: .09, vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
const pts = new THREE.Points(ptsGeo, ptsMat); root.add(pts);
const orb = Array.from({ length: N_PTS }, (_, k) => {
  const r = Math.random;
  return { x0: (r() - .5) * 19, rq: 3 + .75 * (k % 5), rr: 2.4 + 4.6 * r(), tz: (r() - .5) * 2, ty: (r() - .5) * 2, ang: r() * Math.PI * 2, sp: .6 + .8 * r(), dir: r() < .5 ? -1 : 1, ph: r() * 6.28, w: .5 + r() };
});
let litCount = 0;

/* 연령 선 */
const axis = new THREE.Group(); root.add(axis);
const AX_W = 19.2, AX_Y = -3.9;
const axisMat = new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true });
const axisLine = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, AX_W, 6), axisMat);
axisLine.rotation.z = Math.PI / 2; axisLine.position.y = AX_Y; axis.add(axisLine);
for (let a = 0; a <= 80; a += 10) { const tick = new THREE.Mesh(new THREE.BoxGeometry(.015, a % 40 ? .14 : .28, .015), axisMat); tick.position.set(-AX_W / 2 + AX_W * a / 80, AX_Y, 0); axis.add(tick); }
const segMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
const seg = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 1, 16), segMat); seg.rotation.z = Math.PI / 2; axis.add(seg);
const onsetMark = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 12), segMat); axis.add(onsetMark);
const axisState = { x0: 0, w: 1, tx0: 0, tw: 1, col: new THREE.Color(), tcol: new THREE.Color() };

/* ---------- VAD 공간 ---------- */
const SP = 4.2, space = new THREE.Group(); scene.add(space); space.visible = false;
const minis = DATA.map((d, i) => {
  const tube = makeTube(140, 16, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .05, side: THREE.DoubleSide, transparent: true }));
  const g = new THREE.Group(); g.add(tube.mesh); g.scale.setScalar(.085);
  tube.mesh.userData.index = i; space.add(g);
  return { tube, g, B: bandsOf(d), shape: S.shapeOf(d) };
});
(() => {
  const m = new THREE.LineBasicMaterial({ color: 0x55555a, transparent: true });
  const add = p => space.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p.map(q => new THREE.Vector3(...q))), m));
  add([[-SP, 0, 0], [SP, 0, 0]]); add([[0, -SP, 0], [0, SP, 0]]); add([[0, 0, -SP], [0, 0, SP]]);
  space.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SP * 2, SP * 2, SP * 2)), new THREE.LineBasicMaterial({ color: 0x2a2a2e, transparent: true })));
  const grid = new THREE.GridHelper(SP * 2, 8, 0x2a2a2e, 0x1c1c1f); grid.position.y = -SP; space.add(grid);
  const bp = DATA.find(d => d.vad2);
  const bl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...bp.vad.map(v => v * SP)), new THREE.Vector3(...bp.vad2.map(v => v * SP))]), new THREE.LineDashedMaterial({ color: bp.color, dashSize: .2, gapSize: .15, transparent: true }));
  bl.computeLineDistances(); space.add(bl);
})();
const liveMarker = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); space.add(liveMarker);

/* ---------- 라벨(HTML) ---------- */
const labelNodes = [];
function setLabels(list) {
  labelsEl.replaceChildren(); labelNodes.length = 0;
  list.forEach(l => { const s = document.createElement('span'); s.textContent = l.text; s.className = l.cls || ''; if (l.onClick) s.addEventListener('click', l.onClick); labelsEl.append(s); labelNodes.push({ el: s, obj: l.obj, pos: l.pos }); });
}
const v3 = new THREE.Vector3();
function drawLabels() {
  const w = innerWidth, h = innerHeight;
  for (const n of labelNodes) {
    if (n.obj) n.obj.getWorldPosition(v3); else { v3.copy(n.pos); space.localToWorld(v3); }
    v3.project(camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
    n.el.style.visibility = vis ? '' : 'hidden';
    n.el.style.left = ((v3.x + 1) / 2 * w).toFixed(1) + 'px'; n.el.style.top = ((1 - v3.y) / 2 * h - 18).toFixed(1) + 'px';
  }
}

/* ---------- 소리: 정서가 = 화음(불협↔협화), 각성도 = 떨림 속도, 통제감 = 낮은 울림 ---------- */
const sound = {
  ctx: null, on: false,
  start() {
    if (!this.ctx) {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(c.destination);
      this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.Q.value = 2; this.filter.connect(this.out);
      this.trem = c.createGain(); this.trem.gain.value = .6; this.trem.connect(this.filter);
      this.lfo = c.createOscillator(); this.lfoGain = c.createGain(); this.lfo.connect(this.lfoGain); this.lfoGain.connect(this.trem.gain); this.lfo.start();
      this.o1 = c.createOscillator(); this.o1.type = 'triangle'; this.o2 = c.createOscillator(); this.o2.type = 'sine'; this.sub = c.createOscillator(); this.sub.type = 'sine';
      this.subGain = c.createGain(); this.o1.connect(this.trem); this.o2.connect(this.trem); this.sub.connect(this.subGain); this.subGain.connect(this.filter);
      [this.o1, this.o2, this.sub].forEach(o => o.start());
    }
    this.ctx.resume(); this.on = true; this.out.gain.setTargetAtTime(.09, this.ctx.currentTime, .4);
  },
  stop() { if (!this.ctx) return; this.on = false; this.out.gain.setTargetAtTime(0, this.ctx.currentTime, .2); },
  update([V, A, Dm]) {
    if (!this.on) return;
    const t = this.ctx.currentTime, ar = (A + 1) / 2, pos = (V + 1) / 2, f = 174.6 * Math.pow(2, A * .3);
    this.o1.frequency.setTargetAtTime(f, t, .15);
    this.o2.frequency.setTargetAtTime(f * lerp(16 / 15, 5 / 4, pos), t, .15);
    this.sub.frequency.setTargetAtTime(f / 2, t, .15);
    this.subGain.gain.setTargetAtTime(.15 + .6 * (Dm + 1) / 2, t, .2);
    this.lfo.frequency.setTargetAtTime(.5 + 11 * ar * ar, t, .2);
    this.lfoGain.gain.setTargetAtTime(.15 + .45 * ar, t, .2);
    this.filter.frequency.setTargetAtTime(500 + 2600 * pos * pos + 900 * ar, t, .2);
  }
};

/* ---------- 상태 ---------- */
let cur = 0, from = 0, morph = 1, morphT0 = 0, active = false, mode = 'form', paused = false, override = null, hl = null;
let t0 = 0, last = 0, raf = 0, dyn = 0, introT0 = 0, visited = new Set(), hoverMini = -1;
const vadNow = [0, 0, 0], trail = [];
const fit = { visW: 19.2, visH: 10.8, shiftX: 0, shiftY: 0 };
let camTween = null;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const boxW = Math.min(w, h * 16 / 9), boxH = boxW * 9 / 16;
  fit.visH = 10.8 * h / boxH; fit.visW = fit.visH * camera.aspect;
  if (!active || camTween?.intro || !isMobile()) camera.fov = 2 * Math.atan(fit.visH / 2 / D) * 180 / Math.PI;
  else camera.fov = 40;
  camera.updateProjectionMatrix();
  const pw = panel.getBoundingClientRect().width || 0, mobile = w <= 640;
  fit.shiftX = mobile ? 0 : (pw / 2) * fit.visW / w;
  fit.shiftY = mobile ? -(h * .24) * fit.visH / h : 0;
}
let resizeT = 0;
addEventListener('resize', () => { resize(); clearTimeout(resizeT); resizeT = setTimeout(() => { if (active && !camTween) tweenCam(mode === 'space' ? spacePose() : formPose(), 600); }, 250); });

function currentVAD(d, time) {
  let v = d.vad.slice();
  if (d.vad2) { const s = .5 + .5 * Math.sin(time * .32); v = v.map((x, k) => lerp(d.vad2[k], x, ease(s))); }
  if (d.id === 'ptsd') { const p = Math.pow(Math.max(0, Math.sin(time * .9)), 40); v[1] = clamp(v[1] + .3 * p, -1, 1); v[0] -= .2 * p; }
  if (d.id === 'panic') { const p = Math.pow(Math.max(0, Math.sin(time * .55)), 18); v[1] = lerp(.55, .95, p); }
  return v;
}
const isMobile = () => innerWidth <= 640; // CSS의 휴대폰 경계(4단)와 같은 값
// 휴대폰: 화면 위쪽 절반에 형태가 들어오도록 화각과 거리를 다시 잡는다
function mobileFit(width) { const fov = 40, visH = width / camera.aspect; return { fov, dist: visH / 2 / Math.tan(fov / 2 * Math.PI / 180), y: -.24 * visH }; }
function formPose() {
  const az = .62, el = .26;
  if (isMobile()) { const m = mobileFit(13); return { pos: new THREE.Vector3(m.dist * Math.sin(az) * Math.cos(el), m.y + m.dist * Math.sin(el), m.dist * Math.cos(az) * Math.cos(el)), tgt: new THREE.Vector3(0, m.y, 0), fov: m.fov }; }
  const dist = D * .98;
  return { pos: new THREE.Vector3(fit.shiftX + dist * Math.sin(az) * Math.cos(el), fit.shiftY + dist * Math.sin(el), dist * Math.cos(az) * Math.cos(el)), tgt: new THREE.Vector3(fit.shiftX, fit.shiftY, 0), fov: camera.fov };
}
function spacePose() {
  if (isMobile()) { const m = mobileFit(13); return { pos: new THREE.Vector3(0, m.y, 0).add(new THREE.Vector3(12, 7.5, 16).normalize().multiplyScalar(m.dist * 1.1)), tgt: new THREE.Vector3(0, m.y, 0), fov: m.fov }; }
  const tgt = new THREE.Vector3(fit.shiftX * 1.1, fit.shiftY, 0); return { pos: tgt.clone().add(new THREE.Vector3(14, 8.5, 19)), tgt, fov: camera.fov };
}
function tweenCam(to, dur, opts = {}) {
  controls.enabled = false; controls.autoRotate = false;
  camTween = { from: { pos: camera.position.clone(), tgt: controls.target.clone(), fov: camera.fov }, to, t0: performance.now(), dur: reduced() ? 1 : dur, delay: 0, ...opts };
}

/* ---------- 정서 공간 지도(패널): V·A·D 세 축의 3차원 지도 ----------
   가로 = 정서가 V, 세로 = 각성도 A, 깊이 = 통제감 D. 정사영(orthographic)으로 SVG에 그린다.
   ‘정면’ 보기(yaw 0, pitch 0)는 Russell 원형도(V·A 평면)와 같다. 끌어서 돌리고, 손을 떼면 천천히 돈다. */
const circ = $('.circ'), NS = 'http://www.w3.org/2000/svg', CC = 160, CS = 92;
const svgEl = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent?.append(n); return n; };
const setA = (n, attrs) => { for (const k in attrs) n.setAttribute(k, typeof attrs[k] === 'number' ? attrs[k].toFixed(1) : attrs[k]); };
const view = { yaw: -.62, pitch: .38, tYaw: -.62, tPitch: .38, auto: true, drag: null, moved: false, idleT: 0 };
function proj(v, a, d) {
  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const x1 = v * cy + d * sy, z1 = -v * sy + d * cy;
  const y2 = a * cp - z1 * sp, z2 = a * sp + z1 * cp;
  return [CC + x1 * CS, CC - y2 * CS, z2];
}
let circDots = [], circTrail, circLive, circMe, circEdges = [], circAxes = [], circAxL = [], circDrops = [], circBp, circPlane, circLayer;
const CUBE = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
const EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const AXES = [[[-1.12,0,0],[1.12,0,0],'불쾌 −V','쾌 +V'],[[0,-1.12,0],[0,1.12,0],'이완 −A','각성 +A'],[[0,0,-1.12],[0,0,1.12],'무력 −D','통제 +D']];
(function buildCirc() {
  const defs = svgEl('defs', {}, circ);
  const mk = svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
  svgEl('path', { d: 'M0 0L10 5L0 10z', fill: '#f2c75c' }, mk);
  circPlane = svgEl('polygon', { class: 'plane' }, circ);           // D = 0인 V·A 평면(원형도)
  circEdges = EDGES.map(() => svgEl('line', { class: 'ring' }, circ));
  circAxes = AXES.map(() => svgEl('line', { class: 'ax' }, circ));
  circAxL = AXES.flatMap(([, , lo, hi]) => [lo, hi].map(t => { const n = svgEl('text', { class: 'axl', 'text-anchor': 'middle' }, circ); n.textContent = t; return n; }));
  circDrops = DATA.map(d => svgEl('line', { class: 'drop', stroke: d.color }, circ));
  const bp = DATA.find(d => d.vad2);
  circBp = svgEl('line', { stroke: bp.color, 'stroke-dasharray': '3 3', 'stroke-width': 1.5 }, circ);
  circTrail = svgEl('polyline', { class: 'trail', points: '' }, circ);
  circMe = svgEl('g', {}, circ);
  circLayer = svgEl('g', {}, circ);
  circDots = DATA.map((d, i) => {
    const g = svgEl('g', { class: 'dot', tabindex: 0, role: 'button', 'aria-label': `${d.name}로 이동. 정서가 ${fmt(d.vad[0])}, 각성도 ${fmt(d.vad[1])}, 통제감 ${fmt(d.vad[2])} (추정)` }, circLayer);
    g._c = (d.vad2 ? [d.vad, d.vad2] : [d.vad]).map((v, k) => svgEl('circle', { r: k ? 3.5 : 5, fill: d.color }, g));
    g._t = svgEl('text', {}, g); g._t.textContent = d.name;
    g.addEventListener('click', () => { if (!view.moved) select(i); });
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
    return g;
  });
  circLive = svgEl('circle', { class: 'live', r: 5 }, circ);
  // 끌어서 돌리기. 터치는 가로로만 돌려 패널 세로 스크롤을 막지 않는다.
  circ.addEventListener('pointerdown', e => { view.drag = { x: e.clientX, y: e.clientY, yaw: view.tYaw, pitch: view.tPitch, touch: e.pointerType === 'touch' }; view.moved = false; view.auto = false; });
  addEventListener('pointermove', e => {
    const g = view.drag; if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (Math.hypot(dx, dy) > 4) view.moved = true;
    view.tYaw = g.yaw + dx * .012;
    if (!g.touch) view.tPitch = clamp(g.pitch + dy * .01, -1.45, 1.45);
  });
  addEventListener('pointerup', () => { if (view.drag) { view.drag = null; view.idleT = performance.now(); setTimeout(() => { view.moved = false; }, 0); } });
  panel.querySelectorAll('.circ-views button').forEach(b => b.addEventListener('click', () => setCircView(b.dataset.view)));
})();
function setCircView(name) {
  const V = { orbit: [-.62, .38], va: [0, 0], vd: [0, 1.45], ad: [-Math.PI / 2, 0] }[name] || [-.62, .38];
  // 가장 가까운 방향으로 돌아가도록 yaw를 2π 단위로 맞춘다
  const k = Math.round((view.tYaw - V[0]) / (Math.PI * 2));
  view.tYaw = V[0] + k * Math.PI * 2; view.tPitch = V[1]; view.auto = name === 'orbit'; view.idleT = 0;
  panel.querySelectorAll('.circ-views button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === name));
}
function drawCirc(dt) {
  if (view.auto && !paused && !reduced()) view.tYaw += dt * .18;
  else if (!view.drag && view.idleT && performance.now() - view.idleT > 6000) { view.auto = true; view.idleT = 0; panel.querySelectorAll('.circ-views button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === 'orbit')); }
  const kk = view.drag ? 1 : Math.min(1, dt * 6);
  view.yaw += (view.tYaw - view.yaw) * kk; view.pitch += (view.tPitch - view.pitch) * kk;
  const P = CUBE.map(c => proj(...c));
  EDGES.forEach(([a, b], k) => setA(circEdges[k], { x1: P[a][0], y1: P[a][1], x2: P[b][0], y2: P[b][1] }));
  setA(circPlane, { points: [[-1,-1],[1,-1],[1,1],[-1,1]].map(([v, a]) => proj(v, a, 0).slice(0, 2).map(n => n.toFixed(1)).join(',')).join(' ') });
  AXES.forEach(([p0, p1], k) => {
    const A = proj(...p0), B = proj(...p1);
    setA(circAxes[k], { x1: A[0], y1: A[1], x2: B[0], y2: B[1] });
    const out = (p, n, s) => { const q = proj(...p.map(x => x * 1.16)); setA(n, { x: q[0], y: q[1] + 4 }); n.style.opacity = (.55 + .45 * clamp((q[2] + 1.2) / 2.4)).toFixed(2); };
    out(p0, circAxL[k * 2]); out(p1, circAxL[k * 2 + 1]);
  });
  const order = [];
  DATA.forEach((d, i) => {
    const g = circDots[i];
    (d.vad2 ? [d.vad, d.vad2] : [d.vad]).forEach((v, k) => { const q = proj(...v); setA(g._c[k], { cx: q[0], cy: q[1], r: (k ? 3 : 4) + 1.6 * clamp((q[2] + 1.6) / 3.2) }); });
    const q = proj(...d.vad), f = proj(d.vad[0], -1, d.vad[2]);
    setA(g._t, { x: q[0] + 9, y: q[1] - 8 });
    setA(circDrops[i], { x1: q[0], y1: q[1], x2: f[0], y2: f[1] });
    order.push([q[2], g]);
  });
  order.sort((a, b) => a[0] - b[0]).forEach(([, g]) => circLayer.append(g)); // 가까운 점을 위에
  const bp = DATA.find(d => d.vad2), b1 = proj(...bp.vad), b2 = proj(...bp.vad2);
  setA(circBp, { x1: b1[0], y1: b1[1], x2: b2[0], y2: b2[1] });
  const L = proj(...vadNow); setA(circLive, { cx: L[0], cy: L[1] });
  circTrail.setAttribute('points', trail.map(p => proj(...p).slice(0, 2).map(n => n.toFixed(1)).join(',')).join(' '));
  drawMe();
}
function drawMe() {
  circMe.replaceChildren();
  const m = window.SAM?.get() || {};
  if (m.pre) { const [x, y] = proj(...m.pre); svgEl('circle', { class: 'me', cx: x, cy: y, r: 7 }, circMe); const t = svgEl('text', { x: x + 10, y: y + 14, fill: '#f2c75c', 'font-size': 10 }, circMe); t.textContent = m.post ? '보기 전의 나' : '나'; }
  if (m.post) { const [x, y] = proj(...m.post); if (m.pre) { const [a, b] = proj(...m.pre); svgEl('line', { class: 'me-arrow', x1: a, y1: b, x2: x, y2: y }, circMe); } svgEl('circle', { class: 'me-post', cx: x, cy: y, r: 5 }, circMe); const t = svgEl('text', { x: x + 9, y: y - 8, fill: '#f2c75c', 'font-size': 10 }, circMe); t.textContent = '본 뒤의 나'; }
}

/* ---------- 패널 ---------- */
const badge = est => `<span class="badge ${est ? 'est' : 'src'}">${est ? '추정' : '측정'}</span>`;
function fillPanel(i) {
  const d = DATA[i], B = bandsOf(d);
  stage.style.setProperty('--color', d.color);
  $('.cur-name').textContent = d.name;
  // 현재 위치 표시: 16칸 중 지금 · 이미 본 것
  $('.ticks').innerHTML = DATA.map((_, k) => `<i class="${k === i ? 'on' : visited.has(k) ? 'seen' : ''}"></i>`).join('');
  panel.querySelector('.p-index').textContent = `${String(i + 1).padStart(2, '0')} / ${DATA.length}`;
  panel.querySelector('.p-name').textContent = d.name;
  panel.querySelector('.p-en').textContent = d.en;
  panel.querySelector('.p-stats').innerHTML = `<div><span>평생 유병률</span><b>${d.prev}</b><small>%</small></div><div><span>첫 발병(중앙값)</span><b>${d.onset}</b><small>세</small></div><div><span>첫 도움까지</span><b>${d.delay}</b><small>년</small></div>`;
  panel.querySelector('.p-concept').textContent = d.concept;
  panel.querySelector('.p-why').textContent = d.vadWhy;
  const vv = k => d.vad2 ? `${fmt(d.vad2[k])} ↔ ${fmt(d.vad[k])}` : fmt(d.vad[k]);
  const rows = [
    { hl: 'shape', from: '원작의 질환별 윤곽 규칙' + (d.sds ? ' × 생활 방해 평균' : ''), to: '형태의 굴곡', val: `×${S.gainOf(d).toFixed(2)}`, est: true, note: `${PROFILE_DESC[d.profile]}. 2D 막대에서 바뀐 윤곽을 그대로 회전체로 세웠다. 생활 방해(SDS) 평균이 높을수록 굴곡의 진폭이 커진다.` },
    { hl: 'surface', from: 'Valence 정서가', to: '표면의 결 · 궤도의 질서', val: vv(0), est: true, note: '불쾌할수록 표면이 거칠고 날카로워지며, 주변 점들의 궤도가 서로 엇갈려 흐트러진다. 쾌에 가까울수록 매끄럽고 궤도는 가지런한 고리가 된다.' },
    { hl: 'motion', from: 'Arousal 각성도', to: '맥동과 궤도의 속도 · 소리의 떨림', val: vv(1), est: true, note: '각성이 높을수록 표면을 따라 흐르는 물결과 숨 쉬는 맥동이 빨라지고, 궤도의 점도 빠르게 돈다. 소리를 켜면 떨림이 잦아진다.' },
    { hl: 'size', from: 'Dominance 통제감', to: '크기와 흔들림 · 낮은 울림', val: vv(2), est: true, note: '통제감이 낮을수록 형태가 작게 움츠러들고 중심이 흔들리며 떠다닌다. 높을수록 크고 단단히 자리 잡으며, 소리의 낮은 울림이 커진다.' },
    d.sds ? { hl: 'bands', from: '생활 네 영역 방해 점수(SDS)', to: '네 색 띠의 너비', val: d.sds.map(x => x.toFixed(1)).join(' · '), est: false, note: `왼쪽부터 ${DOMAINS.join(' · ')}. 띠의 너비는 네 점수의 비율을 따른다. 형태에 커서를 올리면 그 영역의 점수가 뜬다.` }
          : { hl: 'bands', from: '생활 네 영역 방해 점수(SDS)', to: '단색', val: '자료 없음', est: false, note: '이 질환은 해당 연구에서 영역별 점수가 조사되지 않았다. 다른 질환의 값으로 채우지 않았다.' },
    { hl: 'points', from: '평생 유병률', to: '궤도의 점 1,000개 중 색 점', val: `${d.prev}%`, est: false, note: `1,000명 중 약 ${Math.round(d.prev * 10)}명이 살면서 한 번은 이 진단 기준을 충족한다.` },
    { hl: 'axis', from: '첫 발병 나이 · 첫 도움까지', to: '아래의 선(0–80세)', val: `${d.onset}세 · ${d.delay}년`, est: false, note: '구슬이 첫 발병 나이, 색 구간이 첫 치료 접촉까지 걸린 기간이다. 서로 다른 응답자 집단의 두 중앙값을 이어 붙인 도식이다.' }
  ];
  const map = panel.querySelector('.map');
  map.innerHTML = rows.map(r => `<li data-hl="${r.hl}" class="${r.est ? 'is-est' : 'is-src'}" tabindex="0"><span class="m-from">${r.from}</span><span class="m-to">→ ${r.to}</span><span class="m-val">${r.val}<small>${badge(r.est)}</small></span><span class="m-note">${r.note}</span></li>`).join('');
  map.querySelectorAll('li').forEach(li => { const on = () => { hl = li.dataset.hl; }, off = () => { hl = null; }; li.addEventListener('pointerenter', on); li.addEventListener('pointerleave', off); li.addEventListener('focus', on); li.addEventListener('blur', off); });
  const sdsSec = panel.querySelector('.p-sds'); sdsSec.hidden = !d.sds;
  if (d.sds) panel.querySelector('.sds').innerHTML = d.sds.map((x, k) => `<div class="${x === Math.max(...d.sds) ? 'is-max' : ''}"><dt>${DOMAINS[k]}</dt><dd style="--v:${x / 10};--sw:#${B.colors[k].getHexString()}"><i></i></dd><b>${x.toFixed(1)}</b></div>`).join('');
  const src = [SRC.prev, SRC.onset, SRC.delay, ...(d.sds ? [SRC.sds] : []), SRC.pad, SRC.circ, SRC.sam];
  panel.querySelector('.sources').innerHTML = src.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t} ↗</a></li>`).join('') + '<li>정서 좌표(VAD)·윤곽 규칙: 편집자 추정</li><li>궤도 규칙(정서가→질서, 각성도→속도): affectivedesign.kr ‘정서 궤도’</li>';
  circDots.forEach((g, k) => g.classList.toggle('cur', k === i));
  fillMeasure();
}

/* ---------- 측정: 보기 전 / 본 뒤 ---------- */
function fillMeasure() {
  const box = panel.querySelector('.measure-body'), m = window.SAM.get();
  box.replaceChildren();
  const row = (label, vals) => `<span>${label}</span>${vals.map(v => `<b>${fmt(v)}</b>`).join('')}`;
  const samRows = () => { const r = document.createElement('div'); r.className = 'sam-rows'; box.append(r); return r; };
  if (!m.pre) {
    box.insertAdjacentHTML('beforeend', '<p class="p-small">‘정신병자’라는 말을 볼 때 드는 느낌을 SAM 9점 척도로 재 둔다. 지금 이 기록이 ‘보기 전’이 된다.</p>');
    window.SAM.build(samRows(), 'pre2', null, vals => window.SAM.save('pre', vals));
  } else if (!m.post) {
    box.insertAdjacentHTML('beforeend', `<div class="measure-grid"><span></span><span>V</span><span>A</span><span>D</span>${row('보기 전', m.pre)}</div><p class="p-small">질환을 몇 개 둘러본 뒤(지금 ${visited.size}개 봤다), 같은 질문에 다시 답해 보자. ‘정신병자’라는 말을 볼 때 지금은 어떤 느낌인가?</p>`);
    window.SAM.build(samRows(), 'post', null, vals => window.SAM.save('post', vals));
  } else {
    const dv = m.post.map((v, k) => v - m.pre[k]), say = [];
    if (Math.abs(dv[0]) >= .25) say.push(`정서가가 <b>${fmt(dv[0])}</b>만큼 ${dv[0] > 0 ? '쾌' : '불쾌'} 쪽으로`);
    if (Math.abs(dv[1]) >= .25) say.push(`각성도가 <b>${fmt(dv[1])}</b>만큼 ${dv[1] > 0 ? '높아지는' : '차분해지는'} 쪽으로`);
    if (Math.abs(dv[2]) >= .25) say.push(`통제감이 <b>${fmt(dv[2])}</b>만큼 ${dv[2] > 0 ? '커지는' : '작아지는'} 쪽으로`);
    box.insertAdjacentHTML('beforeend', `<div class="measure-grid"><span></span><span>V</span><span>A</span><span>D</span>${row('보기 전', m.pre)}${row('본 뒤', m.post)}${row('변화', dv)}</div><p class="measure-result">${say.length ? say.join(', ') + ' 움직였다.' : '두 기록 사이에 눈에 띄는 차이(±0.25 이상)는 없었다.'} 원형도 위의 노란 화살표가 그 이동이다.</p><p class="p-small">한 사람이 두 번 답한 자기평가일 뿐, 통계가 아니다.</p><div class="sl-actions"><button type="button" class="m-redo">다시 재기</button><button type="button" class="m-clear">기록 지우기</button></div>`);
    box.querySelector('.m-redo').addEventListener('click', () => window.SAM.save('post', undefined));
    box.querySelector('.m-clear').addEventListener('click', () => { window.SAM.save('pre', undefined); window.SAM.save('post', undefined); });
  }
  $('.sl-mine').disabled = !m.pre;
  drawMe();
}
window.addEventListener('samchange', () => { if (active) fillMeasure(); });

/* ---------- 슬라이더 ---------- */
const sliders = ['#sl-v', '#sl-a', '#sl-d'].map(s => $(s));
const outs = sliders.map(s => s.parentElement.querySelector('output'));
sliders.forEach((s, k) => s.addEventListener('input', () => { override = sliders.map(x => +x.value); $('.sl-reset').disabled = false; outs[k].textContent = fmt(+s.value); }));
$('.sl-reset').addEventListener('click', () => { override = null; $('.sl-reset').disabled = true; });
$('.sl-mine').addEventListener('click', () => { const m = window.SAM.get(), v = m.post || m.pre; if (!v) return; override = v.slice(); sliders.forEach((s, k) => { s.value = v[k]; outs[k].textContent = fmt(v[k]); }); $('.sl-reset').disabled = false; });

/* ---------- 질환 전환 ---------- */
function select(i) {
  if (!active) return;
  if (i === cur) { if (mode !== 'form') setMode('form'); return; }
  from = morph < 1 ? from : cur; cur = i; morph = 0; morphT0 = performance.now();
  override = null; $('.sl-reset').disabled = true;
  visited.add(i);
  retarget();
  fillPanel(i); panel.scrollTop = 0;
  panel.animate?.([{ opacity: .3, transform: 'translateX(10px)' }, { opacity: 1, transform: 'none' }], { duration: reduced() ? 0 : 500, easing: 'ease-out' });
  if (mode !== 'form') setMode('form');
  $('.live').textContent = `${DATA[i].name}. 평생 유병률 ${DATA[i].prev}퍼센트.`;
}
function retarget() {
  const d = DATA[cur], lit = new THREE.Color(d.color).lerp(new THREE.Color(1, 1, 1), .25), dim = new THREE.Color(.3, .3, .32);
  litCount = Math.round(d.prev * 10);
  for (let k = 0; k < N_PTS; k++) { const c = k < litCount ? lit : dim; ptsTarget[k * 3] = c.r; ptsTarget[k * 3 + 1] = c.g; ptsTarget[k * 3 + 2] = c.b; }
  axisState.tx0 = -AX_W / 2 + AX_W * d.onset / 80; axisState.tw = AX_W * d.delay / 80;
  axisState.tcol.set(d.color).lerp(new THREE.Color(1, 1, 1), .2);
  mat.flatShading = S.shapeOf(d).sharp; mat.needsUpdate = true;
}

/* ---------- 보기 방식 ---------- */
function setMode(m) {
  if (!active || mode === m) return;
  mode = m; stage.dataset.mode = m;
  stage.querySelectorAll('.modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  tip.hidden = true;
  if (m === 'space') {
    space.visible = true;
    setLabels([
      ...DATA.map((d, i) => ({ text: d.name, obj: minis[i].g, cls: 'pick', onClick: () => select(i) })),
      { text: '쾌 +V', pos: new THREE.Vector3(SP + .7, 0, 0), cls: 'axis' }, { text: '불쾌 −V', pos: new THREE.Vector3(-SP - .7, 0, 0), cls: 'axis' },
      { text: '각성 +A', pos: new THREE.Vector3(0, SP + .6, 0), cls: 'axis' }, { text: '이완 −A', pos: new THREE.Vector3(0, -SP - .4, 0), cls: 'axis' },
      { text: '통제 +D', pos: new THREE.Vector3(0, 0, SP + .7), cls: 'axis' }, { text: '무력 −D', pos: new THREE.Vector3(0, 0, -SP - .7), cls: 'axis' }
    ]);
    tweenCam(spacePose(), 1600);
    $('.live').textContent = 'VAD 공간. 16개 질환이 정서가, 각성도, 통제감 좌표에 놓여 있습니다.';
  } else {
    setLabels([]);
    tweenCam(formPose(), 1400);
  }
}

/* ---------- 3D 호버 ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointermove', e => {
  if (!active || camTween) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const place = () => { tip.hidden = false; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; };
  if (mode === 'form') {
    main.geo.computeBoundingSphere();
    const hit = ray.intersectObject(main.mesh)[0];
    if (hit && morph >= 1) {
      const lp = main.mesh.worldToLocal(hit.point.clone()), t = clamp((lp.x * 100 + 960) / 1920), d = DATA[cur];
      tip.innerHTML = d.sds ? (k => `${DOMAINS[k]}<br><b>${d.sds[k].toFixed(1)}</b>/ 10 방해 <span style="color:#888">(SDS)</span>`)(bandAt(bandsOf(d), t)) : `${d.name}<br><span style="color:#aaa">생활영역 점수 없음</span>`;
      place();
    } else tip.hidden = true;
  } else {
    const hit = ray.intersectObjects(minis.map(m => m.tube.mesh))[0];
    hoverMini = hit ? hit.object.userData.index : -1;
    canvas.style.cursor = hoverMini >= 0 ? 'pointer' : '';
    if (hoverMini >= 0) { const d = DATA[hoverMini]; tip.innerHTML = `${d.name}<br><span style="color:#aaa">V ${fmt(d.vad[0])} · A ${fmt(d.vad[1])} · D ${fmt(d.vad[2])}</span><br><span style="color:#888">누르면 이 질환으로</span>`; place(); }
    else tip.hidden = true;
  }
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => { if (mode === 'space' && hoverMini >= 0 && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) select(hoverMini); });

/* ---------- 조작 막대·키보드 ---------- */
$('.prev').addEventListener('click', () => select((cur + DATA.length - 1) % DATA.length));
$('.next').addEventListener('click', () => select((cur + 1) % DATA.length));
stage.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
const soundBtn = $('.sound'), pauseBtn = $('.pause');
function toggleSound() { if (sound.on) sound.stop(); else sound.start(); soundBtn.setAttribute('aria-pressed', sound.on); soundBtn.textContent = sound.on ? '소리 켜짐' : '소리 꺼짐'; }
function togglePause() { paused = !paused; pauseBtn.setAttribute('aria-pressed', paused); pauseBtn.textContent = paused ? '자동 변화 다시 켜기' : '자동 변화 일시정지'; if (!camTween) controls.autoRotate = !paused && !reduced(); }
soundBtn.addEventListener('click', toggleSound); pauseBtn.addEventListener('click', togglePause);
document.addEventListener('keydown', e => {
  if (!active || e.target.closest?.('input[type="range"],input[type="radio"],textarea') || (e.key === ' ' && e.target.closest?.('button,[role="button"]'))) return;
  if (e.key === 'ArrowRight') select((cur + 1) % DATA.length);
  else if (e.key === 'ArrowLeft') select((cur + DATA.length - 1) % DATA.length);
  else if (e.key === 'v' || e.key === 'V') setMode('space');
  else if (e.key === 'f' || e.key === 'F') setMode('form');
  else if (e.key === 'm' || e.key === 'M') toggleSound();
  else if (e.key === ' ') { e.preventDefault(); togglePause(); }
});

/* ---------- 진입·퇴장 ---------- */
function enter(i) {
  cur = from = i; morph = 1; visited = new Set([i]); override = null; mode = 'form'; stage.dataset.mode = 'form'; hl = null;
  stage.querySelectorAll('.modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === 'form'));
  space.visible = false; setLabels([]);
  retarget();
  ptsCol.set(ptsTarget);
  axisState.x0 = axisState.tx0; axisState.w = axisState.tw; axisState.col.copy(axisState.tcol);
  fillPanel(i); panel.hidden = false; panel.scrollTop = 0;
  document.activeElement?.blur?.();
  active = true; resize();
  camera.position.set(0, 0, D); controls.target.set(0, 0, 0); camera.lookAt(0, 0, 0);
  root.position.set(0, 0, 0); root.scale.setScalar(1);
  tweenCam(formPose(), 2600, { intro: true, delay: 250 });
  vadNow.splice(0, 3, ...currentVAD(DATA[i], 0)); trail.length = 0;
  t0 = last = introT0 = performance.now(); dyn = 0;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}
function leave() {
  active = false; cancelAnimationFrame(raf); camTween = null;
  panel.hidden = true; controls.enabled = false; tip.hidden = true; setLabels([]); sound.stop();
  soundBtn.setAttribute('aria-pressed', false); soundBtn.textContent = '소리 꺼짐';
  renderer.clear();
}

/* ---------- 루프 ---------- */
function loop(now) {
  if (!active) return;
  raf = requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const time = (now - t0) / 1000;
  if (!paused) dyn += dt;
  const life = reduced() ? .4 : ease(clamp((now - introT0 - 400) / 2400));
  let tweenK = 1;
  if (camTween) {
    tweenK = clamp((now - camTween.t0 - camTween.delay) / camTween.dur); const e = ease(tweenK);
    camera.position.lerpVectors(camTween.from.pos, camTween.to.pos, e);
    controls.target.lerpVectors(camTween.from.tgt, camTween.to.tgt, e);
    camera.lookAt(controls.target);
    if (camTween.to.fov) { camera.fov = lerp(camTween.from.fov, camTween.to.fov, e); camera.updateProjectionMatrix(); }
    if (camTween.intro) { root.scale.setScalar(lerp(1, .6, e)); root.position.y = lerp(0, .42 * .6, e); }
    if (tweenK >= 1) { camTween = null; controls.enabled = true; controls.autoRotate = !paused && !reduced(); }
  } else controls.update();
  if (morph < 1) morph = clamp((now - morphT0) / (reduced() ? 1 : 1300));
  const km = ease(morph), d = DATA[cur], dFrom = DATA[from];
  const target = override || currentVAD(d, dyn);
  for (let k = 0; k < 3; k++) vadNow[k] += (target[k] - vadNow[k]) * Math.min(1, dt * (override ? 6 : 3));
  panel.querySelectorAll('.vad-row').forEach((row, k) => { row.querySelector('i').style.setProperty('--v', vadNow[k].toFixed(3)); row.querySelector('.vad-n').textContent = fmt(vadNow[k]); });
  const lastP = trail[trail.length - 1];
  if (!lastP || Math.hypot(lastP[0] - vadNow[0], lastP[1] - vadNow[1], lastP[2] - vadNow[2]) > .012) { trail.push(vadNow.slice()); if (trail.length > 140) trail.shift(); }
  drawCirc(dt);
  if (!override) sliders.forEach((s, k) => { if (document.activeElement !== s) { s.value = vadNow[k]; outs[k].textContent = fmt(vadNow[k]); } });
  sound.update(vadNow);

  const vp = vadParams(vadNow, life, { surface: hl === 'surface', motion: hl === 'motion' });
  const ar = (vadNow[1] + 1) / 2, sub = (1 - vadNow[2]) / 2, neg = (1 - vadNow[0]) / 2;
  const spaceK = mode === 'space' ? ease(tweenK) : (space.visible ? 1 - ease(tweenK) : 0);

  // 주 형태
  const morphing = km < 1;
  writeTube(main, { A: S.shapeOf(morphing ? dFrom : d), B: S.shapeOf(d), k: morphing ? km : 0, BA: bandsOf(morphing ? dFrom : d), BB: bandsOf(d), time: dyn, life, breathe: 1 + life * .12 * Math.sin(dyn * (.6 + 2.4 * ar)), hlBands: hl === 'bands', ...vp });
  const wob = life * sub * sub * (hl === 'size' ? 2.2 : 1);
  form.position.set(Math.sin(dyn * 1.3) * .35 * wob, Math.sin(dyn * 2.1 + 1) * .25 * wob, 0);
  form.rotation.z = Math.sin(dyn * 1.7) * .06 * wob; form.rotation.x = Math.sin(dyn * .9) * .25 * wob;
  form.scale.setScalar((1 - .22 * sub * life + .03 * Math.sin(dyn * (3 + 6 * ar)) * wob) * (morphing ? 1 - .12 * Math.sin(Math.PI * morph) : 1));
  mat.opacity = (hl === 'axis' || hl === 'points' ? .35 : 1) * (1 - spaceK);
  mat.emissive.set(hl === 'shape' ? d.color : 0x000000); mat.emissiveIntensity = hl === 'shape' ? .35 + .25 * Math.sin(time * 5) : 0;
  main.mesh.visible = mat.opacity > .02;

  // 정서 궤도
  const spin = (paused ? .2 : 1) * (.15 + 2.1 * ar * ar) * (hl === 'motion' ? 2.4 : 1);
  for (let k = 0; k < N_PTS; k++) {
    const o = orb[k], lit = k < litCount;
    o.ang += dt * spin * o.sp * (lit ? 1.25 : .7) * (neg > .5 ? o.dir : 1);
    const R = lerp(o.rq, o.rr, neg) * (1 + neg * .22 * Math.sin(dyn * o.w + o.ph));
    const tz = o.tz * neg * 1.1, ty = o.ty * neg * 1.1;
    const cy0 = Math.cos(o.ang) * R, cz0 = Math.sin(o.ang) * R;
    const ox = -cy0 * Math.sin(tz), oy = cy0 * Math.cos(tz);
    const ox2 = ox * Math.cos(ty) + cz0 * Math.sin(ty), oz2 = -ox * Math.sin(ty) + cz0 * Math.cos(ty);
    ptsPos[k * 3] = o.x0 + ox2 + neg * .8 * Math.sin(dyn * .7 * o.w + o.ph); ptsPos[k * 3 + 1] = oy * .62 - .42; ptsPos[k * 3 + 2] = oz2;
    const f = hl === 'points' && !lit ? .35 : 1;
    for (let c = 0; c < 3; c++) ptsCol[k * 3 + c] += (ptsTarget[k * 3 + c] * f - ptsCol[k * 3 + c]) * Math.min(1, dt * 3);
  }
  ptsGeo.attributes.position.needsUpdate = true; ptsGeo.attributes.color.needsUpdate = true;
  ptsMat.opacity = .9 * life * (1 - spaceK); ptsMat.size = hl === 'points' ? .17 : .09;
  // 연령 선
  const ka = Math.min(1, dt * 4);
  axisState.x0 += (axisState.tx0 - axisState.x0) * ka; axisState.w += (axisState.tw - axisState.w) * ka; axisState.col.lerp(axisState.tcol, ka);
  const thick = hl === 'axis' ? 1.8 : 1;
  seg.scale.set(thick, axisState.w, thick); seg.position.set(axisState.x0 + axisState.w / 2, AX_Y, 0); onsetMark.position.set(axisState.x0, AX_Y, 0); onsetMark.scale.setScalar(thick); segMat.color.copy(axisState.col);
  axisMat.opacity = life * (1 - spaceK) * (hl === 'axis' ? 1 : .8); segMat.opacity = life * (1 - spaceK);

  // VAD 공간
  if (space.visible) {
    if (isMobile()) space.position.set(0, mobileFit(13).y, 0); else space.position.set(fit.shiftX * 1.1, fit.shiftY, 0);
    minis.forEach((m, i) => {
      const v = i === cur ? vadNow : currentVAD(DATA[i], dyn), p = vadParams(v, 1);
      m.g.position.set(v[0] * SP, v[1] * SP, v[2] * SP);
      writeTube(m.tube, { A: m.shape, B: m.shape, k: 0, BA: m.B, BB: m.B, time: dyn + i, life: 1, breathe: 1 + .12 * Math.sin(dyn * (.6 + 2.4 * (v[1] + 1) / 2)), ...p });
      const sc = (i === cur ? .12 : .075) * (i === hoverMini ? 1.3 : 1) * (1 - .22 * (1 - v[2]) / 2);
      m.g.scale.setScalar(sc * Math.max(.001, spaceK));
      m.g.rotation.y = dyn * .2 + i;
      m.tube.mesh.material.opacity = spaceK;
    });
    liveMarker.position.set(vadNow[0] * SP, vadNow[1] * SP, vadNow[2] * SP); liveMarker.scale.setScalar(.6 + .3 * Math.sin(time * 4));
    space.children.forEach(c => { if (c.material && !c.isGroup) c.material.opacity = spaceK; });
    labelsEl.style.opacity = spaceK;
    labelNodes.forEach((n, k) => { if (k < DATA.length) n.el.classList.toggle('cur', k === cur); });
    if (mode !== 'space' && !camTween) { space.visible = false; setLabels([]); }
  }
  drawLabels();
  renderer.render(scene, camera);
}

resize();
window.viz = { enter, leave, select, setMode };
