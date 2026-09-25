import * as FB from './firebase.js';
import * as MapCtl from './map.js';
import * as UI from './ui.js';
import { makeCover } from './photo.js';
import { collectUsers, normalizeId, displayName } from './users.js';

// 카카오내비는 앱을 띄우는 방식이라 휴대폰에서만 동작한다.
// userAgentData 를 주는 브라우저에서는 그 값을, 아니면 UA 문자열을 본다.
const IS_MOBILE = navigator.userAgentData?.mobile
  ?? /android|iphone|ipad|ipod/i.test(navigator.userAgent);

function blockPageZoom(e) {
  if (e.target && e.target.closest && e.target.closest('#map')) return;
  e.preventDefault();
}

['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
  document.addEventListener(type, blockPageZoom, { passive: false });
});

const state = {
  pins: [],
  users: [],
  courses: [],
  unsubscribePins: null,
  unsubscribeCourses: null,
  courseViewId: null,
  courseEditingId: null,
  courseFocusId: null,
  unsubPhotos: null,
  unsubComments: null,
  pickerIdleOff: null,
  pickerName: '',
  userMoveOff: null,
  zoomOff: null,
  userMoved: false,
  mapReady: false,
  skyview: false,
  roadview: false,
  roadviewHinted: false,
  entering: false,
  selectedId: null,
  detailSig: '',
  detailPhotos: null,
  editingId: null,
  draft: null,
  addressSeq: 0
};

UI.initUI({
  onLogin,
  onBrandClick,
  onLogout,
  onLocate,
  onAddClick,
  onZoomIn,
  onZoomOut,
  onToggleMapType,
  onToggleRoadview,
  onRoute,
  onFilterChange,
  onSearch,
  onSelectPlace,
  onSubmitPin,
  onDeletePin,
  onEditPin,
  onMarkVisited,
  onSheetClose,
  onPickerCancel,
  onPickerConfirm,
  onOpenTimeline,
  onTimelineSelect,
  onOpenFeed,
  onFeedSelect,
  onExport,
  onAddComment,
  onDeleteComment,
  onOpenCourses,
  onCourseNew,
  onCourseSelect,
  onCourseSearch,
  onSubmitCourse,
  onDeleteCourse,
  onCourseEdit,
  onCourseDone,
  onCourseBarClose,
  onCourseStopSelect,
  onCourseStopDetail,
  onCourseFocusClear,
  onCourseStep,
  onAddToCourse
});

if (!FB.isConfigured) {
  UI.setLoginError('js/firebase.js 의 firebaseConfig 를 먼저 채워주세요. (README 참고)');
}

let bootDone = false;
FB.watchAuth((user) => {
  if (!bootDone) { bootDone = true; UI.hideBoot(); }

  if (user) {
    UI.setMyId(FB.currentUserId());
    UI.showScreen('map');
    enterMap();
  } else {
    UI.setMyId('');
    leaveMap();
    UI.showScreen('login');
    UI.resetLoginForm();
    UI.prefillLogin(readSavedId());
    if (!FB.isConfigured) {
      UI.setLoginError('js/firebase.js 의 firebaseConfig 를 먼저 채워주세요. (README 참고)');
    }
  }
});

window.addEventListener('pagehide', () => leaveMap());

async function onLogin(id, password, saveId) {
  if (!id.trim())   { UI.setLoginError('아이디를 입력해주세요.'); return; }
  if (!password)    { UI.setLoginError('비밀번호를 입력해주세요.'); return; }
  if (!FB.isValidId(id)) {
    UI.setLoginError('아이디는 영문·숫자로 입력해주세요. (한글은 사용할 수 없어요)');
    return;
  }

  UI.setLoginLoading(true);
  try {
    await FB.login(id, password);

    saveSavedId(saveId ? id.trim() : '');

  } catch (err) {
    UI.setLoginError(FB.authErrorMessage(err));
  } finally {
    UI.setLoginLoading(false);
  }
}

const SAVED_ID_KEY = 'pinlog:savedId';

function readSavedId() {
  try {
    return localStorage.getItem(SAVED_ID_KEY) || '';
  } catch (_) {
    return '';
  }
}

function saveSavedId(id) {
  try {
    if (id) localStorage.setItem(SAVED_ID_KEY, id);
    else    localStorage.removeItem(SAVED_ID_KEY);
  } catch (_) {  }
}

// 상단 PinLog 타이틀 → 페이지 새로고침
// 시트가 열려 있으면 작성 중인 내용이 날아가므로 한 번 물어본다.
async function onBrandClick() {
  if (UI.isSheetOpen()) {
    const ok = await UI.confirmDialog({
      title: '새로고침할까요?',
      desc: '작성 중인 내용은 저장되지 않아요.',
      okText: '새로고침'
    });
    if (!ok) return;
  }

  location.reload();
}

async function onLogout() {
  const ok = await UI.confirmDialog({
    title: '로그아웃할까요?',
    desc: '다시 로그인하면 핀은 그대로 남아 있어요.',
    okText: '로그아웃'
  });
  if (!ok) return;

  leaveMap();
  try { await FB.logout(); } catch (_) { UI.toast('로그아웃에 실패했어요.'); }
}

const LAST_POS_KEY = 'pinlog:lastPos';

function readLastPos() {
  try {
    const p = JSON.parse(localStorage.getItem(LAST_POS_KEY) || 'null');
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
    return p;
  } catch (_) {
    return null;
  }
}

