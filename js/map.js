import { tagById } from './tags.js';
import { userColor } from './users.js';
import { distanceMeters } from './geo.js';

const DEFAULT_CENTER = { lat: 37.5666805, lng: 126.9784147 };

const MIN_LEVEL = 1;
const MAX_LEVEL = 12;

const COMPACT_FROM_LEVEL = 6;

const PAN_BOUNDS = {
  minLat: 32.5,
  maxLat: 39.2,
  minLng: 124.0,
  maxLng: 132.3
};

let map = null;
let container = null;
let listeners = [];
let overlays = new Map();
let meOverlay = null;
let meCircle = null;
let places = null;
let geocoder = null;
let activeId = null;
let resizeObs = null;
let lastSize = '';
let rvOverlay = null;
let rvClient = null;
let roadview = null;
let rvContainer = null;

// 코스 보기 — 켜져 있는 동안 코스에 든 핀에 번호를 달고 선으로 잇는다.
// courseNos: 핀 id → 순번(1부터). 비어 있으면 코스 보기가 꺼진 상태다.
let courseLine = null;
let courseNos = new Map();

let handlers = {
  onMapClick: null,
  onPinClick: null
};

export function loadKakao() {
  return new Promise((resolve, reject) => {
    if (typeof kakao === 'undefined' || !kakao.maps) {

      reject(new Error(
        `카카오맵을 불러오지 못했어요. 카카오 개발자 콘솔 > 앱 설정 > 플랫폼 > Web 에 ` +
        `'${location.origin}' 을 등록해주세요.`
      ));
      return;
    }
    if (kakao.maps.Map) { resolve(); return; }
    kakao.maps.load(() => resolve());
  });
}

export function getCurrentPosition(options = {}) {
  const opts = {
    enableHighAccuracy: false,
    timeout: 10000,
    maximumAge: 0,
    ...options
  };

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ...DEFAULT_CENTER, fallback: true, reason: 'unsupported' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        fallback: false
      }),
      (err) => resolve({ ...DEFAULT_CENTER, fallback: true, reason: geoReason(err) }),
      opts
    );
  });
}

function geoReason(err) {
  switch (err && err.code) {
    case 1:  return 'denied';
    case 2:  return 'unavailable';
    case 3:  return 'timeout';
    default: return 'unknown';
  }
}

export function geoErrorMessage(reason) {
  switch (reason) {
    case 'denied':
      return '위치 권한이 차단돼 있어요. 주소창 왼쪽 아이콘 → 위치 → 허용으로 바꿔주세요.';
    case 'unavailable':
      return 'PC 위치 서비스가 꺼져 있어요. Windows 설정 → 개인 정보 및 보안 → 위치 를 켜주세요.';
    case 'timeout':
      return '위치 조회가 시간을 초과했어요. 잠시 후 다시 시도해주세요.';
    case 'unsupported':
      return '이 브라우저는 위치 기능을 지원하지 않아요.';
    default:
      return '위치를 확인할 수 없어요.';
  }
}

export function levelForAccuracy(accuracy) {
  const a = Number(accuracy);
  if (!Number.isFinite(a)) return 5;
  if (a <= 100)   return 3;
  if (a <= 500)   return 5;
  if (a <= 2000)  return 6;
  if (a <= 10000) return 8;
  return 9;
}

export { DEFAULT_CENTER };

export function createMap(el, center, cbs = {}) {
  destroyMap();

  container = el;
  container.innerHTML = '';

  handlers.onMapClick = cbs.onMapClick || null;
  handlers.onPinClick = cbs.onPinClick || null;

  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(center.lat, center.lng),
    level: Number.isFinite(center.level) ? center.level : 5
  });
  map.setMaxLevel(MAX_LEVEL);

  on(map, 'click', (mouseEvent) => {
    if (!handlers.onMapClick) return;
    const ll = mouseEvent.latLng;
    handlers.onMapClick({ lat: ll.getLat(), lng: ll.getLng() });
  });

  on(map, 'drag', clampCenter);
  on(map, 'idle', clampCenter);

  on(map, 'zoom_changed', applyCompactPins);

  watchContainerSize();

  return map;
}

