// 액자 모드 — 시계 · 날짜 · 워드마크 · 함께한 날을 전체화면으로 띄운다.
// 태블릿이나 노트북을 세워두고 쓰는 용도라 화면 꺼짐을 막고(Wake Lock),
// 같은 자리에 오래 그려지지 않도록 1분마다 조금씩 위치를 옮긴다.
// stats.js 만 가져오는 말단 모듈이라 ui.js 에서 import 해도 순환이 없다.

import { daysTogether } from './stats.js';

const DRIFT_PX = 14;
const HINT_MS  = 3200;
const FADE_MS  = 400;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const $ = (s) => document.querySelector(s);

let el = null;
let open = false;
let tickTimer = 0;
let hintTimer = 0;
let wakeLock = null;
let enteredFullscreen = false;
let prevTheme = '';

function bind() {
  if (el) return;
  el = {
    root:  $('#frame'),
    time:  $('#frame-time'),
    date:  $('#frame-date'),
    days:  $('#frame-days'),
    stage: $('#frame-stage'),
    hint:  $('#frame-hint')
  };

  // click 에서 닫는다. pointerdown · touchend 에서 닫으면 뒤이어 오는 click 이
  // 이미 사라진 오버레이를 지나 지도나 핀에 떨어질 수 있다.
  el.root.addEventListener('click', () => closeFrame());

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

  tick();
  drift(true);

  el.root.hidden = false;
  requestAnimationFrame(() => el.root.classList.add('is-on'));

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) { prevTheme = themeMeta.content; themeMeta.content = '#061E33'; }

  // 버튼을 누른 그 자리에서 불러야 사용자 제스처로 인정된다.
  enterFullscreen();

  showHint('화면을 누르면 닫혀요');
  requestWakeLock().then((ok) => {
    if (!ok && open) showHint('화면이 자동으로 꺼질 수 있어요 · 누르면 닫혀요');
  });
}

export function closeFrame() {
  if (!open) return;
  open = false;

  clearTimeout(tickTimer);
  clearTimeout(hintTimer);
  releaseWakeLock();

  if (enteredFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  enteredFullscreen = false;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta && prevTheme) themeMeta.content = prevTheme;

  el.root.classList.remove('is-on');
  // 닫는 중에 다시 열리면 그대로 둔다.
  setTimeout(() => { if (!open) el.root.hidden = true; }, FADE_MS);
}

// 매 분 0초에 맞춰 다시 그린다. 자정을 넘기면 날짜와 함께한 날도 같이 바뀐다.
function tick() {
  clearTimeout(tickTimer);
  const now = new Date();

  el.time.textContent =
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  el.date.textContent =
    `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일`;
  el.days.textContent = daysTogether(now);

  if (now.getSeconds() < 2) drift();

  const wait = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50;
  tickTimer = setTimeout(tick, wait);
}

// 번인 방지. 가운데를 기준으로 ±DRIFT_PX 안에서 옮긴다.
function drift(reset = false) {
  const r = () => (reset ? 0 : Math.round((Math.random() * 2 - 1) * DRIFT_PX));
  el.stage.style.setProperty('--dx', `${r()}px`);
  el.stage.style.setProperty('--dy', `${r()}px`);
}

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