function saveLastPos(lat, lng, level) {
  try {
    localStorage.setItem(LAST_POS_KEY, JSON.stringify({ lat, lng, level, at: Date.now() }));
  } catch (_) {  }
}

async function enterMap() {
  if (state.mapReady || state.entering) return;
  state.entering = true;

  try {
    await MapCtl.loadKakao();

    if (!FB.currentUser()) { state.entering = false; return; }

    MapCtl.createMap(UI.el.map, readLastPos() || MapCtl.DEFAULT_CENTER, {
      onMapClick: handleMapClick,
      onPinClick: handlePinClick
    });

    state.mapReady = true;
    subscribePins();
    subscribeCourses();
    greet();
    UI.showHint();

    UI.setZoomState(MapCtl.getZoomState());
    state.zoomOff = MapCtl.onZoomChange(() => UI.setZoomState(MapCtl.getZoomState()));

    state.userMoved = false;
    state.userMoveOff = MapCtl.onUserInteract(() => { state.userMoved = true; });

    locateInitial();
  } catch (err) {
    console.error('[PinLog] 지도 초기화 실패:', err);
    UI.toast(err.message || '지도를 불러오지 못했어요.', 6000);
  } finally {
    state.entering = false;
  }
}

function greet() {
  const name = displayName(FB.currentUserId());
  if (name) UI.toast(`안녕하세요, ${name} 님 !.!`, 2600);
}

async function locateInitial() {
  UI.setLocating(true);

  const pos = await MapCtl.getCurrentPosition({ maximumAge: 5 * 60 * 1000 });

  UI.setLocating(false);

  if (!state.mapReady || !MapCtl.isReady()) return;

  if (state.userMoveOff) { state.userMoveOff(); state.userMoveOff = null; }

  if (pos.fallback) {
    UI.toast(MapCtl.geoErrorMessage(pos.reason), 5000);
    return;
  }

  const level = MapCtl.levelForAccuracy(pos.accuracy);

  if (!state.userMoved) MapCtl.moveTo(pos.lat, pos.lng, level);
  MapCtl.showMyLocation(pos.lat, pos.lng, pos.accuracy);

  saveLastPos(pos.lat, pos.lng, level);
}

function leaveMap() {

  if (state.unsubscribePins)    { state.unsubscribePins();    state.unsubscribePins = null; }
  if (state.unsubscribeCourses) { state.unsubscribeCourses(); state.unsubscribeCourses = null; }
  detachPinExtras();

  if (state.pickerIdleOff) { state.pickerIdleOff(); state.pickerIdleOff = null; }
  if (state.userMoveOff)   { state.userMoveOff();   state.userMoveOff = null; }
  if (state.zoomOff)       { state.zoomOff();       state.zoomOff = null; }

  MapCtl.destroyMap();

  state.pins = [];
  state.users = [];
  state.courses = [];
  state.courseViewId = null;
  state.courseEditingId = null;
  state.courseFocusId = null;
  state.mapReady = false;
  state.selectedId = null;
  state.skyview = false;
  UI.setMapTypeState(false);
  state.roadview = false;
  UI.setRoadviewState(false);
  UI.closeRoadview();
  state.editingId = null;
  state.draft = null;
  state.detailPhotos = null;
  state.pickerName = '';

  UI.closeSheet(true);
  UI.closePicker();
  UI.closeTimeline(true);
  UI.closeFeed(true);
  UI.closeCourses(true);
  UI.hideCourseBar();
  UI.closeLightbox();
  UI.clearSearch();
  UI.resetTagFilter();
  UI.setCounts(0, 0);
}

function subscribePins() {
  if (state.unsubscribePins) { state.unsubscribePins(); state.unsubscribePins = null; }

  state.unsubscribePins = FB.subscribePins(
    (pins) => {
      state.pins = pins;

      state.users = collectUsers(pins, FB.currentUserId());
      UI.setUsers(state.users);

      refreshMarkers();
      if (state.courseViewId) drawCourse(false);
      UI.setCoursePins(pins);
      if (UI.isCoursesOpen()) UI.renderCourses(state.courses, pins);

      if (state.selectedId) {
        const cur = findPin(state.selectedId);
        if (!cur) {
          state.selectedId = null;
          UI.closeSheet();
          UI.toast('보고 있던 핀이 삭제됐어요.');
        } else if (!UI.el.panelDetail.hidden) {

          const sig = detailSignature(cur);
          if (sig !== state.detailSig) {
            state.detailSig = sig;
            UI.openDetail(cur);
          }
        }
      }
    },
    (err) => {
      const msg = err && err.code === 'permission-denied'
        ? '데이터 접근 권한이 없어요. firestore.rules 를 확인해주세요.'
        : '실시간 동기화에 실패했어요.';
      UI.toast(msg, 3200);
    }
  );
}

function detailSignature(pin) {
  return `${pin.name}|${pin.memo}|${pin.category}|${pin.visitedAt}|${pin.tags.join(',')}`;
}

function visiblePins() {
  const f = UI.filters;
  return state.pins.filter((p) => {
    if (f[p.category] === false) return false;
    if (!passesUserFilter(f, p)) return false;
    if (f.tags.length && !p.tags.some((t) => f.tags.includes(t))) return false;
    return true;
  });
}