// 모바일 브라우저는 주소창이 접히면 화면이 세로로 커지고, 화면을 돌려도 크기가 바뀐다.
// 카카오맵은 만들어질 때 잰 컨테이너 크기를 계속 쓰기 때문에,
// 바뀐 걸 알려주지 않으면 지도가 생각하는 중심과 화면의 실제 중심이 어긋난다.
// 그러면 CSS 로 화면 정중앙에 그리는 위치 선택 핀과 실제 좌표가 따로 놀게 된다.
function watchContainerSize() {
  lastSize = sizeKey();

  // 알림 하나만 믿지 않고 올 수 있는 곳에 모두 붙인다.
  // 크기가 그대로면 applyRelayout 이 바로 빠져나오므로 중복 호출은 공짜다.
  if (typeof ResizeObserver === 'function') {
    resizeObs = new ResizeObserver(applyRelayout);
    resizeObs.observe(container);
  }

  window.addEventListener('resize', applyRelayout);
  window.addEventListener('orientationchange', applyRelayout);

  // 모바일 키보드나 툴바는 visualViewport 만 먼저 바뀌고
  // 레이아웃은 한 박자 늦게 따라오는 경우가 있다.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', applyRelayout);
  }
}

function sizeKey() {
  return container ? `${container.clientWidth}x${container.clientHeight}` : '';
}

// 컨테이너 크기가 바뀌면 카카오맵에게 바로 알려준다.
// ResizeObserver 콜백은 레이아웃 뒤 · 그리기 전에 돌기 때문에,
// 여기서 곧장 맞추면 어긋난 화면이 한 프레임도 보이지 않는다.
function applyRelayout() {
  if (!map || !container) return;

  // 크기가 실제로 달라졌을 때만 다시 그린다.
  const key = sizeKey();
  if (key === lastSize) return;
  lastSize = key;

  // relayout() 은 왼쪽 위를 기준으로 영역을 다시 잡는다.
  // 그래서 주소창이 나타나 높이가 h 만큼 줄면 중심이 h/2 만큼 밀린다.
  // 보고 있던 자리가 그대로 남도록 중심을 기억했다가 되돌린다.
  const center = map.getCenter();
  map.relayout();
  map.setCenter(center);

  // 로드뷰도 컨테이너 크기를 기억하는 건 지도와 똑같다.
  if (roadview) roadview.relayout();
}

// 중심 좌표를 읽거나 지도를 옮기기 전에 불러서 크기를 먼저 맞춰둔다.
export function syncSize() {
  applyRelayout();
}

function unwatchContainerSize() {
  if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }

  window.removeEventListener('resize', applyRelayout);
  window.removeEventListener('orientationchange', applyRelayout);

  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', applyRelayout);
  }

  lastSize = '';
}

function clampCenter() {
  if (!map) return;

  const c = map.getCenter();
  const lat = c.getLat();
  const lng = c.getLng();

  const nextLat = Math.min(PAN_BOUNDS.maxLat, Math.max(PAN_BOUNDS.minLat, lat));
  const nextLng = Math.min(PAN_BOUNDS.maxLng, Math.max(PAN_BOUNDS.minLng, lng));

  if (nextLat === lat && nextLng === lng) return;

  map.setCenter(new kakao.maps.LatLng(nextLat, nextLng));
}

export function destroyMap() {

  if (rvOverlay) { rvOverlay.setMap(null); rvOverlay = null; }
  rvClient = null;
  roadview = null;
  rvContainer = null;

  unwatchContainerSize();
  clearCourse();
  clearPins();

  if (meOverlay) { meOverlay.setMap(null); meOverlay = null; }
  if (meCircle)  { meCircle.setMap(null);  meCircle = null; }

  listeners.forEach(({ target, type, handler }) => {
    try { kakao.maps.event.removeListener(target, type, handler); } catch (_) {  }
  });
  listeners = [];

  map = null;
  if (container) { container.innerHTML = ''; container = null; }

  handlers.onMapClick = null;
  handlers.onPinClick = null;
  activeId = null;
  places = null;
  geocoder = null;
}

function on(target, type, handler) {
  kakao.maps.event.addListener(target, type, handler);
  listeners.push({ target, type, handler });
  return () => off(target, type, handler);
}

function off(target, type, handler) {
  try { kakao.maps.event.removeListener(target, type, handler); } catch (_) {  }
  listeners = listeners.filter(
    (l) => !(l.target === target && l.type === type && l.handler === handler)
  );
}

export function onIdle(cb) {
  if (!map) return () => {};
  return on(map, 'idle', cb);
}

export function zoomIn() {
  setZoomLevel(getLevel() - 1);
}

export function zoomOut() {
  setZoomLevel(getLevel() + 1);
}

export function getLevel() {
  return map ? map.getLevel() : MAX_LEVEL;
}

