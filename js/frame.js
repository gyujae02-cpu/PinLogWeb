// 시계 모드 — 시계 · 날짜 · 워드마크를 전체화면으로 띄운다.
// 태블릿이나 노트북을 세워두고 쓰는 용도라 화면 꺼짐을 막고(Wake Lock),
// 같은 자리에 오래 그려지지 않도록 1분마다 조금씩 위치를 옮긴다(번인 방지).
// 시계 아래에는 우리 기록 한 줄(stats.js 의 frameFacts)이 돌아가며 나온다.
// 설정은 기기마다 다르게 두는 게 자연스러워서 DB 가 아니라 localStorage 에 둔다.
// 다른 모듈을 가져오지 않는 말단 모듈이라 어디서 import 해도 순환이 없다.
// 기록 문구는 여는 쪽이 함수로 넘겨준다.

const DRIFT_PX   = 14;
const HINT_MS    = 3200;
const FADE_MS    = 400;
const BAR_MS     = 4000;
const FACT_MS    = 7000;
const FACT_FADE  = 350;
const STORE_KEY  = 'pinlog.frame';
const WEEKDAYS   = ['일', '월', '화', '수', '목', '금', '토'];

// 배경별 브라우저 상단 색. 'custom' 은 고른 색을 그대로 쓴다.
const THEME_COLOR = {
  sea:    '#061E33',
  sunset: '#2B1B4A',
  pink:   '#B8285A',
  night:  '#000000',
  light:  '#F1F6FB'
};

const DEFAULTS = Object.freeze({
  bg:     'sea',
  custom: '#0B4A79',
  hour12: false,
  sec:    'small',
  weight: 'light',
  size:   'normal',
  align:  'center',
  flow:   true,
  date:   true,
  logo:   true,
  facts:  true,
  burnin: true
});

// 저장된 값이 깨졌거나 예전 형식이어도 허용된 값만 받아들인다.
const CHOICES = {
  bg:     ['sea', 'sunset', 'pink', 'night', 'light', 'custom'],
  sec:    ['small', 'same', 'off'],
  weight: ['light', 'regular'],
  size:   ['normal', 'large'],
  align:  ['center', 'top', 'bottom']
};

const $ = (s) => document.querySelector(s);

let el = null;
let open = false;
let opts = { ...DEFAULTS };
let tickTimer = 0;
let hintTimer = 0;
let barTimer = 0;
let wakeLock = null;
let enteredFullscreen = false;
let prevTheme = '';

// 기록 카드
let factsSource = null;
let factTimer = 0;
let factSwapTimer = 0;
let lastFactKey = '';
let lastChoice = -1;