function passesUserFilter(f, pin) {

  const who = normalizeId(pin.createdBy);
  if (!state.users.includes(who)) return true;
  return f.users.includes(who);
}

function refreshMarkers() {
  const list = visiblePins();

  MapCtl.renderPins(withCoursePins(list));
  if (UI.isTimelineOpen()) UI.renderTimeline(list);

  const visited = state.pins.filter((p) => p.category === 'visited').length;
  const wish    = state.pins.length - visited;
  UI.setCounts(visited, wish);
}

function findPin(id) {
  return state.pins.find((p) => p.id === id) || null;
}

function attachPinExtras(pinId) {
  detachPinExtras();

  state.detailPhotos = null;
  UI.clearDetailExtras();

  state.unsubPhotos = FB.subscribePhotos(
    pinId,
    (photos) => {
      if (state.selectedId !== pinId) return;
      state.detailPhotos = photos;
      UI.setDetailPhotos(photos);
    },
    () => { if (state.selectedId === pinId) state.detailPhotos = []; }
  );

  state.unsubComments = FB.subscribeComments(
    pinId,
    (comments) => {
      if (state.selectedId !== pinId) return;
      UI.setDetailComments(comments);
    },
    () => {  }
  );
}

function detachPinExtras() {
  if (state.unsubPhotos)   { state.unsubPhotos();   state.unsubPhotos = null; }
  if (state.unsubComments) { state.unsubComments(); state.unsubComments = null; }
}

function sheetPanOffset(mobileY) {
  const w = window.innerWidth;
  if (w < 640)  return { y: mobileY };
  if (w < 1024) return { y: Math.round(mobileY * 0.55) };
  return { x: -210 };
}

function handleMapClick(coord) {
  // 물방울 핀은 검색 결과를 고르거나 '핀 추가' 를 눌렀을 때만 나온다.
  // 지도는 끌고 확대하는 표면이라, 옮기려다 탭이 되는 일이 잦기 때문이다.
  // 이미 열려 있을 때 탭한 자리로 옮겨주는 것까지는 남긴다.
  if (UI.isPickerOpen()) { MapCtl.panTo(coord.lat, coord.lng); return; }

  // 코스에서 짚어둔 장소는 지도의 빈 곳을 누르면 풀린다.
  if (state.courseFocusId) focusCourseStop(null);

  if (state.roadview) openRoadviewAt(coord.lat, coord.lng);
}

function onToggleRoadview() {
  if (!state.mapReady) return;

  state.roadview = !state.roadview;
  MapCtl.setRoadviewOverlay(state.roadview);
  UI.setRoadviewState(state.roadview);

  // 파란 선이 무엇인지는 한 번만 알려주면 된다.
  if (state.roadview && !state.roadviewHinted) {
    state.roadviewHinted = true;
    UI.toast('파란 길을 누르면 로드뷰가 열려요.', 3200);
  }
}

async function openRoadviewAt(lat, lng) {
  const panoId = await MapCtl.findPano(lat, lng, 50);

  if (!panoId) {
    UI.toast('이 근처에는 로드뷰가 없어요.');
    return;
  }

  // 띄우는 게 먼저다. 숨어 있는 칸에 만들면 크기를 0 으로 잰다.
  UI.openRoadview();
  MapCtl.showRoadview(UI.el.roadviewView, panoId, lat, lng);

  fillAddress(lat, lng, (t) => { if (UI.isRoadviewOpen()) UI.setRoadviewAddress(t); });
}

function handlePinClick(id) {
  const pin = findPin(id);
  if (!pin) return;

  state.selectedId = id;
  state.editingId = null;
  state.draft = null;
  state.detailSig = detailSignature(pin);

  MapCtl.setActivePin(id);
  UI.openDetail(pin);
  attachPinExtras(id);
  MapCtl.panToWithOffset(pin.lat, pin.lng, sheetPanOffset(150));

  // 코스를 보는 중이면 목록에서도 같은 장소를 짚어 둔다. (지도에서 핀을 직접 누른 경우)
  const course = state.courseViewId ? findCourse(state.courseViewId) : null;
  if (course && course.stops.some((s) => s.pinId === id)) focusCourseStop(id);
}

async function onLocate() {
  if (!state.mapReady) return;

  UI.setLocating(true);

  const pos = await MapCtl.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  });
  UI.setLocating(false);

  if (!MapCtl.isReady()) return;

  if (pos.fallback) { UI.toast(MapCtl.geoErrorMessage(pos.reason), 5000); return; }

  const level = MapCtl.levelForAccuracy(pos.accuracy);
  MapCtl.moveTo(pos.lat, pos.lng, level);
  MapCtl.showMyLocation(pos.lat, pos.lng, pos.accuracy);
  saveLastPos(pos.lat, pos.lng, level);

  if (pos.accuracy > 5000) {
    UI.toast(`대략적인 위치예요 (오차 약 ${Math.round(pos.accuracy / 1000)}km)`, 3000);
  }
}