function setZoomLevel(level) {
  if (!map) return;
  const next = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));
  if (next === map.getLevel()) return;
  map.setLevel(next, { animate: true });
}

export function getZoomState() {
  const level = getLevel();
  return {
    level,
    canZoomIn:  level > MIN_LEVEL,
    canZoomOut: level < MAX_LEVEL
  };
}

export function onZoomChange(cb) {
  if (!map) return () => {};
  return on(map, 'zoom_changed', cb);
}

export function isReady() { return !!map; }
export function getMap()  { return map; }

export function renderPins(pins) {
  if (!map) return;

  const nextIds = new Set(pins.map((p) => p.id));

  overlays.forEach((entry, id) => {
    if (!nextIds.has(id)) {
      entry.overlay.setMap(null);
      overlays.delete(id);
    }
  });

  pins.forEach((pin) => {
    const sig = pinSignature(pin);
    const exist = overlays.get(pin.id);

    if (exist) {
      if (exist.sig !== sig) {
        paintPinElement(exist.el, pin);
        exist.overlay.setPosition(new kakao.maps.LatLng(pin.lat, pin.lng));
        exist.sig = sig;
      }
      return;
    }

    const el = createPinElement(pin);
    el.classList.toggle('is-compact', isCompact());

    const z = baseZIndex(pin);
    // 내용은 0×0 이고 실제 핀 모양은 CSS 가 좌표 위에 얹는다.
    // 그래서 앵커는 좌표 그 자체(0, 0)로 두면 된다.
    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(pin.lat, pin.lng),
      content: el,
      xAnchor: 0,
      yAnchor: 0,
      clickable: true,
      zIndex: z
    });
    overlay.setMap(map);
    overlays.set(pin.id, { overlay, el, sig, z });
  });

  applyActiveClass();
  applyCompactPins();
}

function baseZIndex(pin) {
  return Math.round((90 - pin.lat) * 100);
}

function isCompact() {
  return getLevel() >= COMPACT_FROM_LEVEL;
}

function applyCompactPins() {
  const compact = isCompact();
  overlays.forEach((entry) => entry.el.classList.toggle('is-compact', compact));
}

function pinSignature(pin) {
  const tag = pin.tags && pin.tags.length ? pin.tags[0] : '';
  const cam = pin.photoCount > 0 ? '1' : '0';

  return `${pin.name}|${pin.category}|${pin.lat}|${pin.lng}|${tag}|${cam}|${pin.createdBy}`;
}

function createPinElement(pin) {
  const el = document.createElement('div');
  el.className = 'pin';

  el.innerHTML =
    '<div class="pin__body">' +
      '<span class="pin__medal">' +
        '<span class="pin__emoji"></span>' +
        '<span class="pin__blank"></span>' +
        '<span class="pin__badge"></span>' +
      '</span>' +
      '<span class="pin__label"></span>' +
      '<span class="pin__cam">' +
        '<svg viewBox="0 0 24 24" fill="none" class="w-[11px] h-[11px]">' +
          '<path d="M4 8.5h3l1.4-2h7.2L17 8.5h3v10H4v-10Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
          '<circle cx="12" cy="13" r="2.8" stroke="currentColor" stroke-width="1.9"/>' +
        '</svg>' +
      '</span>' +
      '<span class="pin__tail"></span>' +
      '<span class="pin__no" hidden></span>' +
    '</div>';

  paintPinElement(el, pin);

  const stop = (e) => e.stopPropagation();
  el.addEventListener('mousedown', stop);
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (handlers.onPinClick) handlers.onPinClick(pin.id);
  });

  return el;
}

function paintPinElement(el, pin) {
  el.dataset.cat = pin.category;

  el.querySelector('.pin__label').textContent = pin.name;

  const color = userColor(pin.createdBy);
  const medal = el.querySelector('.pin__medal');
  medal.style.borderColor = color.dot;
  medal.style.background = color.soft;

  const tag = pin.tags && pin.tags.length ? tagById(pin.tags[0]) : null;
  const emojiEl = el.querySelector('.pin__emoji');
  const blankEl = el.querySelector('.pin__blank');

  emojiEl.textContent = tag ? tag.emoji : '';
  emojiEl.hidden = !tag;
  blankEl.hidden = !!tag;
  blankEl.style.background = color.dot;

  el.querySelector('.pin__cam').hidden = !(pin.photoCount > 0);
}

export function clearPins() {
  overlays.forEach(({ overlay }) => overlay.setMap(null));
  overlays.clear();
}

export function setActivePin(id) {
  activeId = id;
  applyActiveClass();
}