function bind() {
  if (el) return;
  el = {
    root:    $('#frame'),
    time:    $('#frame-time'),
    date:    $('#frame-date'),
    facts:   $('#frame-facts'),
    card:    $('#frame-card'),
    dots:    $('#frame-dots'),
    stage:   $('#frame-stage'),
    hint:    $('#frame-hint'),
    bar:     $('#frame-bar'),
    btnOpts: $('#frame-btn-opts'),
    btnExit: $('#frame-btn-exit'),
    sheet:   $('#frame-sheet'),
    color:   $('#frame-color'),
    warn:    $('#frame-warn'),
    reset:   $('#frame-reset')
  };

  // click 에서 처리한다. pointerdown · touchend 에서 닫으면 뒤이어 오는 click 이
  // 이미 사라진 오버레이를 지나 지도나 핀에 떨어질 수 있다.
  // 빈 곳을 누르면 시트가 열려 있을 땐 시트를, 아니면 도구 막대를 여닫는다.
  el.root.addEventListener('click', (e) => {
    if (el.sheet.contains(e.target) || el.bar.contains(e.target)) return;
    if (!el.sheet.hidden) { closeSheet(); return; }
    // 기록 카드와 점은 넘기는 자리라 도구 막대를 띄우지 않는다.
    // 점은 누르는 사이 새로 그려져 target 이 이미 떨어져 있을 수 있어서,
    // contains 대신 이벤트가 처음 지나온 경로로 확인한다.
    if (e.composedPath().includes(el.facts)) return;
    if (el.root.classList.contains('is-ui')) hideBar();
    else showBar();
  });

  el.dots.style.setProperty('--fact-ms', `${FACT_MS}ms`);
  el.dots.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-i]');
    if (dot && el.sheet.hidden) jumpFact(Number(dot.dataset.i));
  });

  // 카드를 좌우로 밀어 이전 · 다음 기록으로 넘긴다.
  let swipe = null;
  el.card.addEventListener('pointerdown', (e) => {
    swipe = { x: e.clientX, y: e.clientY };
  });
  el.card.addEventListener('pointerup', (e) => {
    if (!swipe || !el.sheet.hidden) { swipe = null; return; }
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) stepFact(dx < 0 ? 1 : -1);
  });
  el.card.addEventListener('pointercancel', () => { swipe = null; });

  el.btnOpts.addEventListener('click', openSheet);
  el.btnExit.addEventListener('click', () => closeFrame());

  // 탭(data-tab), 선택 버튼(data-opt · data-val), 스위치(data-toggle)는 시트에서 한 번에 받는다.
  el.sheet.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { selectTab(tab.dataset.tab); return; }
    const choice = e.target.closest('[data-opt]');
    if (choice) { setOpt(choice.dataset.opt, parseVal(choice.dataset.val)); return; }
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) setOpt(toggle.dataset.toggle, !opts[toggle.dataset.toggle]);
  });

  // 색상 선택기를 열기만 해도 지금 고른 색으로 바꿔 보여준다.
  el.color.addEventListener('click', () => {
    if (opts.bg !== 'custom') setOpt('bg', 'custom');
  });
  // 색을 고르는 동안 바로바로 보여준다.
  el.color.addEventListener('input', () => {
    opts.custom = el.color.value;
    opts.bg = 'custom';
    applyOpts();
  });
  el.color.addEventListener('change', saveOpts);

  el.reset.addEventListener('click', () => {
    opts = { ...DEFAULTS };
    saveOpts();
    applyOpts();
    drift();
  });

  document.addEventListener('visibilitychange', () => {
    if (!open || document.visibilityState !== 'visible') return;
    // 숨겨진 동안 타이머가 멈췄을 수 있고, Wake Lock 은 탭이 가려지면 풀린다.
    tick();
    requestWakeLock();
  });

  // 전체화면에서 Esc 는 브라우저가 먼저 가져가 keydown 이 오지 않는다.
  // 사용자가 전체화면을 빠져나오면 시계 모드도 같이 닫는다.
  document.addEventListener('fullscreenchange', () => {
    if (open && enteredFullscreen && !document.fullscreenElement) {
      enteredFullscreen = false;
      closeFrame();
    }
  });
}

export function isFrameOpen() { return open; }

// facts — 기록 카드 목록을 돌려주는 함수. 카드가 바뀔 때마다 다시 불러
// 그사이 추가된 핀도 바로 반영된다.
export function openFrame({ facts = null } = {}) {
  bind();
  if (open) return;
  open = true;

  factsSource = typeof facts === 'function' ? facts : null;
  lastFactKey = '';
  lastChoice = -1;
  stopFacts();

  opts = loadOpts();
  applyOpts();
  tick();
  drift(true);

  el.sheet.hidden = true;
  el.root.classList.remove('is-ui');
  el.root.hidden = false;
  requestAnimationFrame(() => el.root.classList.add('is-on'));

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) prevTheme = themeMeta.content;
  paintThemeColor();

  // 버튼을 누른 그 자리에서 불러야 사용자 제스처로 인정된다.
  enterFullscreen();

  showHint('화면을 누르면 메뉴가 나와요');
  requestWakeLock().then((ok) => {
    if (!ok && open) showHint('화면이 자동으로 꺼질 수 있어요');
  });
}

export function closeFrame() {
  if (!open) return;
  open = false;

  clearTimeout(tickTimer);
  clearTimeout(hintTimer);
  clearTimeout(barTimer);
  stopFacts();
  releaseWakeLock();

  // 시트 안 버튼에 포커스가 남은 채로 숨겨지지 않게 한다.
  if (el.root.contains(document.activeElement)) document.activeElement.blur();

  if (enteredFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  enteredFullscreen = false;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta && prevTheme) themeMeta.content = prevTheme;

  el.root.classList.remove('is-on', 'is-ui');
  // 닫는 중에 다시 열리면 그대로 둔다.
  setTimeout(() => {
    if (open) return;
    el.root.hidden = true;
    el.sheet.hidden = true;
  }, FADE_MS);
}

