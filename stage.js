/* 타이틀 화면: 막대 고르기(10) → 색 막대와 관련어(11) → 형태 변화(12) → 3D 시각화로 오버랩(viz).
   막대·형태 로직은 원작 life.js에서 가져왔고, 12 이후의 타임라인·스크롤 서사는 제거했다. */
(() => {
  'use strict';
  const stage = document.querySelector('#stage');
  const NS = 'http://www.w3.org/2000/svg';
  const DATA = window.DISORDERS;
  const $ = s => stage.querySelector(s);
  const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = v => reduced() ? 0 : v;

  /* ---------- 질환별 형태(원작 그대로): 편집자가 구성한 추상 윤곽, 측정값 아님 ---------- */
  const noise = (i, seed) => { const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return v - Math.floor(v); };
  const hash = (i, seed) => { const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); };
  const sn = (x, seed = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i, seed) + (hash(i + 1, seed) - hash(i, seed)) * u) * 2 - 1; };
  const bump = (t, c, k) => Math.exp(-Math.pow((t - c) * k, 2));
  const tri = x => 1 - Math.abs(((x % 1) + 1) % 1 * 2 - 1);
  const spike = (t, c, w) => Math.pow(Math.max(0, 1 - Math.abs(t - c) / w), 1.3);
  const TAU = Math.PI * 2;
  const PROFILES = {
    worry:    { f: (t, z) => { const r = .62 + .38 * sn(t * 5, z); return [.42 + .26 * Math.sin(t * TAU * 9) * r + .2 * sn(t * 21, z + 1), .42 + .26 * Math.sin(t * TAU * 9 + 1.7) * r + .2 * sn(t * 21, z + 2), .06 * sn(t * 3, z + 3)]; } },
    defiant:  { sharp: true, f: (t, z) => [.08 + .95 * Math.pow(tri(t * 6.5 + .15 * sn(t * 3, z)), 3.2), .05 + .8 * Math.pow(tri(t * 5.5 + .4), 3.2), .1 * sn(t * 4, z + 5)] },
    scatter:  { f: (t, z) => [.15 + .5 * Math.max(-.25, sn(t * 17, z)) + .25 * Math.max(0, sn(t * 41, z + 7)), .15 + .5 * Math.max(-.25, sn(t * 19, z + 9)) + .25 * Math.max(0, sn(t * 37, z + 8)), .3 * sn(t * 9, z + 3)] },
    encounter:{ f: t => { const b = bump(t, .62, 7.5); return [-.3 + 1.35 * b, -.3 + 1.35 * b, 0]; } },
    burst:    { sharp: true, f: (t, z) => { const env = Math.max(.12, bump(t, .56, 4.2) + .35 * bump(t, .3, 9)); const r = .75 + .25 * sn(t * 40, z); return [-.12 + 1.25 * env * Math.pow(tri(t * 46), 1.6) * r, -.12 + 1.15 * env * Math.pow(tri(t * 46 + .5), 1.6) * r, 0]; } },
    pulse:    { f: t => { const k = Math.pow(Math.max(0, Math.sin(t * TAU * 2.5)), 3) * (.45 + .6 * t); return [-.1 + k, -.1 + k, 0]; } },
    corridor: { f: t => { const k = .95 * Math.max(bump(t, .12, 8), bump(t, .88, 8)) - .42 * bump(t, .5, 2.6); return [k, k, 0]; } },
    weekly:   { f: t => { const k = .05 + .7 * Math.pow(Math.abs(Math.sin(t * Math.PI * 7)), 4); return [k, k, 0]; } },
    shrink:   { f: (t, z) => [-.16 - .14 * t + .08 * sn(t * 26, z), -.12 - .1 * t + .08 * sn(t * 26, z + 4), .06 * t] },
    apart:    { f: t => { const k = .85 * Math.max(bump(t, .27, 5.2), bump(t, .74, 5.2)) - .48 * bump(t, .505, 13); return [k, k, 0]; } },
    ramp:     { f: t => { const k = -.2 + 1.05 * Math.pow(t, 1.6); return [k, k, 0]; } },
    tremor:   { f: t => { const k = .3 + .16 * Math.sin(t * TAU * 31) + .18 * Math.sin(t * TAU * 1.5); return [k, .3 + .16 * Math.sin(t * TAU * 31 + 2) + .18 * Math.sin(t * TAU * 1.5), 0]; } },
    swing:    { f: t => { const m = Math.sin(t * TAU * 1.15 - .35); return [.28 + .42 * Math.max(0, -m), .28 + .42 * Math.max(0, m), .78 * m]; } },
    attack:   { sharp: true, f: (t, z) => { const k = [.22, .5, .78].reduce((m, c) => Math.max(m, t >= c ? Math.exp(-(t - c) * 22) : Math.exp(-(c - t) * 140)), 0); return [-.12 + 1.15 * k, -.12 + 1.05 * k, .05 * sn(t * 4, z)]; } },
    heavy:    { f: t => { const sag = Math.sin(Math.PI * Math.pow(t, .8)); return [-.16 - .1 * sag, .12 + .32 * sag, .55 * sag]; } },
    intrusion:{ sharp: true, f: (t, z) => { const hits = [.18, .36, .44, .63, .81, .9]; let u = 0, d = 0; hits.forEach((c, i) => { const k = spike(t, c + .02 * sn(i, z), .018); if (i % 2) u = Math.max(u, k); else d = Math.max(d, k); }); return [.05 + 1.2 * u, .05 + 1.1 * d, 0]; } }
  };
  const TABLE = 241, cache = new Map();
  function shapeOf(d) {
    if (cache.has(d.id)) return cache.get(d.id);
    const spec = PROFILES[d.profile] || PROFILES.heavy, seed = [...d.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 97;
    const mean = d.sds ? d.sds.reduce((a, b) => a + b, 0) / 4 : 4;
    const gain = .72 + .5 * clamp(mean / 6.2, 0, 1); // 생활 방해 평균이 높을수록 진폭이 커진다(원작의 편집 규칙)
    const table = Array.from({ length: TABLE }, (_, i) => spec.f(i / (TABLE - 1), seed).map(v => v * gain));
    const shape = { table, gain, sharp: !!spec.sharp };
    cache.set(d.id, shape);
    return shape;
  }
  const sampleAt = (shape, t) => {
    const x = clamp(t) * (TABLE - 1), i = Math.min(TABLE - 2, Math.floor(x)), f = x - i, a = shape.table[i], b = shape.table[i + 1];
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
  };
  const envelope = t => Math.pow(Math.sin(Math.PI * clamp(t)), .55);
  window.SHAPES = { shapeOf, sampleAt, envelope, gainOf: d => shapeOf(d).gain };

  function curve(points, sharp) {
    if (sharp) return points.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    let out = '';
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      out += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return out;
  }
  function shapePath(x, w, cy, base, wave, shape, n = 120) {
    if (shape.sharp) n = 360;
    const top = [], bot = [];
    for (let j = 0; j <= n; j++) {
      const t = j / n, [u, dn, m] = sampleAt(shape, t), e = envelope(t) * wave;
      const mid = cy + m * e, min = base * .05 + 1.5;
      const X = x + w * j / n;
      top.push([X, mid - Math.max(min, base / 2 + u * e)]); bot.push([X, mid + Math.max(min, base / 2 + dn * e)]);
    }
    bot.reverse();
    return `M${top[0][0].toFixed(1)} ${top[0][1].toFixed(1)}` + curve(top, shape.sharp) + `L${bot[0][0].toFixed(1)} ${bot[0][1].toFixed(1)}` + curve(bot, shape.sharp) + 'Z';
  }
  const rectPath = (x, w, cy, h) => `M${x.toFixed(1)} ${(cy - h / 2).toFixed(1)}H${(x + w).toFixed(1)}V${(cy + h / 2).toFixed(1)}H${x.toFixed(1)}Z`;

  /* ---------- 종이 위의 말들: 원작의 paper.png가 assets에 있으면 그것을, 없으면 같은 성격의 글자 층을 그린다 ---------- */
  const SLURS = ['정신병자', '미친놈', '또라이', '사이코', '정병', '꾀병', '나약해서 그래', '의지 문제', '관종', '군면제용', '무서워', '위험해', '격리해', '이상해', '게을러', '예민해', '핑계', '약쟁이', '알콜중독자', '분조장', '돌았네', '정신 차려', '유난', '다 네 탓', '가까이 오지 마', '병원 가봐', '미쳤어?', '조현병 환자 조심'];
  /* 생성 그래픽 지시문 · 종이 위의 말들
     무엇을: 정신질환을 향한 욕설·낙인의 말 28개를 종이 위에 흩어 쓴다. 막대(질환)가 그 말들 위에 놓인다는 것이 이 화면의 메시지다.
     어떻게: 단어 i의 위치·크기·기울기·투명도는 noise(i, seed)로 정한다. 같은 i는 언제나 같은 자리에 오므로 새로고침해도 화면이 흔들리지 않는다.
     우연의 범위: 크기 18–88px(큰 글자는 드물게, 지수 2.2), 기울기 ±7°, 투명도 0.035–0.105. 이 범위를 넘으면 막대보다 말이 먼저 읽히므로 넘기지 않는다.
     폭에 따른 반응: 단어 수 = 화면 넓이 / 17,280 (1920×1080에서 120개), 40–160개로 제한. 크기는 √넓이 / 1,440 배(0.6–1.2)로 줄거나 커진다.
                    즉 휴대폰에서도 밀도(빈 곳과 말의 비율)는 같고, 글자가 화면을 덮지 않는다. 폭이 바뀌면 다시 그린다.
     예외: assets/paper.png(원작의 욕설 배경)가 있으면 이 층 대신 그 이미지를 쓴다. */
  (function paper() {
    const paperEl = $('.paper');
    const probe = new Image();
    probe.onload = () => paperEl.classList.add('has-image');
    probe.src = 'assets/paper.png';
    const g = $('.slurs');
    let lastKey = '';
    function draw() {
      const W = innerWidth, H = innerHeight, key = `${Math.round(W / 40)}x${Math.round(H / 40)}`;
      if (key === lastKey) return; lastKey = key;
      g.setAttribute('viewBox', `0 0 ${W} ${H}`);
      g.replaceChildren();
      const n = Math.round(clamp(W * H / 17280, 40, 160)), k = clamp(Math.sqrt(W * H) / 1440, .6, 1.2);
      for (let i = 0; i < n; i++) {
        const w = SLURS[i % SLURS.length], a = noise(i, 1), b = noise(i, 2), c = noise(i, 3);
        const size = (18 + Math.pow(c, 2.2) * 70) * k, x = (a * (W + 180) - 90).toFixed(0), y = (b * (H + 80)).toFixed(0);
        const t = el('text', { x, y, transform: `rotate(${((noise(i, 4) - .5) * 14).toFixed(1)} ${x} ${y})`, 'font-size': size.toFixed(0) }, g);
        t.style.opacity = (.035 + .07 * noise(i, 5)).toFixed(3);
        t.textContent = w;
      }
    }
    draw();
    let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 200); });
  })();

  /* 휴대폰 세로용 포스터: 같은 글자 이미지를 복제해 화면 폭에 맞춘 덩어리로 위에 둔다(CSS가 표시 여부를 정한다) */
  (function mobilePoster() {
    const box = $('.mposter'), src = $('.canvas .poster');
    if (!box || !src) return;
    const c = src.cloneNode(true); c.removeAttribute('aria-hidden'); box.append(c);
  })();

  /* 격자 보기: G 키 또는 ?grid. 화면의 모든 요소가 12/8/4단에 맞는지 점검한다 */
  (function gridGuide() {
    if (/[?&]grid\b/.test(location.search)) stage.classList.add('show-grid');
    document.addEventListener('keydown', e => {
      if ((e.key === 'g' || e.key === 'G') && !e.target.closest?.('input,textarea') && !e.metaKey && !e.ctrlKey) stage.classList.toggle('show-grid');
    });
  })();


  /* ---------- SAM(자기평가 마네킹, Bradley·Lang 1994) 9점 척도: 보기 전 측정 ---------- */
  const SAM_ROWS = [['정서가', '불쾌', '쾌'], ['각성도', '차분', '흥분'], ['통제감', '압도됨', '통제함']];
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('disorder3d-sam') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('disorder3d-sam', JSON.stringify(v)); } catch {} }
  };
  let samMem = store.get();
  window.SAM = {
    rows: SAM_ROWS,
    get: () => samMem,
    save(key, vals) { samMem = { ...samMem, [key]: vals }; store.set(samMem); window.dispatchEvent(new CustomEvent('samchange')); },
    toUnit: n => (n - 5) / 4, // 1–9 → -1–1
    build(container, prefix, current, onDone) {
      container.replaceChildren();
      const picked = current ? current.map(v => Math.round(v * 4 + 5)) : [0, 0, 0];
      SAM_ROWS.forEach(([name, lo, hi], k) => {
        const fs = document.createElement('fieldset'); fs.className = 'sam-row';
        fs.innerHTML = `<legend>${name}</legend><div class="sam-scale"><span>${lo}</span>${Array.from({ length: 9 }, (_, i) => `<input type="radio" id="${prefix}-${k}-${i + 1}" name="${prefix}-${k}" value="${i + 1}" aria-label="${name} ${i + 1}점"${picked[k] === i + 1 ? ' checked' : ''}>`).join('')}<span>${hi}</span></div>`;
        container.append(fs);
      });
      container.addEventListener('change', () => {
        const vals = SAM_ROWS.map((_, k) => +(container.querySelector(`input[name="${prefix}-${k}"]:checked`)?.value || 0));
        if (vals.every(Boolean)) onDone(vals.map(window.SAM.toUnit));
      });
    }
  };
  (function preCard() {
    const card = $('#sam-pre'), rows = card.querySelector('.sam-rows');
    card.addEventListener('submit', e => e.preventDefault());
    card.querySelector('.sam-x').addEventListener('click', () => { card.hidden = true; });
    // 휴대폰: 막대가 첫 행동이므로 측정은 접힌 알약으로 시작한다
    const openBtn = card.querySelector('.sam-open');
    if (matchMedia('(max-width: 640px)').matches) card.classList.add('is-collapsed');
    openBtn.addEventListener('click', () => { card.classList.remove('is-collapsed'); openBtn.setAttribute('aria-expanded', 'true'); card.querySelector('input')?.focus(); });
    if (samMem.pre) { card.hidden = true; return; }
    window.SAM.build(rows, 'pre', null, vals => {
      window.SAM.save('pre', vals);
      if (!card.querySelector('.sam-done')) { const p = document.createElement('p'); p.className = 'sam-done'; p.textContent = '기록했다. 이제 막대를 눌러 보자.'; card.append(p); }
      setTimeout(() => { card.hidden = true; }, 1600);
    });
  })();

  /* ---------- DOM ---------- */
  const svg = $('.bars'), world = $('.world'), rowsG = $('.rows'), hero = $('.hero'), wordsG = $('.words');
  const live = $('.live'), prompt = $('.prompt');
  const rowBox = (d, i) => ({ x: 691 + (d.onset - 7) * 18.85, w: d.delay * 18.85, cy: i * 67.5 + 33.75, base: 67.5 });
  const BASE = { x: 0, w: 0, cy: 540, base: 60, wave: 0, words: 0, op: 1 };
  const preview = () => ({ x: 469, w: 1046, cy: 582, base: 290, wave: 0 });
  const WAVE = { x: 0, w: 1920, cy: 582, base: 290, wave: 230, words: 0 };
  window.WAVE_STATE = WAVE;
  let state = { ...BASE }, current = 0, phase = '10', tween = 0, token = 0;

  function render(s) {
    state = s;
    const d = DATA[current];
    hero.setAttribute('d', shapePath(s.x, s.w, s.cy, s.base, s.wave, shapeOf(d)));
    hero.style.opacity = s.op;
    wordsG.style.opacity = s.words;
  }
  function animate(target, duration, done) {
    cancelAnimationFrame(tween);
    const from = { ...state }, began = performance.now(), my = token;
    const frame = now => {
      if (my !== token) return;
      const t = duration ? clamp((now - began) / duration) : 1, e = smooth(t), s = {};
      for (const k of Object.keys({ ...from, ...target })) { const a = from[k] ?? target[k] ?? 0, b = target[k] ?? a; s[k] = lerp(a, b, e); }
      render(s);
      if (t < 1) tween = requestAnimationFrame(frame); else done?.();
    };
    tween = requestAnimationFrame(frame);
  }

  /* ---------- 10: 막대 ---------- */
  const rowPaths = [];
  const peekLabel = el('text', { class: 'peek', 'dominant-baseline': 'middle', 'text-anchor': 'middle' }, world);
  DATA.forEach((d, i) => {
    const p = el('path', { role: 'button', tabindex: 0, 'aria-label': `${d.name}` }, rowsG);
    const b = rowBox(d, i);
    p.setAttribute('d', rectPath(b.x, b.w, b.cy, b.base));
    p.style.setProperty('--r', i);
    p.addEventListener('pointerenter', () => { if (phase === '10' || (phase === '11' && i !== current)) peek(i); });
    p.addEventListener('pointerleave', unpeek);
    p.addEventListener('focus', () => { if (phase === '10') peek(i); });
    p.addEventListener('blur', unpeek);
    p.addEventListener('click', e => { e.stopPropagation(); if (phase === '10' || (phase === '11' && i !== current)) choose(i); });
    p.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (phase === '10') choose(i, true); }
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); rowPaths[(i + (e.key === 'ArrowDown' ? 1 : rowPaths.length - 1)) % rowPaths.length].focus(); }
    });
    rowPaths.push(p);
  });
  function peek(i) {
    stage.classList.add('has-peeked');
    const d = DATA[i], b = rowBox(d, i);
    rowPaths.forEach((p, k) => { p.style.fill = k === i ? d.color : ''; p.style.opacity = phase === '10' ? (k === i ? 1 : .55) : ''; });
    peekLabel.textContent = d.name;
    peekLabel.setAttribute('x', b.x + b.w / 2); peekLabel.setAttribute('y', b.cy - b.base / 2 - 16);
    peekLabel.style.opacity = phase === '10' ? 1 : 0;
  }
  function unpeek() { rowPaths.forEach(p => { p.style.fill = ''; p.style.opacity = ''; }); peekLabel.style.opacity = 0; }
  const BAND_TOP = 437, BAND_BOTTOM = 727;
  function splitRows(i) {
    DATA.forEach((d, k) => {
      const p = rowPaths[k];
      p.classList.toggle('is-selected', k === i);
      if (i < 0) { p.style.transform = ''; return; }
      const b = rowBox(DATA[i], i), top = b.cy - b.base / 2, bottom = b.cy + b.base / 2;
      const dy = k < i ? BAND_TOP - top : k > i ? BAND_BOTTOM - bottom : 0;
      p.style.transform = `translate(0px, ${dy.toFixed(1)}px)`;
    });
  }
  function setPhase(next) {
    if (next !== '10' && next !== '11') unpeek();
    phase = next;
    stage.dataset.phase = next;
    rowPaths.forEach(p => p.setAttribute('tabindex', next === '10' ? 0 : -1));
    hero.setAttribute('tabindex', next === '11' ? 0 : -1);
    const touch = matchMedia('(hover: none)').matches;
    prompt.textContent = next === '10' ? (touch ? '막대를 눌러 질환을 고르세요' : '막대에 커서를 올리면 질환이, 누르면 펼쳐집니다')
      : next === '11' ? '색 막대를 한 번 더 누르면 형태가 바뀝니다 · 바깥을 누르면 돌아갑니다' : '';
  }
  function placeWords(d) {
    wordsG.replaceChildren();
    d.words.split(/\s+/).slice(0, 30).forEach((word, j) => {
      const col = j % 6, row = Math.floor(j / 6), n = noise(j, current + 3), m = noise(j + 40, current + 9);
      const t = el('text', { x: 520 + 944 * (col + .2 + .6 * n) / 6, y: 437 + 290 * ((row + col * 2 + current) % 5 + .45 + .5 * m) / 5, 'text-anchor': 'middle' }, wordsG);
      t.textContent = word;
    });
  }

  /* ---------- 11: 색 막대 + 관련어 ---------- */
  function choose(i, keyboard = false) {
    token++;
    current = i;
    const d = DATA[i];
    hero.style.fill = d.color;
    placeWords(d);
    const switching = phase === '11';
    unpeek(); splitRows(i);
    const from = switching ? { ...state, words: 0 } : { ...BASE, ...rowBox(d, i) };
    render(from);
    setPhase('11');
    live.textContent = `${d.name}. 색 막대를 한 번 더 누르면 형태가 바뀝니다.`;
    animate({ ...from, ...preview() }, ms(520), () => animate({ ...state, words: 1 }, ms(364)));
    if (keyboard) hero.focus({ preventScroll: true });
  }

  /* ---------- 12: 형태 변화 → viz: 3D로 오버랩 ---------- */
  function reveal() {
    if (phase !== '11') return;
    const my = ++token, d = DATA[current];
    setPhase('12');
    animate({ ...state, ...WAVE }, ms(1100), () => {
      setTimeout(() => {
        if (my !== token) return;
        window.viz?.enter(current);           // 3D 형태가 같은 자리, 같은 윤곽으로 나타난다
        setPhase('viz');
        live.textContent = `${d.name}의 3D 시각화. 오른쪽에 개념과 시각화 방식이 있습니다.`;
        setTimeout(() => { if (my === token) animate({ ...state, op: 0 }, ms(900)); }, ms(500));
      }, ms(380));
    });
  }
  function overview() {
    token++; cancelAnimationFrame(tween);
    window.viz?.leave();
    splitRows(-1);
    render({ ...BASE, op: 0 });
    setPhase('10');
    live.textContent = '전체 질환 막대. 막대를 고르면 해당 질환을 볼 수 있습니다.';
  }
  hero.addEventListener('click', e => { e.stopPropagation(); reveal(); });
  hero.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); } });
  $('.canvas').addEventListener('click', () => { if (phase === '11') overview(); });
  $('.back').addEventListener('click', overview);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && phase !== '10') overview(); });
  addEventListener('pointermove', e => { stage.style.setProperty('--cx', (e.clientX / innerWidth - .5).toFixed(3)); stage.style.setProperty('--cy', (e.clientY / innerHeight - .5).toFixed(3)); });

  render({ ...BASE, op: 0 });
  setPhase('10');
  window.stage = { choose, reveal, overview, get phase() { return phase; } };
})();
