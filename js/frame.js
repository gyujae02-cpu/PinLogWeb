// 액자 모드 — 시계 · 날짜 · 워드마크 · 함께한 날을 전체화면으로 띄운다.
// 태블릿이나 노트북을 세워두고 쓰는 용도라 화면 꺼짐을 막고(Wake Lock),
// 같은 자리에 오래 그려지지 않도록 1분마다 조금씩 위치를 옮긴다(번인 방지).
// 설정은 기기마다 다르게 두는 게 자연스러워서 DB 가 아니라 localStorage 에 둔다.
// stats.js 만 가져오는 말단 모듈이라 ui.js 에서 import 해도 순환이 없다.

import { daysTogether } from './stats.js';

const DRIFT_PX   = 14;
const HINT_MS    = 3200;
const FADE_MS    = 400;
const BAR_MS     = 4000;
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
  date:   true,
  logo:   true,
  burnin: true
});

// 저장된 값이 깨졌거나 예전 형식이어도 허용된 값만 받아들인다.
const CHOICES = {
  bg:     ['sea', 'sunset', 'pink', 'night', 'light', 'custom'],
  sec:    ['small', 'same', 'off'],
  weight: ['light', 'regular'],
  size:   ['normal', 'large']
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

function bind() {
  if (el) return;
  el = {
    root:    $('#frame'),
    time:    $('#frame-time'),
    date:    $('#frame-date'),
    days:    $('#frame-days'),
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
    if (el.root.classList.contains('is-ui')) hideBar();
    else showBar();
  });

  el.btnOpts.addEventListener('click', openSheet);
  el.btnExit.addEventListener('click', () => closeFrame());

  // 선택 버튼(data-opt · data-val)과 스위치(data-toggle)는 시트에서 한 번에 받는다.
  el.sheet.addEventListener('click', (e) => {
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
  // 사용자가 전체화면을 빠져나오면 액자도 같이 닫는다.
  document.addEventListener('fullscreenchange', () => {
    if (open && enteredFullscreen && !document.fullscreenElement) {
      enteredFullscreen = false;
      closeFrame();
    }
  });
}

export function isFrameOpen() { return open; }

export function openFrame() {
  bind();
  if (open) return;
  open = true;

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

// Esc — 설정 시트가 열려 있으면 시트만, 아니면 액자를 닫는다.
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
  if (open) tick();
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

// 매초 0ms 근처에 맞춰 다시 그린다. 자정을 넘기면 날짜와 함께한 날도 같이 바뀐다.
function tick() {
  clearTimeout(tickTimer);
  const now = new Date();

  el.time.innerHTML = timeHtml(now);
  el.date.textContent =
    `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일`;
  el.days.textContent = daysTogether(now);

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