// Esc — 설정 시트가 열려 있으면 시트만, 아니면 시계 모드를 닫는다.
export function escapeFrame() {
  if (!open) return;
  if (!el.sheet.hidden) closeSheet();
  else closeFrame();
}

// ── 도구 막대 · 설정 시트 ────────────────────────────

function showBar() {
  el.root.classList.add('is-ui');
  clearTimeout(barTimer);
  barTimer = setTimeout(hideBar, BAR_MS);
}

function hideBar() {
  clearTimeout(barTimer);
  el.root.classList.remove('is-ui');
}

function openSheet() {
  hideBar();
  el.sheet.hidden = false;
}

function closeSheet() {
  if (el.sheet.contains(document.activeElement)) document.activeElement.blur();
  el.sheet.hidden = true;
}

// 설정을 화면 · 시계 · 표시 세 묶음으로 나눠 한 번에 하나만 보인다.
// 닫았다 다시 열면 마지막에 보던 묶음이 그대로 열린다.
function selectTab(name) {
  for (const t of el.sheet.querySelectorAll('[data-tab]')) {
    t.setAttribute('aria-selected', String(t.dataset.tab === name));
  }
  for (const p of el.sheet.querySelectorAll('[data-pane]')) {
    p.hidden = p.dataset.pane !== name;
  }
}

// ── 설정 ────────────────────────────────────────────

function parseVal(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function setOpt(key, val) {
  if (!(key in DEFAULTS)) return;
  opts[key] = val;
  saveOpts();
  applyOpts();
  if (key === 'burnin') drift(!val);
}

function loadOpts() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) {}
  const next = { ...DEFAULTS };
  if (!saved || typeof saved !== 'object') return next;

  for (const key of Object.keys(DEFAULTS)) {
    const v = saved[key];
    if (CHOICES[key]) { if (CHOICES[key].includes(v)) next[key] = v; }
    else if (key === 'custom') { if (/^#[0-9a-f]{6}$/i.test(v)) next[key] = v; }
    else if (typeof v === 'boolean') next[key] = v;
  }
  return next;
}

function saveOpts() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(opts)); } catch (_) {}
}

function applyOpts() {
  const r = el.root;
  r.dataset.bg     = opts.bg;
  r.dataset.sec    = opts.sec;
  r.dataset.weight = opts.weight;
  r.dataset.size   = opts.size;
  r.dataset.align  = opts.align;
  r.dataset.flow   = String(opts.flow);
  r.dataset.hour12 = String(opts.hour12);
  r.dataset.tone   = toneOf(opts);
  r.style.setProperty('--frame-custom', opts.custom);
  r.classList.toggle('is-no-date', !opts.date);
  r.classList.toggle('is-no-logo', !opts.logo);

  // 시트의 선택 상태를 맞춘다.
  for (const b of el.sheet.querySelectorAll('[data-opt]')) {
    const on = String(opts[b.dataset.opt]) === b.dataset.val;
    b.setAttribute('aria-pressed', String(on));
  }
  for (const b of el.sheet.querySelectorAll('[data-toggle]')) {
    b.setAttribute('aria-checked', String(!!opts[b.dataset.toggle]));
  }
  el.color.value = opts.custom;
  el.color.closest('.frame-swatch').setAttribute('aria-pressed', String(opts.bg === 'custom'));

  // 완전 검정 배경은 OLED 에서 자국이 남기 쉽다.
  el.warn.hidden = !(opts.bg === 'night' && !opts.burnin);

  paintThemeColor();
  if (open) { tick(); syncFacts(); }
}

