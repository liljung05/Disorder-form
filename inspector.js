/* 검수 모드 (O 키): 이 화면이 design-rules.md의 규칙을 실제로 지키는지 화면 위에서 확인한다.
   1. 격자: 12/8/4단 기둥을 겹친다(G 키와 같은 층).
   2. 격자 맞춤 검사: 주요 덩어리의 왼쪽·오른쪽 끝이 단의 시작선이나 끝선에 1.5px 안으로 붙는지 잰다. 한쪽 끝이라도 붙으면 맞음, 둘 다 떨어지면 빨갛게 표시한다.
   3. 레이아웃 박스: 요소마다 내용(분홍 테두리), 안쪽 여백 padding(분홍 면), 바깥 여백 margin(주황 면)을 그리고 이름과 크기를 붙인다.
   4. 기준선: 간격 단위(8px)마다 가로선을 깐다.
   5. 지금 값: 화면 폭, 구간, 단 수, 여백, 거터, 단 폭, 패널 폭.
   전부 점검용이라 평소에는 숨어 있고, 화면 내용은 바꾸지 않는다. */
(() => {
  'use strict';
  const stage = document.querySelector('#stage');
  const css = getComputedStyle(document.documentElement);
  const px = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

  /* 격자에 맞아야 하는 덩어리(점검 대상). 장면에 따라 보이는 것만 잰다. */
  const CHECK = [
    ['.vbar', '조작 막대'], ['.panel .p-head', '패널 머리'], ['.panel .p-sec', '패널 섹션'],
    ['.sam-card', '측정 카드'], ['.viz-hint', '3D 안내'], ['.mposter-mast', '휴대폰 마스트'], ['.prompt', '첫 행동 안내']
  ];
  /* 레이아웃 박스를 그릴 요소 */
  const BOX = '.vbar, .vbar > *, .panel, .panel .p-head, .panel .p-sec, .panel h3, .panel .p-stats > div, .panel .circ, .panel .circ-views, .panel .map li, .panel .sliders label, .panel .sl-actions, .sam-card, .sam-card .sam-title, .sam-card .sam-row, .sam-open, .viz-hint, .prompt, .mposter-mast, .canvas';

  const dlg = document.createElement('section');
  dlg.className = 'insp'; dlg.hidden = true; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-label', '검수 모드');
  dlg.innerHTML = `
    <header class="insp-h"><b>검수 모드</b><span>O 키로 열고 닫기</span><button type="button" class="insp-x" aria-label="검수 모드 닫기">×</button></header>
    <div class="insp-tabs" role="tablist"><button type="button" role="tab" data-tab="grid" aria-selected="true">격자 · 레이아웃</button><button type="button" role="tab" data-tab="tok" aria-selected="false">토큰 에디터</button><button type="button" role="tab" data-tab="mod" aria-selected="false">모듈</button></div>
    <div class="insp-pane" data-pane="grid">
    <div class="insp-t" role="group" aria-label="겹쳐 볼 층">
      <label><input type="checkbox" data-k="grid" checked> 격자 기둥</label>
      <label><input type="checkbox" data-k="check" checked> 격자 맞춤 검사</label>
      <label><input type="checkbox" data-k="box"> 레이아웃 박스(분홍)</label>
      <label><input type="checkbox" data-k="base"> 기준선 8px</label>
    </div>
    <dl class="insp-v"></dl>
    <p class="insp-sum" aria-live="polite"></p>
    <ol class="insp-list"></ol>
    <p class="insp-foot">분홍 테두리 = 내용, 분홍 면 = 안쪽 여백, 주황 면 = 바깥 여백. 빨간 테두리 = 단 선에서 어긋난 덩어리. 박스에 커서를 올리면 값이 뜬다.</p>
    </div>
    <div class="insp-pane" data-pane="tok" hidden>
      <p class="insp-note">값을 바꾸면 화면 전체 모듈에 바로 반영된다. 실험용이라 새로고침하면 원래 값으로 돌아간다.</p>
      <div class="insp-tok"></div>
      <div class="insp-act"><button type="button" class="insp-btn" data-act="reset">모두 초기화</button><button type="button" class="insp-btn" data-act="copy">바꾼 토큰 CSS로 복사</button></div>
      <pre class="insp-css" hidden></pre>
    </div>
    <div class="insp-pane" data-pane="mod" hidden>
      <p class="insp-note">모듈마다 바꾸지 않는 구조(고정)와 허용한 변주를 적었다. 이름에 커서를 올리거나 누르면 화면에서 그 모듈을 모두 찾아 표시한다.</p>
      <ol class="insp-mods"></ol>
      <p class="insp-sum insp-rule"></p>
      <ol class="insp-list insp-rule-list"></ol>
    </div>`;
  stage.append(dlg);
  const layer = document.createElement('div'); layer.className = 'insp-layer'; layer.setAttribute('aria-hidden', 'true'); stage.append(layer);
  const tip = document.createElement('div'); tip.className = 'insp-tip'; tip.hidden = true; stage.append(tip);
  const on = { grid: true, check: true, box: false, base: false };
  let open = false, raf = 0, timer = 0;

  function lines() {
    const W = innerWidth, cols = Math.round(px('--cols')), m = px('--margin'), g = px('--gutter');
    const col = (W - 2 * m - (cols - 1) * g) / cols, L = [];
    for (let k = 0; k < cols; k++) { const x = m + k * (col + g); L.push(x, x + col); }
    return { W, cols, m, g, col, L };
  }
  const faded = el => { for (let n = el; n && n !== stage; n = n.parentElement) if (+getComputedStyle(n).opacity <= .05) return true; return false; };
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && !faded(el) && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight && !el.closest('[hidden]:not(.panel):not(.sam-card)'); };
  const near = (x, L) => L.some(l => Math.abs(l - x) <= 1.5);

  function draw() {
    layer.replaceChildren();
    if (!open) return;
    const G = lines(), frag = document.createDocumentFragment();
    stage.classList.toggle('show-grid', on.grid);
    layer.classList.toggle('base', on.base);
    // 지금 값
    const bp = G.W >= 1024 ? '데스크톱(1024 이상)' : G.W > 640 ? '태블릿(641–1023)' : '휴대폰(640 이하)';
    const panel = document.querySelector('.panel').getBoundingClientRect().width;
    dlg.querySelector('.insp-v').innerHTML = [['화면', `${innerWidth} × ${innerHeight}`], ['구간', bp], ['단', `${G.cols}단`], ['여백 · 거터', `${G.m} · ${G.g}px`], ['단 폭', `${G.col.toFixed(1)}px`], ['패널 폭', `${Math.round(panel)}px`], ['장면', stage.dataset.phase === 'viz' ? '3D 시각화' : '타이틀']].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
    // 격자 맞춤 검사
    const res = [];
    CHECK.forEach(([sel, name]) => document.querySelectorAll(sel).forEach((el, n) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect(), okL = near(r.left, G.L), okR = near(r.right, G.L) || Math.abs(r.right - innerWidth) < 1.5;
      res.push({ name: name + (document.querySelectorAll(sel).length > 1 ? ` ${n + 1}` : ''), okL, okR, r });
    }));
    res.forEach(x => { x.ok = x.okL || x.okR; });
    const bad = res.filter(x => !x.ok);
    dlg.querySelector('.insp-sum').textContent = res.length ? `덩어리 ${res.length}개 중 ${res.length - bad.length}개가 단 선에 맞음${bad.length ? ` · ${bad.length}개 어긋남` : ' · 모두 맞음'}` : '지금 장면에는 점검할 덩어리가 없다.';
    dlg.querySelector('.insp-list').innerHTML = res.map(x => `<li class="${x.ok ? 'ok' : 'bad'}"><span>${x.ok ? '✓' : '✕'}</span>${x.name}<em>왼쪽 ${Math.round(x.r.left)}px ${x.okL ? '맞음' : '어긋남'} · 오른쪽 ${Math.round(x.r.right)}px ${x.okR ? '맞음' : '어긋남'}</em></li>`).join('');
    if (on.check) res.forEach(x => {
      const b = document.createElement('div'); b.className = 'insp-chk ' + (x.ok ? 'ok' : 'bad');
      Object.assign(b.style, { left: x.r.left + 'px', top: x.r.top + 'px', width: x.r.width + 'px', height: x.r.height + 'px' });
      b.dataset.label = (x.ok ? '✓ ' : '✕ ') + x.name; frag.append(b);
    });
    // 레이아웃 박스
    if (on.box) document.querySelectorAll(BOX).forEach(el => {
      if (!visible(el) || el.closest('.insp')) return;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      const mt = parseFloat(s.marginTop), mr = parseFloat(s.marginRight), mb = parseFloat(s.marginBottom), ml = parseFloat(s.marginLeft);
      const pt = parseFloat(s.paddingTop), pr = parseFloat(s.paddingRight), pb = parseFloat(s.paddingBottom), pl = parseFloat(s.paddingLeft);
      const b = document.createElement('div'); b.className = 'insp-box';
      Object.assign(b.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
        borderWidth: `${Math.max(0, pt)}px ${Math.max(0, pr)}px ${Math.max(0, pb)}px ${Math.max(0, pl)}px`,
        boxShadow: `0 0 0 0 transparent` });
      if (mt > 0 || mr > 0 || mb > 0 || ml > 0) {
        const mm = document.createElement('div'); mm.className = 'insp-mar';
        Object.assign(mm.style, { left: (r.left - Math.max(0, ml)) + 'px', top: (r.top - Math.max(0, mt)) + 'px', width: (r.width + Math.max(0, ml) + Math.max(0, mr)) + 'px', height: (r.height + Math.max(0, mt) + Math.max(0, mb)) + 'px' });
        frag.append(mm);
      }
      const nm = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase();
      b.dataset.label = `${nm} ${Math.round(r.width)}×${Math.round(r.height)}`;
      b.dataset.info = `${nm}\n크기 ${Math.round(r.width)} × ${Math.round(r.height)}\n위치 x ${Math.round(r.left)} · y ${Math.round(r.top)}\n안쪽 여백 ${[pt, pr, pb, pl].map(Math.round).join(' ')}\n바깥 여백 ${[mt, mr, mb, ml].map(Math.round).join(' ')}`;
      frag.append(b);
    });
    layer.append(frag);
    if (tab === 'mod') ruleCheck();
  }
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };

  /* ── 토큰 에디터 ── */
  const root = document.documentElement;
  const TYPE = { base: 14, ratio: 1.25 };
  const typeApply = () => { [-1, 0, 1, 2, 3, 4].forEach(n => root.style.setProperty(`--step-${n}`, (TYPE.base * Math.pow(TYPE.ratio, n)).toFixed(1) + 'px')); };
  const T = [
    // [그룹, 이름, 종류, 토큰/키, 최소, 최대, 간격, 단위, 기본]
    ['글자', '기본 크기 (step-0)', 'type', 'base', 11, 20, .5, 'px', 14],
    ['글자', '단계 비율', 'type', 'ratio', 1.067, 1.5, .001, '', 1.25],
    ['격자', '바깥 여백 --margin', 'var', '--margin', 0, 96, 1, 'px', null],
    ['격자', '거터 --gutter', 'var', '--gutter', 0, 64, 1, 'px', null],
    ['격자', '패널 단 수 --panel-span', 'var', '--panel-span', 2, 6, 1, '', null],
    ['간격', '간격 단위 --space', 'var', '--space', 2, 16, 1, 'px', 8],
    ['간격', '버튼 최소 높이 --target', 'var', '--target', 28, 64, 1, 'px', 44],
    ['모양', '버튼 반경 --radius', 'var', '--radius', 0, 40, 1, 'px', null],
    ['모양', '작은 반경 --radius-s', 'var', '--radius-s', 0, 16, 1, 'px', 4],
    ['겹침', '패널 막 불투명도 --scrim-opacity', 'var', '--scrim-opacity', .4, 1, .01, '', .94],
    ['상태', 'hover 층 --state-hover-opacity', 'var', '--state-hover-opacity', 0, .4, .01, '', .08],
    ['상태', '상태 변화 시간 --duration-state', 'var', '--duration-state', 0, 1000, 10, 'ms', 200],
    ['색', '보조 글 --viz-muted', 'color', '--viz-muted', 0, 0, 0, '', '#a3a29c'],
    ['색', '가장 옅은 글 --viz-subtle', 'color', '--viz-subtle', 0, 0, 0, '', '#8f8e88'],
    ['색', '본문 --viz-text', 'color', '--viz-text', 0, 0, 0, '', '#e9e8e3'],
    ['패턴', '단어 밀도(넓이 px² 당 1개)', 'pat', 'area', 5000, 60000, 500, '', 17280],
    ['패턴', '가장 큰 글자', 'pat', 'sizeMax', 30, 200, 1, 'px', 88],
    ['패턴', '기울기 범위(±)', 'pat', 'rot', 0, 90, 1, '°', 14],
    ['패턴', '가장 진한 투명도', 'pat', 'opMax', .04, .4, .005, '', .105]
  ];
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const changed = new Set();
  const tokBox = dlg.querySelector('.insp-tok');
  let lastGroup = '';
  T.forEach((t, idx) => {
    const [grp, name, kind, key, mn, mx, st, unit] = t;
    if (grp !== lastGroup) { const h = document.createElement('h4'); h.textContent = grp; tokBox.append(h); lastGroup = grp; }
    const row = document.createElement('label'); row.className = 'insp-row' + (kind === 'color' ? ' color' : '');
    const cur = kind === 'type' ? TYPE[key] : kind === 'pat' ? (window.SLUR_PATTERN || {})[key] ?? t[8] : kind === 'color' ? css.getPropertyValue(key).trim() : parseFloat(getComputedStyle(root).getPropertyValue(key));
    t.def = cur;
    row.innerHTML = kind === 'color'
      ? `<span>${name}</span><input type="color" value="${cur}"><output></output>`
      : `<span>${name}</span><input type="range" min="${mn}" max="${mx}" step="${st}" value="${cur}"><output>${(+cur).toFixed(st < 1 ? (st < .01 ? 3 : 2) : 0)}${unit}</output>`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    const showContrast = v => { const r = ratio(v, '#0b0b0c'); out.textContent = `${r.toFixed(2)}:1 ${r >= 4.5 ? '통과' : '미달'}`; out.className = r >= 4.5 ? 'ok' : 'bad'; };
    if (kind === 'color') showContrast(cur);
    inp.addEventListener('input', () => {
      const v = kind === 'color' ? inp.value : +inp.value;
      changed.add(idx);
      if (kind === 'type') { TYPE[key] = v; typeApply(); }
      else if (kind === 'pat') { window.SLUR_PATTERN[key] = v; window.redrawPaper?.(); }
      else if (kind === 'color') root.style.setProperty(key, v);
      else root.style.setProperty(key, v + unit);
      if (kind === 'color') showContrast(v); else out.textContent = v.toFixed(st < 1 ? (st < .01 ? 3 : 2) : 0) + unit;
      if (key === '--panel-span' || key === '--margin' || key === '--gutter') dispatchEvent(new Event('resize'));
      schedule();
    });
    t.input = inp; t.out = out;
    tokBox.append(row);
  });
  function resetTokens() {
    T.forEach(t => { if (t[2] === 'var' || t[2] === 'color') root.style.removeProperty(t[3]); });
    [-1, 0, 1, 2, 3, 4].forEach(n => root.style.removeProperty(`--step-${n}`));
    TYPE.base = 14; TYPE.ratio = 1.25;
    if (window.SLUR_PATTERN_DEFAULT) { Object.assign(window.SLUR_PATTERN, window.SLUR_PATTERN_DEFAULT); window.redrawPaper?.(); }
    T.forEach(t => { const v = t[2] === 'var' ? parseFloat(getComputedStyle(root).getPropertyValue(t[3])) : t.def; t.input.value = v; t.input.dispatchEvent(new Event('input')); });
    T.forEach(t => { if (t[2] === 'var' || t[2] === 'color') root.style.removeProperty(t[3]); });
    [-1, 0, 1, 2, 3, 4].forEach(n => root.style.removeProperty(`--step-${n}`));
    changed.clear(); dlg.querySelector('.insp-css').hidden = true;
    dispatchEvent(new Event('resize')); schedule();
  }
  function copyTokens() {
    const lines = [];
    changed.forEach(i => { const t = T[i]; if (t[2] === 'type') [-1, 0, 1, 2, 3, 4].forEach(n => lines.push(`  --step-${n}: ${root.style.getPropertyValue(`--step-${n}`)};`)); else if (t[2] === 'pat') lines.push(`  /* 패턴 ${t[1]}: ${window.SLUR_PATTERN[t[3]]} (stage.js SLUR_PATTERN.${t[3]}) */`); else lines.push(`  ${t[3]}: ${root.style.getPropertyValue(t[3])};`); });
    const txt = lines.length ? `:root{\n${[...new Set(lines)].join('\n')}\n}` : '/* 바꾼 토큰이 없다 */';
    const pre = dlg.querySelector('.insp-css'); pre.hidden = false; pre.textContent = txt;
    navigator.clipboard?.writeText(txt).catch(() => {});
  }
  dlg.querySelector('[data-act="reset"]').addEventListener('click', resetTokens);
  dlg.querySelector('[data-act="copy"]').addEventListener('click', copyTokens);

  /* ── 모듈: 고정 구조와 허용 변주 ── */
  const MODS = [
    ['버튼', '.vbar button, .sl-actions button, .measure-body button, .circ-views button, .sam-open', '알약 모양 · 최소 44px · 테두리 1px · 글자 step--1 굵게 · 상태 5종(hover/active/focus/selected/disabled)', '어두운 장면용 / 밝은 종이 위(측정 알약) · 선택됨은 질환색 70%'],
    ['매핑 줄', '.map li', '출발 데이터 → 시각 요소 · 값 · 배지 · 설명, 순서와 색 고정', '측정(실선 녹색 띠·측정 배지) / 추정(점선 노랑 띠·추정 배지)'],
    ['통계 칸', '.p-stats > div', '세 칸 고정: 유병률 · 첫 발병 · 첫 도움까지. 숫자 step-2 + 단위 step--1', '휴대폰에서 숫자 step-1'],
    ['패널 섹션', '.panel .p-sec', '위 선 1px · 소제목 step-0 굵게 · 본문 step-0 · 간격 space×3', '배지 유무(추정/측정) · 자료 없으면 숨김'],
    ['생활 방해 막대', '.sds > div', '이름 · 막대 · 값, 네 영역 순서 고정', '가장 높은 영역만 굵게, 막대 2px 두껍게'],
    ['측정 카드', '.sam-card', '흰 바탕 · 검은 테두리 · 6px 그림자 · 9점 척도 3줄', '데스크톱 카드 / 휴대폰 접힌 알약'],
    ['배지', '.badge', 'step--1 굵게 · 반경 3px', '추정(점선 노랑) / 측정(실선 녹색)'],
    ['3D 이름표', '.labels span', 'step--1 굵게 · 그림자', '지금 질환(step-0, 흰색) / 축 이름(보통 굵기) / 누를 수 있음(밑줄)']
  ];
  const modList = dlg.querySelector('.insp-mods');
  MODS.forEach(([name, sel, fixed, vary]) => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="insp-mod-name">${name} <small></small></button><p><b>고정</b> ${fixed}</p><p><b>변주</b> ${vary}</p>`;
    const btn = li.querySelector('button');
    const mark = v => document.querySelectorAll(sel).forEach(el => el.classList.toggle('insp-mark', v));
    btn.addEventListener('pointerenter', () => mark(true)); btn.addEventListener('pointerleave', () => { if (!btn.classList.contains('pin')) mark(false); });
    btn.addEventListener('click', () => { btn.classList.toggle('pin'); mark(btn.classList.contains('pin')); const f = [...document.querySelectorAll(sel)].find(el => el.getClientRects().length && !faded(el)); if (btn.classList.contains('pin') && f && !visible(f)) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
    btn.addEventListener('focus', () => mark(true)); btn.addEventListener('blur', () => { if (!btn.classList.contains('pin')) mark(false); });
    li._sel = sel; modList.append(li);
  });
  /* 규칙 검사: 글자 크기가 단계 밖인 요소, 44px보다 작은 버튼 */
  function ruleCheck() {
    modList.querySelectorAll('li').forEach(li => { const all = [...document.querySelectorAll(li._sel)].filter(el => el.getClientRects().length && !faded(el) && getComputedStyle(el).visibility !== 'hidden'); const n = all.filter(visible).length; li.querySelector('small').textContent = all.length ? `지금 ${all.length}개 · 보이는 곳 ${n}개` : '이 장면에는 없음'; });
    const steps = [-1, 0, 1, 2, 3, 4].map(n => parseFloat(getComputedStyle(root).getPropertyValue(`--step-${n}`)));
    const off = new Map(), smallBtn = [];
    document.querySelectorAll('.vbar *, .panel *, .sam-card *, .prompt, .viz-hint').forEach(el => {
      if (el.closest('svg') || !visible(el)) return;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (!steps.some(v => Math.abs(v - fs) < .35)) { const k = fs.toFixed(1); off.set(k, (off.get(k) || 0) + 1); }
    });
    document.querySelectorAll('.vbar button, .panel button, .sam-card button').forEach(b => { if (!visible(b)) return; const r = b.getBoundingClientRect(); if (r.height < 43.5 || r.width < 43.5) smallBtn.push(b.textContent.trim() || b.getAttribute('aria-label')); });
    const nOff = [...off.values()].reduce((a, b) => a + b, 0);
    dlg.querySelector('.insp-rule').textContent = `규칙 검사: 단계 밖 글자 크기 ${nOff}곳 · 44px 미만 버튼 ${smallBtn.length}개`;
    dlg.querySelector('.insp-rule-list').innerHTML = [...[...off].map(([k, n]) => `<li class="bad"><span>✕</span>글자 ${k}px<em>${n}곳 · 단계: ${steps.map(v => v.toFixed(1)).join(' / ')}</em></li>`), ...smallBtn.map(t => `<li class="bad"><span>✕</span>작은 버튼<em>${t}</em></li>`)].join('') || '<li class="ok"><span>✓</span>모두 규칙 안에 있다<em>글자는 6단계 중 하나, 버튼은 44px 이상</em></li>';
  }
  /* 탭 */
  let tab = 'grid';
  dlg.querySelectorAll('.insp-tabs button').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    dlg.querySelectorAll('.insp-tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    dlg.querySelectorAll('.insp-pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
    dlg.classList.toggle('wide', tab !== 'grid');
    schedule();
  }));

  function setOpen(v) {
    open = v; dlg.hidden = !v; layer.hidden = !v; stage.classList.toggle('inspecting', v);
    if (!v) { stage.classList.remove('show-grid'); tip.hidden = true; clearInterval(timer); }
    else { timer = setInterval(schedule, 600); dlg.querySelector('input').focus({ preventScroll: true }); }
    schedule();
  }
  document.addEventListener('keydown', e => {
    if (e.target.closest?.('input[type="text"],textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'o' || e.key === 'O') { e.preventDefault(); setOpen(!open); }
    else if (e.key === 'Escape' && open) { e.stopImmediatePropagation(); setOpen(false); }
  }, true);
  dlg.querySelector('.insp-x').addEventListener('click', () => setOpen(false));
  dlg.querySelectorAll('.insp-t input').forEach(i => i.addEventListener('change', () => { on[i.dataset.k] = i.checked; schedule(); }));
  addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true);
  // 박스 위 커서: 값 읽기 (박스 층은 클릭을 막지 않으므로 좌표로 찾는다)
  addEventListener('pointermove', e => {
    if (!open || !on.box) { tip.hidden = true; return; }
    const hit = [...layer.querySelectorAll('.insp-box')].filter(b => { const r = b.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; })
      .sort((a, b) => a.offsetWidth * a.offsetHeight - b.offsetWidth * b.offsetHeight)[0];
    layer.querySelectorAll('.insp-box.hot').forEach(b => b.classList.remove('hot'));
    if (!hit || e.target.closest('.insp')) { tip.hidden = true; return; }
    hit.classList.add('hot'); tip.hidden = false; tip.textContent = hit.dataset.info;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 220) + 'px'; tip.style.top = Math.min(e.clientY + 14, innerHeight - 120) + 'px';
  });
  if (/[?&]inspect\b/.test(location.search)) setOpen(true);
  window.inspector = { open: () => setOpen(true), close: () => setOpen(false), tab: name => dlg.querySelector(`.insp-tabs [data-tab="${name}"]`)?.click(), set: (k, v) => { on[k] = v; const i = dlg.querySelector(`[data-k="${k}"]`); if (i) i.checked = v; schedule(); } };
})();