// 선택된 핀과 코스 번호를 함께 칠한다. 둘 다 z-index 를 건드리기 때문이다.
// 코스 보기 중에는 코스 핀이 다른 핀 위로 오고, 나머지는 흐려진다.
function applyActiveClass() {
  const courseOn = courseNos.size > 0;

  overlays.forEach((entry, id) => {
    const on = id === activeId;
    const no = courseNos.get(id) || 0;

    entry.el.classList.toggle('is-active', on);
    entry.el.classList.toggle('is-dimmed', courseOn && !no);

    const noEl = entry.el.querySelector('.pin__no');
    noEl.hidden = !no;
    noEl.textContent = no ? String(no) : '';

    entry.overlay.setZIndex(on ? 10000 : no ? 9000 - no : entry.z);
  });
}

// stops: [{ id, lat, lng }] — 코스 순서대로.
// 번호는 핀 오버레이에 직접 단다. 따로 오버레이를 얹으면 핀 이름표 폭에 따라
// 번호 자리가 매번 달라지고, 줌에 따라 핀이 접힐 때도 따로 놀기 때문이다.
export function showCourse(stops, opts = {}) {
  if (!map) return;

  if (courseLine) { courseLine.setMap(null); courseLine = null; }
  courseNos = new Map(stops.map((s, i) => [s.id, i + 1]));

  if (stops.length >= 2) {
    courseLine = new kakao.maps.Polyline({
      path: stops.map((s) => new kakao.maps.LatLng(s.lat, s.lng)),
      strokeWeight: 5,
      strokeColor: '#0B6FB5',
      strokeOpacity: 0.85,
      // 다녀온 코스는 실선, 계획 중인 코스는 점선으로 구분한다.
      strokeStyle: opts.done ? 'solid' : 'shortdash'
    });
    courseLine.setMap(map);
  }

  applyActiveClass();
}

export function clearCourse() {
  if (courseLine) { courseLine.setMap(null); courseLine = null; }
  if (!courseNos.size) return;
  courseNos = new Map();
  applyActiveClass();
}

// 점들이 모두 보이도록 지도를 맞춘다. padding 은 화면 가장자리를 가리는
// 상단바 · 하단 카드만큼 비워둘 여백이다.
export function fitPoints(points, padding = {}) {
  if (!map || !points.length) return;

  syncSize();

  // 점이 하나면 영역이 0 이라 최대로 확대돼 버린다. 적당한 높이로 옮긴다.
  if (points.length === 1) {
    map.setLevel(4);
    map.setCenter(new kakao.maps.LatLng(points[0].lat, points[0].lng));
    return;
  }

  const bounds = new kakao.maps.LatLngBounds();
  points.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));

  map.setBounds(
    bounds,
    padding.top    ?? 60,
    padding.right  ?? 40,
    padding.bottom ?? 60,
    padding.left   ?? 40
  );
}

export function panTo(lat, lng) {
  if (!map) return;
  syncSize();
  map.panTo(new kakao.maps.LatLng(lat, lng));
}

export function moveTo(lat, lng, level) {
  if (!map) return;
  syncSize();
  if (typeof level === 'number') map.setLevel(level);
  map.setCenter(new kakao.maps.LatLng(lat, lng));
}

// 위성은 HYBRID(위성 + 도로 · 지명 라벨)를 쓴다.
// 순수 SKYVIEW 는 지명이 사라져서 어디인지 읽을 수가 없다.
// 로드뷰가 있는 도로를 지도 위에 파란 선으로 덮는다.
export function setRoadviewOverlay(on) {
  if (!map) return;
  if (!rvOverlay) rvOverlay = new kakao.maps.RoadviewOverlay();
  rvOverlay.setMap(on ? map : null);
}

// 찍은 자리에서 가장 가까운 파노라마를 찾는다. 없으면 null 이다.
export function findPano(lat, lng, radius = 50) {
  return new Promise((resolve) => {
    if (!rvClient) rvClient = new kakao.maps.RoadviewClient();
    rvClient.getNearestPanoId(new kakao.maps.LatLng(lat, lng), radius, (id) => resolve(id || null));
  });
}

// 숨어 있는 칸에 만들면 크기를 0 으로 기억해 버린다.
// 그래서 화면에 먼저 띄운 뒤에 불러야 한다.
export function showRoadview(el, panoId, lat, lng) {
  if (!roadview || rvContainer !== el) {
    rvContainer = el;
    roadview = new kakao.maps.Roadview(el);
  } else {
    roadview.relayout();
  }

  roadview.setPanoId(panoId, new kakao.maps.LatLng(lat, lng));
}

