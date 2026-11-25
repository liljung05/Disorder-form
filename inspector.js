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
    <div class="insp-t" role="group" aria-label="겹쳐 볼 층">
      <label><input type="checkbox" data-k="grid" checked> 격자 기둥</label>
      <label><input type="checkbox" data-k="check" checked> 격자 맞춤 검사</label>
      <label><input type="checkbox" data-k="box"> 레이아웃 박스(분홍)</label>
      <label><input type="checkbox" data-k="base"> 기준선 8px</label>
    </div>
    <dl class="insp-v"></dl>
    <p class="insp-sum" aria-live="polite"></p>
    <ol class="insp-list"></ol>
    <p class="insp-foot">분홍 테두리 = 내용, 분홍 면 = 안쪽 여백, 주황 면 = 바깥 여백. 빨간 테두리 = 단 선에서 어긋난 덩어리. 박스에 커서를 올리면 값이 뜬다.</p>`;
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
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && +s.opacity > .05 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight && !el.closest('[hidden]:not(.panel):not(.sam-card)'); };
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
  }
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };

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
  window.inspector = { open: () => setOpen(true), close: () => setOpen(false), set: (k, v) => { on[k] = v; const i = dlg.querySelector(`[data-k="${k}"]`); if (i) i.checked = v; schedule(); } };
})();