function onRoute() {
  // 앱을 못 띄우는 환경(PC, SDK 로드 실패)에서는 알려만 준다.
  // 핀을 찾기 전에 본다. 환경은 어느 핀이든 똑같기 때문이다.
  if (!IS_MOBILE || !window.Kakao || !Kakao.isInitialized() || !Kakao.Navi) {
    UI.toast('카카오내비는 휴대폰에서만 실행할 수 있어요.');
    return;
  }

  const pin = findPin(state.selectedId);
  if (!pin) {
    UI.toast('핀 정보를 찾지 못했어요.');
    return;
  }

  try {
    // x 가 경도, y 가 위도다.
    Kakao.Navi.start({
      name: pin.name || pin.address || '목적지',
      x: pin.lng,
      y: pin.lat,
      coordType: 'wgs84'
    });
  } catch (err) {
    console.error('[PinLog] 카카오내비 실행 실패:', err);
    UI.toast('카카오내비를 열지 못했어요. (' + (err.message || err) + ')', 5000);
    return;
  }

  // 카카오 SDK 는 앱 실행 실패를 빈 catch 로 삼켜서 아무 신호도 주지 않는다.
  // 앱이 뜨면 브라우저가 뒤로 물러나며 document.hidden 이 true 가 되므로,
  // 잠시 뒤에도 화면이 그대로 보이면 실행에 실패한 것으로 본다.
  setTimeout(() => {
    if (document.hidden) return;
    UI.toast('카카오내비가 열리지 않았어요. 앱이 설치돼 있는지 확인해주세요.', 5000);
  }, 2500);
}

function onToggleMapType() {
  if (!state.mapReady) return;

  state.skyview = !state.skyview;
  MapCtl.setSkyview(state.skyview);
  UI.setMapTypeState(state.skyview);
}

function onZoomIn() {
  if (state.mapReady) MapCtl.zoomIn();
}

function onZoomOut() {
  if (state.mapReady) MapCtl.zoomOut();
}

function onFilterChange() {
  refreshMarkers();
}

function onOpenTimeline() {
  if (!state.mapReady) return;
  UI.closeSheet();
  UI.hideSearchPanel();
  UI.closeCourses();

  UI.openTimeline(visiblePins(), MapCtl.getCenter());
}

function onTimelineSelect(id) {
  const pin = findPin(id);
  if (!pin) return;

  MapCtl.moveTo(pin.lat, pin.lng, 3);
  handlePinClick(id);

  const hidden = !visiblePins().some((p) => p.id === id);
  if (hidden) UI.toast('필터 때문에 지도에서는 숨겨져 있어요.', 2800);
}

let feedSeq = 0;

async function onOpenFeed() {
  if (!state.mapReady) return;
  UI.closeSheet();
  UI.hideSearchPanel();
  UI.closeTimeline();
  UI.closeCourses();

  UI.openFeed();

  // 여는 동안 다시 열면 늦게 온 응답이 새 목록을 덮어쓰지 않도록 번호를 매긴다.
  const seq = ++feedSeq;

  try {
    const items = await FB.fetchAllComments(state.pins);
    if (seq !== feedSeq) return;

    UI.setFeedComments(items.map((c) => {
      const pin = findPin(c.pinId);
      return { ...c, pinName: pin ? pin.name : '' };
    }));
  } catch (err) {
    console.error('[PinLog] 댓글 모아보기 실패:', err);
    if (seq === feedSeq) UI.setFeedError();
  }
}

function onFeedSelect(id) {
  onTimelineSelect(id);
}

let exporting = false;