export function setSkyview(on) {
  if (!map) return;
  map.setMapTypeId(on ? kakao.maps.MapTypeId.HYBRID : kakao.maps.MapTypeId.ROADMAP);
}

export function getCenter() {
  if (!map) return { ...DEFAULT_CENTER };
  syncSize();
  const c = map.getCenter();
  return { lat: c.getLat(), lng: c.getLng() };
}

// 화면 정중앙 — 위치 선택 핀이 꽂혀 있는 그 픽셀 — 에 실제로 그려진 좌표.
// getCenter() 는 지도가 "기억하는" 중심이라 컨테이너 크기가 낡으면 핀과 어긋나지만,
// 이 함수는 눈에 보이는 지점에서 거꾸로 좌표를 읽으므로 항상 핀 아래를 가리킨다.
export function getCrosshairCoord() {
  if (!map || !container) return getCenter();

  syncSize();

  const point = new kakao.maps.Point(container.clientWidth / 2, container.clientHeight / 2);
  const ll = map.getProjection().coordsFromContainerPoint(point);

  return { lat: ll.getLat(), lng: ll.getLng() };
}

export function panToWithOffset(lat, lng, offset = {}) {
  if (!map) return;

  syncSize();

  const proj = map.getProjection();
  const point = proj.containerPointFromCoords(new kakao.maps.LatLng(lat, lng));

  point.x += offset.x || 0;
  point.y += offset.y || 0;

  map.panTo(proj.coordsFromContainerPoint(point));
}

export function showMyLocation(lat, lng, accuracy) {
  if (!map) return;
  if (meOverlay) { meOverlay.setMap(null); meOverlay = null; }
  if (meCircle)  { meCircle.setMap(null);  meCircle = null; }

  const pos = new kakao.maps.LatLng(lat, lng);

  if (Number.isFinite(accuracy) && accuracy > 60) {
    meCircle = new kakao.maps.Circle({
      center: pos,
      radius: accuracy,
      strokeWeight: 1,
      strokeColor: '#3B82F6',
      strokeOpacity: 0.45,
      strokeStyle: 'solid',
      fillColor: '#3B82F6',
      fillOpacity: 0.10
    });
    meCircle.setMap(map);
  }

  const el = document.createElement('div');
  el.className = 'me';
  el.innerHTML = '<span class="me__ring"></span><span class="me__core"></span>';

  meOverlay = new kakao.maps.CustomOverlay({
    position: pos,
    content: el,
    yAnchor: 0.5,
    xAnchor: 0.5,
    zIndex: 1
  });
  meOverlay.setMap(map);
}

export function onUserInteract(cb) {
  if (!map) return () => {};
  const offDrag = on(map, 'dragstart', cb);
  const offZoom = on(map, 'zoom_start', cb);
  return () => { offDrag(); offZoom(); };
}

function getPlaces() {
  if (!places) places = new kakao.maps.services.Places();
  return places;
}
function getGeocoder() {
  if (!geocoder) geocoder = new kakao.maps.services.Geocoder();
  return geocoder;
}

export function searchPlaces(keyword) {
  return new Promise((resolve, reject) => {
    const kw = (keyword || '').trim();
    if (!kw) { resolve([]); return; }

    const from = map ? map.getCenter() : null;

    getPlaces().keywordSearch(kw, (data, status) => {
      if (status === kakao.maps.services.Status.OK) {
        resolve(data.map((d) => {
          const lat = parseFloat(d.y);
          const lng = parseFloat(d.x);
          return {
            id: d.id,
            name: d.place_name,
            address: d.address_name || '',
            roadAddress: d.road_address_name || '',
            category: (d.category_group_name || d.category_name || '').split('>').pop().trim(),
            lat,
            lng,
            distance: from ? distanceMeters(from.getLat(), from.getLng(), lat, lng) : null
          };
        }));
      } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
        resolve([]);
      } else {
        reject(new Error('장소 검색에 실패했어요.'));
      }
    }, { size: 15 });
  });
}

export function coordToAddress(lat, lng) {
  return new Promise((resolve) => {
    try {
      getGeocoder().coord2Address(lng, lat, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          const road = result[0].road_address && result[0].road_address.address_name;
          const jibun = result[0].address && result[0].address.address_name;
          resolve(road || jibun || '');
        } else {
          resolve('');
        }
      });
    } catch (_) {
      resolve('');
    }
  });
}
