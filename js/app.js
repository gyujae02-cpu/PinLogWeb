import * as FB from './firebase.js';
import * as MapCtl from './map.js';
import * as UI from './ui.js';
import { makeCover } from './photo.js';
import { collectUsers, normalizeId, displayName } from './users.js';

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
  unsubscribePins: null,
  unsubPhotos: null,
  unsubComments: null,
  pickerIdleOff: null,
  pickerName: '',
  userMoveOff: null,
  zoomOff: null,
  userMoved: false,
  mapReady: false,
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
  onExport,
  onAddComment,
  onDeleteComment
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

  if (state.unsubscribePins) { state.unsubscribePins(); state.unsubscribePins = null; }
  detachPinExtras();

  if (state.pickerIdleOff) { state.pickerIdleOff(); state.pickerIdleOff = null; }
  if (state.userMoveOff)   { state.userMoveOff();   state.userMoveOff = null; }
  if (state.zoomOff)       { state.zoomOff();       state.zoomOff = null; }

  MapCtl.destroyMap();

  state.pins = [];
  state.users = [];
  state.mapReady = false;
  state.selectedId = null;
  state.editingId = null;
  state.draft = null;
  state.detailPhotos = null;
  state.pickerName = '';

  UI.closeSheet(true);
  UI.closePicker();
  UI.closeTimeline(true);
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

      if (UI.isTimelineOpen()) UI.renderTimeline(state.pins);

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
  MapCtl.renderPins(visiblePins());

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

  if (UI.isPickerOpen()) {
    MapCtl.panTo(coord.lat, coord.lng);
    return;
  }

  startPicking({ lat: coord.lat, lng: coord.lng });
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

  UI.openTimeline(state.pins, MapCtl.getCenter());
}

function onTimelineSelect(id) {
  const pin = findPin(id);
  if (!pin) return;

  MapCtl.moveTo(pin.lat, pin.lng, 3);
  handlePinClick(id);

  const hidden = !visiblePins().some((p) => p.id === id);
  if (hidden) UI.toast('필터 때문에 지도에서는 숨겨져 있어요.', 2800);
}

let exporting = false;

async function onExport() {
  if (exporting) return;

  const withPhotos = await UI.confirmDialog({
    title: '기록을 내보낼까요?',
    desc: '사진까지 넣으면 파일이 크고 시간이 걸려요. 목록만 받으면 금방 끝나요.',
    okText: '사진까지',
    cancelText: '목록만'
  });

  exporting = true;
  UI.toast('내보내는 중…', 60000);

  try {
    const data = await FB.exportEverything(
      (done, total) => UI.toast(`내보내는 중… ${done}/${total}`, 60000),
      { photos: withPhotos }
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
  const c = MapCtl.getCenter();
  fillAddress(c.lat, c.lng, (t) => UI.setPickerAddress(t));
}

function onPickerCancel() {
  if (state.pickerIdleOff) { state.pickerIdleOff(); state.pickerIdleOff = null; }
  state.pickerName = '';
  UI.closePicker();
}

function onPickerConfirm() {
  const c = MapCtl.getCenter();
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

  const ok = await UI.confirmDialog({
    title: '핀을 삭제할까요?',
    desc: `'${pin.name}' 기록${extras.length ? `과 ${extras.join(', ')}` : ''}이 지도에서 사라져요. 되돌릴 수 없어요.`,
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

async function onDeleteComment(commentId) {
  const pinId = state.selectedId;
  if (!pinId) return;

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
  state.draft = null;
  state.detailSig = '';
  state.detailPhotos = null;
  detachPinExtras();
  MapCtl.setActivePin(null);
}