async function onExport() {
  if (exporting) return;

  // 취소 · ESC · 바깥 클릭이면 null 이 온다.
  const choice = await UI.exportDialog();
  if (!choice) return;

  exporting = true;
  UI.toast('내보내는 중…', 60000);

  try {
    const data = await FB.exportEverything(
      (done, total) => UI.toast(`내보내는 중… ${done}/${total}`, 60000),
      { photos: choice === 'photos' }
    );

    const size = downloadJson(data, `pinlog-${UI.todayValue()}.json`);
    UI.toast(`${data.pinCount}곳을 저장했어요. (${size})`, 3600);
  } catch (err) {
    console.error('[PinLog] 내보내기 실패:', err);
    UI.toast(err.code === 'permission-denied' ? '내보낼 권한이 없어요.' : '내보내지 못했어요.', 3000);
  } finally {
    exporting = false;
  }
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10000);

  const mb = blob.size / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.max(1, Math.round(blob.size / 1024))}KB`;
}

async function onSearch(keyword) {
  if (!state.mapReady) return;
  try {
    const list = await MapCtl.searchPlaces(keyword);
    UI.renderSearchResults(list);
  } catch (err) {
    UI.toast(err.message || '검색에 실패했어요.');
  }
}

function onSelectPlace(place) {
  UI.clearSearch();

  startPicking({
    lat: place.lat,
    lng: place.lng,
    level: 3,
    name: place.name,
    address: place.roadAddress || place.address || ''
  });
}

function startNewPin(lat, lng, prefill = {}) {
  state.selectedId = null;
  state.editingId = null;
  state.detailPhotos = null;
  state.draft = { lat, lng, address: prefill.address || '' };

  detachPinExtras();
  MapCtl.setActivePin(null);
  UI.openForm({ mode: 'create', name: prefill.name || '', address: prefill.address || '' });
  MapCtl.panToWithOffset(lat, lng, sheetPanOffset(170));

  if (!prefill.address) fillAddress(lat, lng, (text) => {
    if (state.draft) state.draft.address = text;
    UI.setFormAddress(text);
  });
}

async function fillAddress(lat, lng, apply) {
  const seq = ++state.addressSeq;
  const text = await MapCtl.coordToAddress(lat, lng);
  if (seq !== state.addressSeq) return;
  apply(text);
}

function onAddClick() {
  startPicking();
}

function startPicking(opts = {}) {
  if (!state.mapReady) return;

  // 지도 탭이 '위치 맞추기' 와 '로드뷰 열기' 두 가지 뜻을 갖지 않게 한다.
  if (state.roadview) onToggleRoadview();

  // 위치 선택 바와 코스 카드가 같은 자리를 쓴다.
  exitCourseView();

  UI.closeSheet();
  UI.hideSearchPanel();

  if (Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
    MapCtl.moveTo(opts.lat, opts.lng, opts.level);
  }

  state.pickerName = opts.name || '';

  UI.openPicker();

  if (opts.address) UI.setPickerAddress(opts.address);
  else refreshPickerAddress();

  if (state.pickerIdleOff) state.pickerIdleOff();
  state.pickerIdleOff = MapCtl.onIdle(refreshPickerAddress);
}

function refreshPickerAddress() {
  const c = MapCtl.getCrosshairCoord();
  fillAddress(c.lat, c.lng, (t) => UI.setPickerAddress(t));
}

function onPickerCancel() {
  if (state.pickerIdleOff) { state.pickerIdleOff(); state.pickerIdleOff = null; }
  state.pickerName = '';
  UI.closePicker();
}

function onPickerConfirm() {
  // 지도가 기억하는 중심이 아니라, 물방울 핀 아래에 실제로 보이는 좌표를 저장한다.
  const c = MapCtl.getCrosshairCoord();
  const address = UI.el.pickerAddress.textContent;
  const name = state.pickerName;

  onPickerCancel();
  startNewPin(c.lat, c.lng, {
    name,
    address: address === '위치를 찾는 중…' ? '' : address
  });
}

async function onSubmitPin(values) {
  if (!values.name) { UI.toast('장소 이름을 입력해주세요.'); UI.el.pinName.focus(); return; }

  const editingId  = state.editingId;
  const draft      = state.draft;
  const staged     = UI.getFormPhotos();
  const originalIds = UI.getFormOriginalPhotoIds();

  const keptIds    = staged.filter((p) => p.id).map((p) => p.id);
  const hasNew     = staged.some((p) => !p.id);
  const hasRemoved = originalIds.some((id) => !keptIds.includes(id));
  const photosChanged = hasNew || hasRemoved;

  UI.setFormLoading(true);
  try {

    const cover = photosChanged && staged.length ? await makeCover(staged[0].dataUrl) : '';

    let pinId = editingId;
    if (editingId) {
      await FB.updatePin(editingId, values);
    } else {
      if (!draft) throw new Error('위치 정보가 없어요.');
      const ref = await FB.addPin({
        ...values, lat: draft.lat, lng: draft.lng, address: draft.address
      });
      pinId = ref.id;
    }

    if (photosChanged) await FB.savePhotos(pinId, staged, originalIds, cover);

    if (editingId) {
      UI.toast('핀을 수정했어요.');
    } else {
      UI.toast(values.category === 'wish' ? '가볼 곳에 담았어요.' : '가본 곳에 기록했어요.');
    }
    UI.closeSheet();
  } catch (err) {
    console.error('[PinLog] 저장 실패:', err);
    UI.toast(err.code === 'permission-denied' ? '저장 권한이 없어요.' : '저장에 실패했어요.', 3000);
  } finally {
    UI.setFormLoading(false);
  }
}

function onEditPin() {
  const pin = findPin(state.selectedId);
  if (!pin) return;

  if (state.detailPhotos === null) {
    UI.toast('사진을 불러오는 중이에요. 잠시 후 다시 눌러주세요.');
    return;
  }

  state.editingId = pin.id;
  UI.openForm({ mode: 'edit', pin, photos: state.detailPhotos });
}

async function onMarkVisited() {
  const pin = findPin(state.selectedId);
  if (!pin || pin.category !== 'wish') return;

  const id = pin.id;
  const prevDate = pin.visitedAt;

  const ok = await UI.confirmDialog({
    title: '가본 곳으로 옮길까요?',
    desc: `'${pin.name}' 을 다녀온 곳으로 바꿔요. 다녀온 날짜는 오늘로 기록되고, 나중에 수정할 수 있어요.`,
    okText: '다녀왔어요',
    tone: 'primary'
  });
  if (!ok) return;

  // 물어보는 동안 상대가 먼저 옮겼을 수도 있다.
  const fresh = findPin(id);
  if (!fresh || fresh.category !== 'wish') return;

  try {
    await FB.setPinVisit(id, 'visited', UI.todayValue());
    UI.toast('가본 곳으로 옮겼어요.', 5000, {
      label: '되돌리기',
      onClick: async () => {
        try {
          await FB.setPinVisit(id, 'wish', prevDate);
          UI.toast('되돌렸어요.');
        } catch (_) {
          UI.toast('되돌리지 못했어요.');
        }
      }
    });
  } catch (err) {
    console.error('[PinLog] 다녀왔어요 실패:', err);
    UI.toast(err.code === 'permission-denied' ? '바꿀 권한이 없어요.' : '바꾸지 못했어요.');
  }
}

async function onDeletePin() {
  const id = state.editingId || state.selectedId;
  const pin = findPin(id);
  if (!pin) return;

  const extras = [];
  if (pin.photoCount)   extras.push(`사진 ${pin.photoCount}장`);
  if (pin.commentCount) extras.push(`댓글 ${pin.commentCount}개`);

  const inCourses = coursesWithPin(id).length;
  const gone = inCourses ? `사라지고, 담겨 있던 코스 ${inCourses}개에서도 빠져요` : '사라져요';

  const ok = await UI.confirmDialog({
    title: '핀을 삭제할까요?',
    desc: `'${pin.name}' 기록${extras.length ? `과 ${extras.join(', ')}` : ''}이 지도에서 ${gone}. 되돌릴 수 없어요.`,
    okText: '삭제'
  });
  if (!ok) return;

  try {

    await FB.deletePin(id);
    UI.closeSheet();
    UI.toast('핀을 삭제했어요.');
  } catch (err) {
    console.error('[PinLog] 삭제 실패:', err);
    UI.toast(err.code === 'permission-denied' ? '삭제 권한이 없어요.' : '삭제에 실패했어요.', 3000);
  }
}

async function onAddComment(text) {
  const pinId = state.selectedId;
  if (!pinId) return;

  try {
    await FB.addComment(pinId, text);
  } catch (err) {
    console.error('[PinLog] 댓글 실패:', err);
    UI.toast(err.code === 'permission-denied' ? '댓글을 남길 권한이 없어요.' : '댓글을 남기지 못했어요.');
  }
}

async function onDeleteComment(commentId, text) {
  const pinId = state.selectedId;
  if (!pinId) return;

  const quote = String(text || '').trim();
  const short = quote.length > 24 ? quote.slice(0, 24) + '…' : quote;

  const ok = await UI.confirmDialog({
    title: '댓글을 삭제할까요?',
    desc: short
      ? `'${short}' 댓글이 사라져요. 되돌릴 수 없어요.`
      : '삭제한 댓글은 되돌릴 수 없어요.',
    okText: '삭제'
  });
  if (!ok) return;

  // 물어보는 동안 다른 핀으로 옮겨갔을 수 있다.
  if (state.selectedId !== pinId) return;

  try {
    await FB.deleteComment(pinId, commentId);
  } catch (err) {
    console.error('[PinLog] 댓글 삭제 실패:', err);
    UI.toast('댓글을 지우지 못했어요.');
  }
}

function onSheetClose() {
  state.selectedId = null;
  state.editingId = null;
  state.courseEditingId = null;
  state.draft = null;
  state.detailSig = '';
  state.detailPhotos = null;
  detachPinExtras();
  MapCtl.setActivePin(null);
}

/* ── 데이트 코스 ───────────────────────────────────────────── */

function subscribeCourses() {
  if (state.unsubscribeCourses) { state.unsubscribeCourses(); state.unsubscribeCourses = null; }

  state.unsubscribeCourses = FB.subscribeCourses(
    (courses) => {
      state.courses = courses;

      if (UI.isCoursesOpen()) UI.renderCourses(courses, state.pins);

      if (state.courseViewId) {
        if (!findCourse(state.courseViewId)) {
          exitCourseView();
          UI.toast('보고 있던 코스가 삭제됐어요.');
        } else {
          refreshMarkers();
          drawCourse(false);
        }
      }
    },
    (err) => {
      // 규칙을 다시 게시하지 않았으면 여기로 온다. 핀은 그대로 쓸 수 있으니 알리기만 한다.
      if (err && err.code === 'permission-denied') {
        UI.toast('코스를 불러올 권한이 없어요. firestore.rules 를 다시 게시해주세요.', 4200);
      }
    }
  );
}

function findCourse(id) {
  return state.courses.find((c) => c.id === id) || null;
}

// 코스에 적힌 순서대로 실제 핀을 붙인다. 그사이 지워진 핀은 건너뛴다.
function resolveStops(course) {
  if (!course) return [];
  return course.stops
    .map((s) => ({ pin: findPin(s.pinId), time: s.time, memo: s.memo }))
    .filter((s) => s.pin);
}

function coursesWithPin(pinId) {
  return state.courses.filter((c) => c.stops.some((s) => s.pinId === pinId));
}

// 코스를 보는 동안에는 필터에 걸려 숨은 핀이라도 코스에 든 것은 지도에 올린다.
function withCoursePins(list) {
  const course = state.courseViewId ? findCourse(state.courseViewId) : null;
  if (!course) return list;

  const shown = new Set(list.map((p) => p.id));
  const extra = resolveStops(course).map((s) => s.pin).filter((p) => !shown.has(p.id));
  return extra.length ? list.concat(extra) : list;
}

function onOpenCourses() {
  if (!state.mapReady) return;
  UI.closeSheet();
  UI.hideSearchPanel();
  UI.closeTimeline();
  UI.closeFeed();

  UI.openCourses(state.courses, state.pins);
}

function openCourseView(id) {
  if (!findCourse(id)) return;

  if (UI.isPickerOpen()) onPickerCancel();
  UI.closeSheet();
  UI.hideSearchPanel();

  state.courseViewId = id;
  state.courseFocusId = null;
  MapCtl.setCourseFocus(null);
  UI.setCourseFocus(null);
  refreshMarkers();
  drawCourse(true);
}

function drawCourse(fit) {
  const course = findCourse(state.courseViewId);
  if (!course) return;

  const stops = resolveStops(course);

  MapCtl.showCourse(
    stops.map((s) => ({ id: s.pin.id, lat: s.pin.lat, lng: s.pin.lng })),
    { done: course.status === 'done' }
  );
  UI.showCourseBar(course, stops);
  keepCourseFocus(stops);

  if (fit && stops.length) {
    MapCtl.fitPoints(stops.map((s) => s.pin), {
      top: topBarBottom() + 30,
      right: 80,
      bottom: UI.courseBarInset(),
      left: 40
    });
  }
}

function topBarBottom() {
  const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top-bar-bottom'), 10);
  return Number.isFinite(v) ? v : 120;
}

function exitCourseView() {
  if (!state.courseViewId) return;
  state.courseViewId = null;
  state.courseFocusId = null;

  MapCtl.clearCourse();
  UI.hideCourseBar();
  refreshMarkers();
}

function onCourseSelect(id) {
  openCourseView(id);
}

function onCourseBarClose() {
  exitCourseView();
}

// 카드 · 표에서 장소를 처음 누르면 지도에서 그 핀만 강조하고 그쪽으로 옮긴다.
// 상세는 짚은 곳을 한 번 더 누르거나 '상세 ›' 로 연다. (onCourseStopDetail)
function onCourseStopSelect(pinId) {
  focusCourseStop(pinId, { pan: true });
}

function onCourseStopDetail(pinId) {
  handlePinClick(pinId);
}

function onCourseFocusClear() {
  focusCourseStop(null);
}

// ← → 로 이전 · 다음 장소. 짚은 곳이 없으면 → 는 처음, ← 는 마지막부터.
function onCourseStep(dir) {
  const stops = resolveStops(findCourse(state.courseViewId));
  if (!stops.length) return;

  const cur = stops.findIndex((s) => s.pin.id === state.courseFocusId);
  const next = cur < 0
    ? (dir > 0 ? 0 : stops.length - 1)
    : Math.min(stops.length - 1, Math.max(0, cur + dir));

  if (next === cur) return;
  focusCourseStop(stops[next].pin.id, { pan: true });
}

function focusCourseStop(pinId, opts = {}) {
  const pin = pinId ? findPin(pinId) : null;
  state.courseFocusId = pin ? pin.id : null;

  MapCtl.setCourseFocus(state.courseFocusId);
  UI.setCourseFocus(state.courseFocusId, { reveal: !!pin });

  if (pin && opts.pan) {
    MapCtl.panToFocus(pin.lat, pin.lng, UI.courseFocusY(topBarBottom()));
  }
}

// 코스를 다시 그렸을 때 짚었던 장소가 빠졌으면 조용히 푼다.
function keepCourseFocus(stops) {
  if (!state.courseFocusId) return;
  if (!stops.some((s) => s.pin.id === state.courseFocusId)) focusCourseStop(null);
}

function onCourseNew() {
  UI.closeCourses();
  openCourseEditor(null, []);
}

function onCourseEdit() {
  const course = findCourse(state.courseViewId);
  if (course) openCourseEditor(course);
}

// 상세 시트에서 곧장 편집으로 넘어올 수 있다. 시트를 닫았다 열면 한 번 튀므로
// 닫힐 때 하는 정리(선택 해제 · 사진/댓글 구독 해제)만 먼저 해두고 패널만 바꾼다.
function openCourseEditor(course, prefill = []) {
  if (!state.mapReady) return;
  if (UI.isPickerOpen()) onPickerCancel();

  onSheetClose();
  state.courseEditingId = course ? course.id : null;

  UI.openCourseEditor({ course, pins: state.pins, prefill, maxStops: FB.MAX_STOPS });
}

async function onCourseSearch(keyword) {
  try {
    const list = await MapCtl.searchPlaces(keyword);
    UI.setCoursePlaces(list, keyword);
  } catch (err) {
    UI.setCoursePlaces([], keyword);
    UI.toast(err.message || '검색에 실패했어요.');
  }
}

// 이름을 비워두면 날짜로 지어준다.
function autoCourseName(date) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date || '');
  return m ? `${Number(m[1])}월 ${Number(m[2])}일 데이트` : '데이트 코스';
}

async function onSubmitCourse(values) {
  if (!values.stops.length) {
    UI.toast('장소를 하나 이상 담아주세요.');
    UI.el.courseSearch.focus();
    return;
  }

  const editingId = state.courseEditingId;
  const name = values.name || autoCourseName(values.date);

  UI.setCourseLoading(true);
  try {
    if (editingId && !findCourse(editingId)) throw Object.assign(new Error('gone'), { code: 'gone' });

    // 검색으로 고른 새 장소는 여기서 '가볼 곳' 핀이 된다.
    const stops = [];
    let created = 0;
    for (const s of values.stops) {
      if (s.pinId) {
        if (findPin(s.pinId)) stops.push({ pinId: s.pinId, time: s.time, memo: s.memo });
        continue;
      }

      const ref = await FB.addPin({
        name: s.place.name,
        memo: '',
        category: 'wish',
        tags: [],
        visitedAt: '',
        lat: s.place.lat,
        lng: s.place.lng,
        address: s.place.address
      });
      created++;
      stops.push({ pinId: ref.id, time: s.time, memo: s.memo });
    }

    if (!stops.length) {
      UI.toast('담았던 장소가 모두 삭제됐어요. 다시 골라주세요.', 3200);
      return;
    }

    let courseId = editingId;
    if (editingId) {
      await FB.updateCourse(editingId, { name, date: values.date, stops });
    } else {
      const ref = await FB.addCourse({ name, date: values.date, stops });
      courseId = ref.id;
    }

    UI.closeSheet();

    const extra = created ? ` 가볼 곳 ${created}곳도 추가했어요.` : '';
    UI.toast((editingId ? '코스를 수정했어요.' : `'${name}' 코스를 만들었어요.`) + extra, 3000);

    // 새로 만든 코스는 바로 지도에 펼쳐 보여준다.
    if (!editingId) openCourseView(courseId);
  } catch (err) {
    console.error('[PinLog] 코스 저장 실패:', err);
    UI.toast(
      err.code === 'gone'              ? '그사이 코스가 삭제됐어요.' :
      err.code === 'permission-denied' ? '저장 권한이 없어요. firestore.rules 를 확인해주세요.' :
                                         '코스를 저장하지 못했어요.',
      3000
    );
  } finally {
    UI.setCourseLoading(false);
  }
}

async function onDeleteCourse() {
  const course = findCourse(state.courseEditingId);
  if (!course) return;

  const ok = await UI.confirmDialog({
    title: '코스를 삭제할까요?',
    desc: `'${course.name}' 코스가 사라져요. 담겨 있던 장소 핀은 지도에 그대로 남아요.`,
    okText: '삭제'
  });
  if (!ok) return;

  try {
    await FB.deleteCourse(course.id);
    UI.closeSheet();
    if (state.courseViewId === course.id) exitCourseView();
    UI.toast('코스를 삭제했어요.');
  } catch (err) {
    console.error('[PinLog] 코스 삭제 실패:', err);
    UI.toast(err.code === 'permission-denied' ? '삭제 권한이 없어요.' : '코스를 삭제하지 못했어요.', 3000);
  }
}

function fmtMonthDay(value) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : value;
}

async function onCourseDone() {
  const course = findCourse(state.courseViewId);
  if (!course || course.status === 'done') return;

  const id = course.id;
  const date = course.date || UI.todayValue();
  const wish = resolveStops(course).filter((s) => s.pin.category === 'wish');

  const ok = await UI.confirmDialog({
    title: '다녀온 코스로 바꿀까요?',
    desc: wish.length
      ? `'${course.name}' 의 가볼 곳 ${wish.length}곳도 가본 곳으로 옮기고, 다녀온 날은 ${fmtMonthDay(date)}로 기록해요.`
      : `'${course.name}' 을 다녀온 코스로 표시해요.`,
    okText: '다녀왔어요',
    tone: 'primary'
  });
  if (!ok) return;

  // 물어보는 동안 상대가 먼저 바꿨을 수 있어서 최신 상태로 다시 고른다.
  const fresh = findCourse(id);
  if (!fresh || fresh.status === 'done') return;

  const targets = resolveStops(fresh).filter((s) => s.pin.category === 'wish').map((s) => s.pin);
  const forward = targets.map((p) => ({ id: p.id, category: 'visited', visitedAt: date }));
  const back    = targets.map((p) => ({ id: p.id, category: 'wish',    visitedAt: p.visitedAt }));

  // 날짜 없이 다녀온 코스면 오늘을 채우고, 되돌릴 때 다시 비운다.
  const fillDate = fresh.date ? undefined : date;
  const clearDate = fresh.date ? undefined : '';

  try {
    await FB.setCourseStatus(id, 'done', forward, fillDate);
    UI.toast(targets.length ? `다녀온 코스로 옮겼어요. 가본 곳 ${targets.length}곳이 늘었어요.` : '다녀온 코스로 옮겼어요.', 5000, {
      label: '되돌리기',
      onClick: async () => {
        try {
          // 그사이 지워진 핀은 되돌릴 수 없으니 빼고 보낸다. (없는 문서를 고치면 batch 전체가 실패한다)
          await FB.setCourseStatus(id, 'planned', back.filter((p) => findPin(p.id)), clearDate);
          UI.toast('되돌렸어요.');
        } catch (_) {
          UI.toast('되돌리지 못했어요.');
        }
      }
    });
  } catch (err) {
    console.error('[PinLog] 코스 다녀왔어요 실패:', err);
    UI.toast(err.code === 'permission-denied' ? '바꿀 권한이 없어요.' : '바꾸지 못했어요.', 3000);
  }
}

async function onAddToCourse() {
  const pin = findPin(state.selectedId);
  if (!pin) return;

  const choice = await UI.pickCourse({ pin, courses: state.courses, maxStops: FB.MAX_STOPS });
  if (!choice) return;

  if (choice === 'new') {
    openCourseEditor(null, [pin]);
    return;
  }

  const course = findCourse(choice);
  if (!course) { UI.toast('그사이 코스가 삭제됐어요.'); return; }
  if (course.stops.some((s) => s.pinId === pin.id)) { UI.toast('이미 담겨 있는 장소예요.'); return; }
  if (course.stops.length >= FB.MAX_STOPS) {
    UI.toast(`코스에는 최대 ${FB.MAX_STOPS}곳까지 담을 수 있어요.`);
    return;
  }

  try {
    await FB.appendCourseStop(course.id, pin.id);
    UI.toast(`'${course.name}' 에 담았어요.`, 4000, {
      label: '코스 보기',
      onClick: () => openCourseView(course.id)
    });
  } catch (err) {
    console.error('[PinLog] 코스에 담기 실패:', err);
    UI.toast(err.code === 'permission-denied' ? '담을 권한이 없어요.' : '코스에 담지 못했어요.', 3000);
  }
}