// 배경이 밝으면 잉크색 글씨, 어두우면 흰 글씨.
function toneOf(o) {
  if (o.bg === 'light') return 'light';
  if (o.bg !== 'custom') return 'dark';
  const n = parseInt(o.custom.slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // 흰 글씨와 잉크(#16202B) 글씨의 대비가 같아지는 지점 근처에서 가른다.
  return L > 0.2 ? 'light' : 'dark';
}

function paintThemeColor() {
  if (!open) return;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = opts.bg === 'custom' ? opts.custom : THEME_COLOR[opts.bg];
}

// ── 시계 ────────────────────────────────────────────

// 매초 0ms 근처에 맞춰 다시 그린다. 자정을 넘기면 날짜도 같이 바뀐다.
function tick() {
  clearTimeout(tickTimer);
  const now = new Date();

  el.time.innerHTML = timeHtml(now);
  el.date.textContent =
    `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일`;

  if (now.getSeconds() === 0) drift();

  tickTimer = setTimeout(tick, 1000 - now.getMilliseconds() + 20);
}

// 세방고딕은 숫자 폭이 제각각이라 그대로 두면 매초 시계가 좌우로 흔들린다.
// 숫자 하나하나를 같은 폭 칸에 넣어 고정한다.
function digits(n) {
  return String(n).padStart(2, '0').split('')
    .map((d) => `<span class="frame__d">${d}</span>`).join('');
}

function timeHtml(now) {
  let h = now.getHours();
  let ampm = '';
  if (opts.hour12) {
    ampm = `<span class="frame__ampm">${h < 12 ? '오전' : '오후'}</span>`;
    h = h % 12 || 12;
  }
  const colon = '<span class="frame__colon">:</span>';
  const hm = `${digits(h)}${colon}${digits(now.getMinutes())}`;

  let sec = '';
  if (opts.sec === 'same')  sec = `${colon}${digits(now.getSeconds())}`;
  if (opts.sec === 'small') sec = `<span class="frame__sec">${digits(now.getSeconds())}</span>`;

  return `${ampm}${hm}${sec}`;
}

// ── 기록 카드 ────────────────────────────────────────

// 카드 머리글 아이콘. 고정된 문자열이라 innerHTML 로 넣어도 안전하다.
const FACT_ICONS = {
  summary: '<path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.2"/>',
  month:   '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  latest:  '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.2l2.8 1.8"/>',
  region:  '<path d="M9 5 4 7v12l5-2 6 2 5-2V5l-5 2-6-2Z"/><path d="M9 5v12M15 7v12"/>',
  wish:    '<path d="m12 4 1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z"/><path d="m18.5 15.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/>'
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 설정이 켜져 있으면 돌리고, 꺼져 있으면 멈추고 숨긴다. 이미 돌고 있으면 그대로 둔다.
function syncFacts() {
  if (!open || !opts.facts || !factsSource) { stopFacts(); el.facts.hidden = true; return; }
  if (factTimer) return;
  stepFact(1, true);
}

function stopFacts() {
  clearTimeout(factTimer);
  clearTimeout(factSwapTimer);
  factTimer = 0;
  factSwapTimer = 0;
}

// 넘길 때마다 7초를 처음부터 다시 센다. 손으로 넘겨도 마찬가지.
function scheduleFact() {
  clearTimeout(factTimer);
  factTimer = setTimeout(() => stepFact(1), FACT_MS);
}

function readFacts() {
  try {
    const list = factsSource();
    return Array.isArray(list) ? list.filter((f) => f && (f.value || f.choices?.length)) : [];
  } catch (err) {
    console.error('[PinLog] 시계 모드 기록 카드 실패:', err);
    return [];
  }
}

// 지금 카드에서 delta 만큼 옮긴다. 목록이 바뀌어 지금 카드가 빠졌으면 처음부터.
function stepFact(delta, instant = false) {
  const list = readFacts();
  // 카드가 없어도 계속 확인해서, 그사이 핀이 생기면 나타나게 한다.
  if (!list.length) { el.facts.hidden = true; scheduleFact(); return; }

  const cur = list.findIndex((f) => f.key === lastFactKey);
  const idx = cur < 0 ? 0 : (cur + delta + list.length) % list.length;
  showFact(list, idx, delta, instant);
}

function jumpFact(idx) {
  const list = readFacts();
  if (!list[idx]) return;
  const cur = list.findIndex((f) => f.key === lastFactKey);
  if (idx === cur) { scheduleFact(); paintDots(list.length, idx); return; }
  showFact(list, idx, idx > cur ? 1 : -1, false);
}

function showFact(list, idx, dir, instant) {
  const fact = resolveFact(list[idx]);
  lastFactKey = fact.key;

  el.facts.hidden = false;
  paintDots(list.length, idx);
  scheduleFact();

  clearTimeout(factSwapTimer);
  const card = el.card;
  if (instant || reducedMotion()) {
    card.classList.remove('is-out', 'is-pre');
    renderCard(fact);
    return;
  }

  // 지금 카드를 반대쪽으로 밀어내고, 새 카드는 들어오는 쪽에서 밀려 들어온다.
  card.style.setProperty('--dir', String(dir));
  card.classList.remove('is-pre');
  card.classList.add('is-out');
  factSwapTimer = setTimeout(() => {
    renderCard(fact);
    card.classList.remove('is-out');
    card.classList.add('is-pre');
    void card.offsetWidth;
    card.classList.remove('is-pre');
  }, FACT_FADE);
}

// choices 가 있으면 하나를 골라 덮어쓴다. 같은 곳이 연달아 나오지 않게 한다.
function resolveFact(fact) {
  if (!fact.choices) return fact;
  let i = Math.floor(Math.random() * fact.choices.length);
  if (fact.choices.length > 1 && i === lastChoice) i = (i + 1) % fact.choices.length;
  lastChoice = i;
  return { ...fact, ...fact.choices[i] };
}

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// 장소 이름은 사용자가 쓴 값이라 innerHTML 이 아니라 텍스트 노드로 넣는다.
function renderCard(f) {
  const head = h('p', 'frame-card__label');
  const icon = h('span', 'frame-card__icon');
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FACT_ICONS[f.key] || FACT_ICONS.summary}</svg>`;
  head.append(icon, h('span', '', f.label || ''));

  const value = h('p', 'frame-card__value');
  value.append(...(f.value || []).map(([text, strong]) =>
    strong ? h('strong', '', text) : document.createTextNode(text)));

  const sub = h('p', 'frame-card__sub');
  if (Number.isFinite(f.rate)) {
    const bar = h('span', 'frame-card__rate');
    bar.style.setProperty('--rate', `${Math.max(0, Math.min(100, f.rate))}%`);
    bar.append(h('i'));
    sub.append(bar);
  }
  sub.append(h('span', '', f.sub || ''));

  el.card.replaceChildren(head, value, sub);
}

// 지금 카드는 7초 동안 차오르는 막대, 나머지는 작은 점.
// 매번 새로 만들어 막대 애니메이션이 처음부터 다시 돈다.
function paintDots(count, active) {
  el.dots.hidden = count < 2;
  el.dots.replaceChildren(...Array.from({ length: count }, (_, i) => {
    const b = h('button', 'frame-dot');
    b.type = 'button';
    b.dataset.i = String(i);
    b.setAttribute('aria-label', `${count}개 중 ${i + 1}번째 기록`);
    if (i === active) {
      b.classList.add('is-on');
      b.setAttribute('aria-current', 'true');
      b.append(h('i'));
    }
    return b;
  }));
}

// 번인 방지. 가운데를 기준으로 ±DRIFT_PX 안에서 옮긴다. 꺼져 있으면 가운데에 둔다.
function drift(reset = false) {
  const still = reset || !opts.burnin;
  const r = () => (still ? 0 : Math.round((Math.random() * 2 - 1) * DRIFT_PX));
  el.stage.style.setProperty('--dx', `${r()}px`);
  el.stage.style.setProperty('--dy', `${r()}px`);
}

// ── 안내 · 전체화면 · Wake Lock ─────────────────────

function showHint(text) {
  clearTimeout(hintTimer);
  el.hint.textContent = text;
  el.hint.classList.add('is-on');
  hintTimer = setTimeout(() => el.hint.classList.remove('is-on'), HINT_MS);
}

function enterFullscreen() {
  const root = document.documentElement;
  if (!document.fullscreenEnabled || document.fullscreenElement || !root.requestFullscreen) return;
  root.requestFullscreen({ navigationUI: 'hide' })
    .then(() => { if (open) enteredFullscreen = true; else document.exitFullscreen().catch(() => {}); })
    .catch(() => {});
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return false;
  if (wakeLock && !wakeLock.released) return true;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    // 요청이 끝나기 전에 닫혔으면 바로 놓는다.
    if (!open) releaseWakeLock();
    return true;
  } catch (_) {
    return false;
  }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  wakeLock.release().catch(() => {});
  wakeLock = null;
}
