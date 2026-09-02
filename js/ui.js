import { compressPhoto, MAX_PHOTOS } from './photo.js';
import { TAGS, MAX_TAGS, tagById, normalizeTags } from './tags.js';
import { userColor, displayName, normalizeId } from './users.js';
import { distanceMeters, formatDistance } from './geo.js';

const $ = (sel) => document.querySelector(sel);

export const el = {
  boot:          $('#boot'),

  screenLogin:   $('#screen-login'),
  screenMap:     $('#screen-map'),

  loginCard:     $('#login-card'),
  loginForm:     $('#login-form'),
  loginId:       $('#login-id'),
  loginPassword: $('#login-password'),
  loginSubmit:   $('#login-submit'),
  loginError:    $('#login-error'),
  saveId:        $('#save-id'),

  map:           $('#map'),

  searchInput:   $('#search-input'),
  searchClear:   $('#search-clear'),
  searchPanel:   $('#search-panel'),
  searchResults: $('#search-results'),
  searchCount:   $('#search-count'),
  searchEmpty:   $('#search-empty'),

  filterRow:     $('#filter-row'),
  filterReset:   $('#filter-reset'),
  countVisited:  $('#count-visited'),
  countWish:     $('#count-wish'),

  mePill:        $('#me-pill'),
  mePillDot:     $('#me-pill-dot'),
  mePillName:    $('#me-pill-name'),

  brand:         $('#brand'),
  btnLogout:     $('#btn-logout'),
  btnTimeline:   $('#btn-timeline'),
  btnLocate:     $('#btn-locate'),
  btnAdd:        $('#btn-add'),
  btnZoomIn:     $('#btn-zoom-in'),
  btnZoomOut:    $('#btn-zoom-out'),
  hintPill:      $('#hint-pill'),
  locatingPill:  $('#locating-pill'),

  picker:        $('#picker'),
  pickerAddress: $('#picker-address'),
  pickerCancel:  $('#picker-cancel'),
  pickerConfirm: $('#picker-confirm'),

  timeline:      $('#timeline'),
  timelineSub:   $('#timeline-sub'),
  timelineSearch:      $('#timeline-search'),
  timelineSearchClear: $('#timeline-search-clear'),
  timelineSort:        $('#timeline-sort'),
  timelineList:  $('#timeline-list'),
  timelineEmpty: $('#timeline-empty'),

  backdrop:      $('#sheet-backdrop'),
  sheet:         $('#sheet'),
  panelForm:     $('#panel-form'),
  panelDetail:   $('#panel-detail'),

  formTitle:     $('#form-title'),
  formAddress:   $('#form-address-text'),
  pinForm:       $('#pin-form'),
  pinName:       $('#pin-name'),
  pinMemo:       $('#pin-memo'),
  pinDate:       $('#pin-date'),
  dateLabel:     $('#date-label'),
  dateToday:     $('#date-today'),
  dateClear:     $('#date-clear'),
  tagPicker:     $('#tag-picker'),
  photoStrip:    $('#photo-strip'),
  photoAdd:      $('#photo-add'),
  photoInput:    $('#photo-input'),
  photoCountLbl: $('#photo-count-label'),
  formSubmit:    $('#form-submit'),
  formDelete:    $('#form-delete'),

  detailBadge:   $('#detail-badge'),
  detailName:    $('#detail-name'),
  detailAddress: $('#detail-address'),
  detailWhen:    $('#detail-when'),
  detailWhenText:$('#detail-when-text'),
  detailTags:    $('#detail-tags'),
  detailGallery: $('#detail-gallery'),
  detailPhotos:  $('#detail-photos'),
  galleryPrev:   $('#gallery-prev'),
  galleryNext:   $('#gallery-next'),
  detailMemoWrap:$('#detail-memo-wrap'),
  detailMemo:    $('#detail-memo'),
  detailMemoCopy:$('#detail-memo-copy'),
  memoCopyIcon:  $('#memo-copy-icon'),
  memoCopyDone:  $('#memo-copy-done'),
  detailMeta:    $('#detail-meta'),
  detailEdit:    $('#detail-edit'),
  detailDelete:  $('#detail-delete'),
  detailVisit:   $('#detail-visit'),

  commentList:   $('#comment-list'),
  commentEmpty:  $('#comment-empty'),
  commentCount:  $('#comment-count'),
  commentForm:   $('#comment-form'),
  commentInput:  $('#comment-input'),
  commentSubmit: $('#comment-submit'),

  lightbox:      $('#lightbox'),
  lightboxImg:   $('#lightbox-img'),
  lightboxClose: $('#lightbox-close'),
  lightboxPrev:  $('#lightbox-prev'),
  lightboxNext:  $('#lightbox-next'),
  lightboxCount: $('#lightbox-count'),

  btnAbout:      $('#btn-about'),
  about:         $('#about'),
  aboutClose:    $('#about-close'),

  confirm:       $('#confirm'),
  confirmTitle:  $('#confirm-title'),
  confirmDesc:   $('#confirm-desc'),
  confirmOk:     $('#confirm-ok'),
  confirmCancel: $('#confirm-cancel'),

  toast:         $('#toast'),
  toastText:     $('#toast-text'),
  toastAction:   $('#toast-action')
};

export const filters = { visited: true, wish: true, tags: [], users: [] };

let sheetMode = null;
let formCategory = 'visited';
let formTags = [];
let formPhotos = [];
let formOriginalIds = [];
let formSession = 0;
let photoKeySeq = 0;
let photoBusy = false;

let cb = {};
let toastTimer = null;
let copyTimer = null;
let toastActionFn = null;
let hintTimer = null;
let locatingTimer = null;

let timelineMode = 'all';
let timelinePins = [];
let timelineOpen = false;
let timelineQuery = '';
let timelineSort = 'recent';
let timelineOrigin = null;

let lightboxPhotos = [];
let lightboxIndex = 0;

let myId = '';
let userIds = [];
let tagFilterOpen = false;

const TAG_FILTER_VISIBLE = 3;

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function initUI(handlers) {
  cb = handlers || {};

  el.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setLoginError('');
    cb.onLogin && cb.onLogin(el.loginId.value, el.loginPassword.value, el.saveId.checked);
  });

  initCardTilt();

  el.detailMemoCopy.addEventListener('click', copyMemo);

  el.btnAbout.addEventListener('click', openAbout);
  el.aboutClose.addEventListener('click', () => closeAbout());
  el.about.addEventListener('click', (e) => { if (e.target === el.about) closeAbout(); });

  el.brand.addEventListener('click', () => cb.onBrandClick && cb.onBrandClick());
  el.btnLogout.addEventListener('click', () => cb.onLogout && cb.onLogout());
  el.btnLocate.addEventListener('click', () => cb.onLocate && cb.onLocate());
  el.btnAdd.addEventListener('click', () => cb.onAddClick && cb.onAddClick());
  el.btnTimeline.addEventListener('click', () => cb.onOpenTimeline && cb.onOpenTimeline());
  el.btnZoomIn.addEventListener('click', () => cb.onZoomIn && cb.onZoomIn());
  el.btnZoomOut.addEventListener('click', () => cb.onZoomOut && cb.onZoomOut());

  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.filter;
      filters[key] = !filters[key];
      chip.classList.toggle('is-on', filters[key]);
      updateFilterReset();
      cb.onFilterChange && cb.onFilterChange(filters);
    });
  });

  buildTagFilter();

  el.filterReset.addEventListener('click', resetFilters);
  updateFilterReset();

  let searchTimer = null;
  el.searchInput.addEventListener('input', () => {
    const kw = el.searchInput.value;
    el.searchClear.hidden = kw.length === 0;

    clearTimeout(searchTimer);
    if (!kw.trim()) { hideSearchPanel(); return; }

    searchTimer = setTimeout(() => cb.onSearch && cb.onSearch(kw), 280);
  });

  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchTimer);
      if (el.searchInput.value.trim()) cb.onSearch && cb.onSearch(el.searchInput.value);
    }
    if (e.key === 'Escape') clearSearch();
  });

  el.searchClear.addEventListener('click', () => {
    clearSearch();
    el.searchInput.focus();
  });

  document.addEventListener('pointerdown', (e) => {
    if (el.searchPanel.hidden) return;
    if (!e.target.closest('.search-wrap')) hideSearchPanel();
  });

  el.backdrop.addEventListener('click', () => closeSheet());
  document.querySelectorAll('[data-close-sheet]').forEach((btn) => {
    btn.addEventListener('click', () => closeSheet());
  });

  el.pinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (photoBusy) { toast('사진을 준비하는 중이에요. 잠시만요.'); return; }
    cb.onSubmitPin && cb.onSubmitPin(getFormValues());
  });

  document.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => setFormCategory(btn.dataset.category));
  });

  el.formDelete.addEventListener('click', () => cb.onDeletePin && cb.onDeletePin());
  el.detailDelete.addEventListener('click', () => cb.onDeletePin && cb.onDeletePin());
  el.detailEdit.addEventListener('click', () => cb.onEditPin && cb.onEditPin());
  el.detailVisit.addEventListener('click', () => cb.onMarkVisited && cb.onMarkVisited());

  el.toastAction.addEventListener('click', () => {
    const fn = toastActionFn;
    hideToast();
    if (fn) fn();
  });

  el.dateToday.addEventListener('click', () => { el.pinDate.value = todayValue(); });
  el.dateClear.addEventListener('click', () => { el.pinDate.value = ''; });

  buildTagPicker();

  el.photoAdd.addEventListener('click', () => el.photoInput.click());
  el.photoInput.addEventListener('change', () => {

    const files = Array.from(el.photoInput.files || []);

    el.photoInput.value = '';

    if (files.length) pickPhotos(files);
  });

  el.galleryPrev.addEventListener('click', () => stepGallery(-1));
  el.galleryNext.addEventListener('click', () => stepGallery(1));

  el.detailPhotos.addEventListener('scroll', updateGalleryNav, { passive: true });

  window.addEventListener('resize', updateGalleryNav);

  el.commentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.commentInput.value.trim();
    if (!text) return;
    el.commentInput.value = '';
    cb.onAddComment && cb.onAddComment(text);
  });

  el.pickerCancel.addEventListener('click', () => cb.onPickerCancel && cb.onPickerCancel());
  el.pickerConfirm.addEventListener('click', () => cb.onPickerConfirm && cb.onPickerConfirm());

  document.querySelectorAll('[data-close-timeline]').forEach((n) => {
    n.addEventListener('click', () => closeTimeline());
  });
  $('#btn-export').addEventListener('click', () => cb.onExport && cb.onExport());
  document.querySelectorAll('[data-tl]').forEach((btn) => {
    btn.addEventListener('click', () => {
      timelineMode = btn.dataset.tl;
      document.querySelectorAll('[data-tl]').forEach((b) => {
        b.classList.toggle('is-on', b === btn);
      });
      renderTimeline(timelinePins);
    });
  });

  el.timelineSearch.addEventListener('input', () => {
    timelineQuery = el.timelineSearch.value.trim().toLowerCase();
    el.timelineSearchClear.hidden = el.timelineSearch.value.length === 0;
    renderTimeline(timelinePins);
  });
  el.timelineSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); clearTimelineSearch(); }
  });
  el.timelineSearchClear.addEventListener('click', () => {
    clearTimelineSearch();
    el.timelineSearch.focus();
  });

  el.timelineSort.addEventListener('change', () => {
    timelineSort = el.timelineSort.value;
    renderTimeline(timelinePins);
  });

  el.lightboxClose.addEventListener('click', () => closeLightbox());
  el.lightboxPrev.addEventListener('click', () => stepLightbox(-1));
  el.lightboxNext.addEventListener('click', () => stepLightbox(1));
  el.lightbox.addEventListener('click', (e) => {
    if (e.target === el.lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!el.lightbox.hidden) {
      if (e.key === 'Escape')     { closeLightbox(); return; }
      if (e.key === 'ArrowLeft')  { stepLightbox(-1); return; }
      if (e.key === 'ArrowRight') { stepLightbox(1);  return; }
      return;
    }
    if (e.key !== 'Escape') return;
    if (!el.about.hidden)   { closeAbout(); return; }
    if (!el.confirm.hidden) { el.confirmCancel.click(); return; }
    if (sheetMode)          { closeSheet(); return; }
    if (timelineOpen)       { closeTimeline(); return; }
    if (!el.picker.hidden)  cb.onPickerCancel && cb.onPickerCancel();
  });
}

function openAbout() {
  el.about.hidden = false;
  requestAnimationFrame(() => el.about.classList.add('is-on'));
}

function closeAbout(immediate = false) {
  if (el.about.hidden) return;
  el.about.classList.remove('is-on');

  if (immediate) { el.about.hidden = true; return; }

  // 닫는 중에 다시 열리면 그대로 둔다.
  setTimeout(() => {
    if (!el.about.classList.contains('is-on')) el.about.hidden = true;
  }, 280);
}

export function setMyId(id) {

  myId = normalizeId(id);
  paintMePill();
}

function initCardTilt() {
  const card = el.loginCard;
  const sheen = card.querySelector('.login-card__sheen');
  if (!window.matchMedia('(hover: hover)').matches) return;

  const stage = card.parentElement;

  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `rotateY(${px * 9}deg) rotateX(${-py * 9}deg) translateZ(0)`;
    if (sheen) sheen.style.transform = `translateX(${px * 60}%)`;
  });

  stage.addEventListener('pointerleave', () => {
    card.style.transform = '';
    if (sheen) sheen.style.transform = 'translateX(-40%)';
  });
}

export function showScreen(name) {
  const next = name === 'map' ? el.screenMap : el.screenLogin;
  const prev = name === 'map' ? el.screenLogin : el.screenMap;

  prev.classList.remove('is-active');
  next.classList.add('is-active');

  if (name === 'login') {

    closeSheet(true);
    closePicker();
    closeTimeline(true);
    closeLightbox();
    closeAbout(true);
    clearSearch();
    setLocating(false);
    hideHint();
  }
}

export function hideBoot() {
  el.boot.classList.add('is-off');
  setTimeout(() => { el.boot.hidden = true; }, 450);
}

export function setLoginError(msg) {
  if (!msg) { el.loginError.hidden = true; el.loginError.textContent = ''; return; }
  el.loginError.textContent = msg;
  el.loginError.hidden = false;
}

export function setLoginLoading(on) {
  el.loginSubmit.disabled = on;
  el.loginSubmit.classList.toggle('is-loading', on);
  el.loginSubmit.querySelector('.spinner').hidden = !on;
}

export function resetLoginForm() {
  el.loginPassword.value = '';
  setLoginError('');
  setLoginLoading(false);
}

export function prefillLogin(id) {
  const saved = String(id || '');

  el.loginId.value = saved;
  el.saveId.checked = !!saved;

  if (saved && window.matchMedia('(hover: hover)').matches) {
    setTimeout(() => el.loginPassword.focus(), 60);
  }
}

export function setCounts(visited, wish) {
  el.countVisited.textContent = visited;
  el.countWish.textContent = wish;
}

function buildTagFilter() {
  const frag = document.createDocumentFragment();

  TAGS.forEach((tag) => {
    const chip = h('button', 'chip chip--tag');
    chip.type = 'button';
    chip.dataset.tagFilter = tag.id;
    chip.append(h('span', 'chip__emoji', tag.emoji), document.createTextNode(tag.label));

    chip.addEventListener('click', () => {
      const on = filters.tags.includes(tag.id);
      filters.tags = on
        ? filters.tags.filter((t) => t !== tag.id)
        : filters.tags.concat(tag.id);
      chip.classList.toggle('is-on', !on);
      updateTagFilterVisibility();
      updateFilterReset();
      cb.onFilterChange && cb.onFilterChange(filters);
    });

    frag.appendChild(chip);
  });

  el.tagMore = h('button', 'chip chip--more');
  el.tagMore.type = 'button';
  el.tagMore.addEventListener('click', () => {
    tagFilterOpen = !tagFilterOpen;
    updateTagFilterVisibility();
  });
  frag.appendChild(el.tagMore);

  el.filterRow.appendChild(frag);
  updateTagFilterVisibility();
}

// 기본값에서 하나라도 벗어나 있으면 '필터 걸린 상태'로 본다.
function isFiltered() {
  return !filters.visited
      || !filters.wish
      || filters.tags.length > 0
      || filters.users.length !== userIds.length;
}

// 초기화 버튼은 실제로 걸러지고 있을 때만 보인다.
// 핀이 안 보이는 이유가 필터라는 걸 눈에 띄게 하려는 목적이다.
function updateFilterReset() {
  el.filterReset.hidden = !isFiltered();
}

function resetFilters() {
  filters.visited = true;
  filters.wish = true;
  filters.tags = [];
  filters.users = userIds.slice();

  document.querySelectorAll('[data-filter]').forEach((c) => c.classList.add('is-on'));
  el.filterRow.querySelectorAll('[data-tag-filter]').forEach((c) => c.classList.remove('is-on'));
  el.filterRow.querySelectorAll('[data-user-filter]').forEach((c) => c.classList.add('is-on'));

  updateTagFilterVisibility();
  updateFilterReset();
  cb.onFilterChange && cb.onFilterChange(filters);
}

function updateTagFilterVisibility() {
  const chips = [...el.filterRow.querySelectorAll('[data-tag-filter]')];
  let hidden = 0;

  chips.forEach((chip, i) => {
    const on = filters.tags.includes(chip.dataset.tagFilter);
    const show = tagFilterOpen || i < TAG_FILTER_VISIBLE || on;
    chip.hidden = !show;
    if (!show) hidden++;
  });

  if (!el.tagMore) return;
  el.tagMore.hidden = !tagFilterOpen && hidden === 0;
  el.tagMore.textContent = tagFilterOpen ? '접기' : `+${hidden}`;
  el.tagMore.setAttribute('aria-expanded', String(tagFilterOpen));
  el.tagMore.setAttribute('aria-label', tagFilterOpen ? '태그 접기' : '태그 더 보기');
}

export function setUsers(ids) {
  const next = Array.isArray(ids) ? ids : [];

  paintMePill();

  if (next.join(' ') === userIds.join(' ')) return;
  userIds = next.slice();

  filters.users = userIds.slice();
  updateFilterReset();

  el.filterRow.querySelectorAll('[data-user-filter]').forEach((n) => n.remove());
  if (!el.userDiv) {
    el.userDiv = h('span', 'filter-div');
    el.userDiv.setAttribute('aria-hidden', 'true');
  }
  el.userDiv.remove();
  if (userIds.length < 2) return;

  const frag = document.createDocumentFragment();
  frag.appendChild(el.userDiv);

  const ordered = userIds.slice().sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));

  ordered.forEach((id) => {
    const color = userColor(id);
    const chip = h('button', 'chip chip--user');
    chip.type = 'button';
    chip.dataset.userFilter = id;
    chip.style.setProperty('--user-dot', color.dot);
    chip.style.setProperty('--user-soft', color.soft);
    chip.style.setProperty('--user-text', color.text);

    chip.append(
      h('span', 'chip__dot chip__dot--user'),
      document.createTextNode(id === myId ? `${displayName(id)} (나)` : displayName(id))
    );
    chip.classList.toggle('is-on', filters.users.includes(id));

    chip.addEventListener('click', () => {
      const on = filters.users.includes(id);
      filters.users = on
        ? filters.users.filter((u) => u !== id)
        : filters.users.concat(id);
      chip.classList.toggle('is-on', !on);
      updateFilterReset();
      cb.onFilterChange && cb.onFilterChange(filters);
    });

    frag.appendChild(chip);
  });

  const firstTag = el.filterRow.querySelector('[data-tag-filter]');
  const anchor = firstTag ? firstTag.previousElementSibling || firstTag : null;
  if (anchor) el.filterRow.insertBefore(frag, anchor);
  else el.filterRow.appendChild(frag);
}

function paintMePill() {
  if (!myId) { el.mePill.hidden = true; return; }

  const color = userColor(myId);
  el.mePill.hidden = false;
  el.mePillName.textContent = displayName(myId);
  el.mePillDot.style.background = color.dot;
  el.mePill.style.setProperty('--user-soft', color.soft);
  el.mePill.style.setProperty('--user-text', color.text);

  el.mePill.title = `${displayName(myId)} 님으로 로그인했어요`;
}

export function resetTagFilter() {
  filters.tags = [];
  filters.users = [];
  tagFilterOpen = false;
  userIds = [];

  el.filterRow.querySelectorAll('[data-tag-filter]').forEach((c) => c.classList.remove('is-on'));
  el.filterRow.querySelectorAll('[data-user-filter]').forEach((n) => n.remove());
  if (el.userDiv) el.userDiv.remove();
  updateTagFilterVisibility();
}

export function renderSearchResults(list) {
  el.searchResults.innerHTML = '';

  if (!list.length) {
    el.searchEmpty.hidden = false;
    el.searchCount.textContent = '검색 결과';
  } else {
    el.searchEmpty.hidden = true;
    el.searchCount.textContent = `검색 결과 ${list.length}곳`;

    const frag = document.createDocumentFragment();
    list.forEach((place) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'result-item';

      btn.innerHTML =
        '<span class="result-item__ico">' +
          '<svg viewBox="0 0 24 24" fill="none" class="w-[17px] h-[17px]">' +
            '<path d="M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
            '<circle cx="12" cy="10" r="2.3" fill="currentColor"/>' +
          '</svg>' +
        '</span>' +
        '<span class="min-w-0 flex-1">' +
          '<span class="result-item__name block"></span>' +
          '<span class="result-item__addr block"></span>' +
          '<span class="result-item__cat"></span>' +
          '<span class="result-item__dist"></span>' +
        '</span>';

      btn.querySelector('.result-item__name').textContent = place.name;
      btn.querySelector('.result-item__addr').textContent = place.roadAddress || place.address || '';

      const catEl = btn.querySelector('.result-item__cat');
      if (place.category) catEl.textContent = place.category;
      else catEl.remove();

      const distEl = btn.querySelector('.result-item__dist');
      if (Number.isFinite(place.distance)) distEl.textContent = fmtDistance(place.distance);
      else distEl.remove();

      btn.addEventListener('click', () => {
        hideSearchPanel();
        cb.onSelectPlace && cb.onSelectPlace(place);
      });

      li.appendChild(btn);
      frag.appendChild(li);
    });
    el.searchResults.appendChild(frag);
  }

  el.searchPanel.hidden = false;
}

function fmtDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;

  const km = meters / 1000;
  return km < 100 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
}

export function hideSearchPanel() {
  el.searchPanel.hidden = true;
}

export function clearSearch() {
  el.searchInput.value = '';
  el.searchClear.hidden = true;
  el.searchResults.innerHTML = '';
  hideSearchPanel();
}

function openSheet(mode) {
  sheetMode = mode;

  el.panelForm.hidden   = mode !== 'form';
  el.panelDetail.hidden = mode !== 'detail';

  el.backdrop.hidden = false;
  el.sheet.hidden = false;

  requestAnimationFrame(() => {
    el.backdrop.classList.add('is-on');
    el.sheet.classList.add('is-on');
  });

  hideHint();
}

export function closeSheet(immediate = false) {
  if (!sheetMode) return;
  sheetMode = null;

  formSession++;
  setPhotoBusy(false);

  el.sheet.classList.remove('is-on');
  el.backdrop.classList.remove('is-on');

  const finish = () => {
    el.sheet.hidden = true;
    el.backdrop.hidden = true;
    el.sheet.scrollTop = 0;
  };
  if (immediate) finish(); else setTimeout(finish, 420);

  cb.onSheetClose && cb.onSheetClose();
}

export function isSheetOpen() { return sheetMode !== null; }

export function openForm(opts) {
  const isEdit = opts.mode === 'edit';

  formSession++;

  el.formTitle.textContent = isEdit ? '핀 수정하기' : '새로운 핀';
  el.formSubmit.querySelector('.btn-label').textContent = isEdit ? '수정 완료' : '저장하기';
  el.formDelete.hidden = !isEdit;

  el.pinName.value = isEdit ? (opts.pin.name || '') : (opts.name || '');
  el.pinMemo.value = isEdit ? (opts.pin.memo || '') : '';
  el.pinDate.value = isEdit ? (opts.pin.visitedAt || '') : '';

  setFormCategory(isEdit ? opts.pin.category : 'visited');
  setFormTags(isEdit ? opts.pin.tags : []);
  setFormAddress(isEdit ? (opts.pin.address || '') : (opts.address || ''));

  const photos = (isEdit && Array.isArray(opts.photos)) ? opts.photos : [];
  formPhotos = photos.map((p) => ({
    key: `s${p.id}`, id: p.id, dataUrl: p.dataUrl, w: p.w, h: p.h
  }));
  formOriginalIds = formPhotos.map((p) => p.id);
  renderPhotoStrip();

  setFormLoading(false);
  openSheet('form');

  if (!isEdit && !el.pinName.value && window.matchMedia('(hover: hover)').matches) {
    setTimeout(() => el.pinName.focus(), 260);
  }
}

export function setFormAddress(text) {
  el.formAddress.textContent = text || '주소 정보 없음';
}

export function setFormCategory(category) {
  formCategory = category === 'wish' ? 'wish' : 'visited';

  document.querySelectorAll('[data-category]').forEach((btn) => {
    const on = btn.dataset.category === formCategory;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', String(on));
  });

  el.dateLabel.textContent = formCategory === 'wish' ? '가고 싶은 날' : '다녀온 날';
}

function buildTagPicker() {
  const frag = document.createDocumentFragment();

  TAGS.forEach((tag) => {
    const btn = h('button', 'tag-opt');
    btn.type = 'button';
    btn.dataset.tagOpt = tag.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.append(h('span', 'tag-opt__emoji', tag.emoji), document.createTextNode(tag.label));

    btn.addEventListener('click', () => {
      if (formTags.includes(tag.id)) {
        setFormTags(formTags.filter((t) => t !== tag.id));
      } else if (formTags.length >= MAX_TAGS) {
        toast(`태그는 최대 ${MAX_TAGS}개까지 고를 수 있어요.`);
      } else {
        setFormTags(formTags.concat(tag.id));
      }
    });

    frag.appendChild(btn);
  });

  el.tagPicker.appendChild(frag);
}

function setFormTags(list) {
  formTags = normalizeTags(list);
  el.tagPicker.querySelectorAll('[data-tag-opt]').forEach((btn) => {
    const on = formTags.includes(btn.dataset.tagOpt);
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

async function pickPhotos(fileList) {
  const session = formSession;
  const room = MAX_PHOTOS - formPhotos.length;

  if (room <= 0) {
    toast(`사진은 최대 ${MAX_PHOTOS}장까지 넣을 수 있어요.`);
    return;
  }

  const picked = Array.from(fileList).slice(0, room);
  if (fileList.length > room) {
    toast(`${room}장만 추가했어요. (최대 ${MAX_PHOTOS}장)`, 2600);
  }

  setPhotoBusy(true);
  for (const file of picked) {
    try {
      const out = await compressPhoto(file);
      if (session !== formSession) return;
      formPhotos.push({ key: `n${++photoKeySeq}`, id: null, ...out });
      renderPhotoStrip();
    } catch (err) {
      if (session !== formSession) return;
      toast(err.message || '사진을 넣지 못했어요.', 3000);
    }
  }
  if (session === formSession) setPhotoBusy(false);
}

function setPhotoBusy(on) {
  photoBusy = on;
  el.photoAdd.classList.toggle('is-busy', on);
  el.photoAdd.disabled = on;
  el.formSubmit.disabled = on;
}

function renderPhotoStrip() {

  el.photoStrip.querySelectorAll('.photo-thumb').forEach((n) => n.remove());

  const frag = document.createDocumentFragment();
  formPhotos.forEach((p) => {
    const wrap = h('div', 'photo-thumb');

    const img = document.createElement('img');
    img.src = p.dataUrl;
    img.alt = '';
    img.loading = 'lazy';
    wrap.appendChild(img);

    const del = h('button', 'photo-thumb__del');
    del.type = 'button';
    del.setAttribute('aria-label', '사진 빼기');
    del.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" class="w-[12px] h-[12px]">' +
        '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
      '</svg>';
    del.addEventListener('click', () => {
      formPhotos = formPhotos.filter((x) => x.key !== p.key);
      renderPhotoStrip();
    });
    wrap.appendChild(del);

    frag.appendChild(wrap);
  });

  el.photoStrip.insertBefore(frag, el.photoAdd);
  el.photoCountLbl.textContent = `${formPhotos.length}/${MAX_PHOTOS}`;
  el.photoAdd.hidden = formPhotos.length >= MAX_PHOTOS;
}

export function getFormPhotos() { return formPhotos.slice(); }
export function getFormOriginalPhotoIds() { return formOriginalIds.slice(); }

export function getFormValues() {
  return {
    name: el.pinName.value.trim(),
    memo: el.pinMemo.value.trim(),
    category: formCategory,
    tags: formTags.slice(),
    visitedAt: el.pinDate.value || ''
  };
}

export function setFormLoading(on) {
  el.formSubmit.disabled = on || photoBusy;
  el.formSubmit.classList.toggle('is-loading', on);
  el.formSubmit.querySelector('.spinner').hidden = !on;
  el.formDelete.disabled = on;
}

export function openDetail(pin) {
  const isWish = pin.category === 'wish';

  el.detailBadge.textContent = isWish ? '가볼 곳' : '가본 곳';
  el.detailBadge.className = 'badge ' + (isWish ? 'badge--wish' : 'badge--visited');

  el.detailName.textContent = pin.name;
  el.detailAddress.textContent = pin.address || '주소 정보 없음';

  el.detailVisit.hidden = !isWish;

  if (pin.visitedAt) {
    const d = parseDateValue(pin.visitedAt);
    el.detailWhenText.textContent =
      (isWish ? '가고 싶은 날 · ' : '다녀온 날 · ') + (d ? fmtFullDate(d) : pin.visitedAt);
    el.detailWhen.hidden = false;
  } else {
    el.detailWhen.hidden = true;
  }

  renderTagRow(el.detailTags, pin.tags);

  if (pin.memo) {
    el.detailMemoWrap.hidden = false;
    renderMemo(pin.memo);
    setCopied(false);
  } else {
    el.detailMemoWrap.hidden = true;
  }

  renderMeta(pin);

  openSheet('detail');
}

// http(s):// 로 시작하거나 www. 로 시작하는 주소만 링크로 만든다.
// 다른 스킴(javascript: 같은)은 아예 걸리지 않는다.
const MEMO_URL = /(https?:\/\/[^\s<>()[\]{}"']+|www\.[^\s<>()[\]{}"']+)/gi;

function renderMemo(text) {
  const node = el.detailMemo;
  node.textContent = '';

  const src = String(text || '');
  let last = 0;
  let m;

  MEMO_URL.lastIndex = 0;

  while ((m = MEMO_URL.exec(src)) !== null) {
    let raw = m[0];

    // '...했어요(https://a.com).' 처럼 뒤에 붙은 문장부호는 링크에서 뺀다.
    const tail = raw.match(/[.,!?;:)\]}]+$/);
    if (tail) raw = raw.slice(0, -tail[0].length);

    if (!raw) { MEMO_URL.lastIndex = m.index + m[0].length; continue; }

    if (m.index > last) node.appendChild(document.createTextNode(src.slice(last, m.index)));

    const a = document.createElement('a');
    a.className = 'memo-link';
    a.href = /^www\./i.test(raw) ? `https://${raw}` : raw;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = raw;
    node.appendChild(a);

    last = m.index + raw.length;
    MEMO_URL.lastIndex = last;
  }

  if (last < src.length) node.appendChild(document.createTextNode(src.slice(last)));
}

async function copyMemo() {
  // 링크의 글자는 원래 주소 그대로라, 이어 붙이면 저장된 메모와 같다.
  const text = el.detailMemo.textContent;
  if (!text) return;

  if (!(await writeClipboard(text))) {
    toast('복사하지 못했어요. 메모를 길게 눌러 직접 복사해주세요.');
    return;
  }

  toast('메모를 복사했어요.');
  setCopied(true);

  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => setCopied(false), 1600);
}

function setCopied(on) {
  el.detailMemoCopy.classList.toggle('is-done', on);
  el.memoCopyIcon.hidden = on;
  el.memoCopyDone.hidden = !on;
}

async function writeClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {  }

  // https 가 아닌 곳에서는 클립보드 API 를 못 쓰니 예전 방식으로 대신한다.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

function renderTagRow(container, tags) {
  container.innerHTML = '';
  const list = normalizeTags(tags);

  if (!list.length) { container.hidden = true; return; }

  list.forEach((id) => {
    const t = tagById(id);
    if (!t) return;
    const pill = h('span', 'tag-pill');
    pill.append(h('span', 'tag-pill__emoji', t.emoji), document.createTextNode(t.label));
    container.appendChild(pill);
  });
  container.hidden = false;
}

function renderMeta(pin) {
  el.detailMeta.innerHTML = '';

  if (pin.createdBy) {
    const dot = h('span', 'meta-dot');
    dot.style.background = userColor(pin.createdBy).dot;
    el.detailMeta.append(dot, h('span', 'meta-by', `${displayName(pin.createdBy)} 님이 추가`));
  }

  const edited = pin.updatedAt && pin.createdAt && pin.updatedAt - pin.createdAt > 1000;
  const when = pin.updatedAt || pin.createdAt;

  if (when) {
    if (pin.createdBy) el.detailMeta.appendChild(h('span', 'meta-sep', '·'));
    el.detailMeta.appendChild(h('span', null, fmtStamp(when) + (edited ? ' 수정됨' : '')));
  }
}

export function setDetailPhotos(photos) {
  const list = Array.isArray(photos) ? photos : [];
  el.detailPhotos.innerHTML = '';

  if (!list.length) { el.detailGallery.hidden = true; updateGalleryNav(); return; }

  const frag = document.createDocumentFragment();
  list.forEach((p, i) => {
    const btn = h('button', 'gallery__item');
    btn.type = 'button';
    btn.setAttribute('aria-label', `사진 ${i + 1} 크게 보기`);

    const img = document.createElement('img');
    img.src = p.dataUrl;
    img.alt = '';
    img.loading = 'lazy';
    btn.appendChild(img);

    btn.addEventListener('click', () => openLightbox(list, i));
    frag.appendChild(btn);
  });

  el.detailPhotos.appendChild(frag);
  el.detailGallery.hidden = false;
  el.detailPhotos.scrollLeft = 0;
  updateGalleryNav();
}

function updateGalleryNav() {
  const box = el.detailPhotos;
  const overflow = box.scrollWidth - box.clientWidth;

  const canScroll = overflow > 2;
  const atStart = box.scrollLeft <= 2;
  const atEnd = box.scrollLeft >= overflow - 2;

  el.galleryPrev.hidden = !canScroll || atStart;
  el.galleryNext.hidden = !canScroll || atEnd;
}

function stepGallery(dir) {
  el.detailPhotos.scrollBy({
    left: dir * el.detailPhotos.clientWidth * 0.85,
    behavior: 'smooth'
  });
}

export function setDetailComments(comments) {
  const list = Array.isArray(comments) ? comments : [];

  el.commentCount.textContent = list.length;
  el.commentEmpty.hidden = list.length > 0;
  el.commentList.innerHTML = '';

  const frag = document.createDocumentFragment();
  list.forEach((c) => {
    const mine = !!myId && normalizeId(c.by) === myId;

    const li = h('li', 'comment' + (mine ? ' is-mine' : ''));
    const bubble = h('div', 'comment__bubble');

    const head = h('div', 'comment__head');

    const by = h('span', 'comment__by', mine ? '나' : (displayName(c.by) || '상대방'));
    if (c.by) by.style.color = userColor(c.by).text;
    head.appendChild(by);

    const time = h('span', 'comment__time', relTime(c.createdAt));
    time.title = fmtStamp(c.createdAt);
    head.appendChild(time);

    if (mine) {
      const del = h('button', 'comment__del', '삭제');
      del.type = 'button';
      del.addEventListener('click', () => cb.onDeleteComment && cb.onDeleteComment(c.id));
      head.appendChild(del);
    }

    bubble.appendChild(head);
    bubble.appendChild(h('p', 'comment__text', c.text));
    li.appendChild(bubble);
    frag.appendChild(li);
  });

  el.commentList.appendChild(frag);
}

export function clearDetailExtras() {
  el.detailPhotos.innerHTML = '';
  el.detailGallery.hidden = true;
  el.galleryPrev.hidden = true;
  el.galleryNext.hidden = true;
  el.commentList.innerHTML = '';
  el.commentEmpty.hidden = false;
  el.commentCount.textContent = '0';
  el.commentInput.value = '';
}

export function openLightbox(photos, index) {
  lightboxPhotos = photos.slice();
  lightboxIndex = Math.max(0, Math.min(index, lightboxPhotos.length - 1));

  el.lightbox.hidden = false;
  requestAnimationFrame(() => el.lightbox.classList.add('is-on'));
  paintLightbox();
}

function paintLightbox() {
  const p = lightboxPhotos[lightboxIndex];
  if (!p) { closeLightbox(); return; }

  el.lightboxImg.src = p.dataUrl;
  el.lightboxCount.textContent = `${lightboxIndex + 1} / ${lightboxPhotos.length}`;

  const many = lightboxPhotos.length > 1;
  el.lightboxPrev.hidden = !many;
  el.lightboxNext.hidden = !many;
}

function stepLightbox(delta) {
  if (!lightboxPhotos.length) return;
  lightboxIndex = (lightboxIndex + delta + lightboxPhotos.length) % lightboxPhotos.length;
  paintLightbox();
}

export function closeLightbox() {
  if (el.lightbox.hidden) return;

  el.lightbox.classList.remove('is-on');
  setTimeout(() => {
    el.lightbox.hidden = true;
    el.lightboxImg.removeAttribute('src');
    lightboxPhotos = [];
  }, 240);
}

export function isLightboxOpen() { return !el.lightbox.hidden; }

export function openTimeline(pins, origin) {
  timelineOpen = true;
  el.timeline.hidden = false;
  requestAnimationFrame(() => el.timeline.classList.add('is-on'));

  timelineQuery = '';
  el.timelineSearch.value = '';
  el.timelineSearchClear.hidden = true;

  renderTimeline(pins, origin);
  hideHint();
}

export function closeTimeline(immediate = false) {
  if (!timelineOpen) return;
  timelineOpen = false;

  el.timeline.classList.remove('is-on');
  const finish = () => {
    el.timeline.hidden = true;
    el.timelineList.scrollTop = 0;
  };
  if (immediate) finish(); else setTimeout(finish, 360);
}

export function isTimelineOpen() { return timelineOpen; }

export function renderTimeline(pins, origin) {
  timelinePins = Array.isArray(pins) ? pins : [];
  if (origin) timelineOrigin = origin;

  const list = timelinePins
    .filter((p) => timelineMode === 'all' || p.category === timelineMode)
    .filter((p) => matchesTimelineQuery(p))
    .slice()
    .sort(timelineSorter());

  if (timelineQuery) {
    el.timelineSub.textContent = `검색 결과 ${list.length}곳`;
  } else {
    const visited = timelinePins.filter((p) => p.category === 'visited').length;
    el.timelineSub.textContent = `가본 곳 ${visited}곳 · 가볼 곳 ${timelinePins.length - visited}곳`;
  }

  el.timelineList.innerHTML = '';

  el.timelineList.hidden = !list.length;
  el.timelineEmpty.hidden = list.length > 0;
  if (!list.length) { paintTimelineEmpty(); return; }

  const byMonth  = timelineSort === 'recent' || timelineSort === 'oldest';
  const byRegion = timelineSort === 'region';

  // 지역 헤더에 개수를 같이 보여주려면 미리 세어둔다.
  const regionCount = new Map();
  if (byRegion) {
    list.forEach((p) => {
      const r = regionOf(p);
      regionCount.set(r, (regionCount.get(r) || 0) + 1);
    });
  }

  const frag = document.createDocumentFragment();
  let lastGroup = '';

  list.forEach((pin) => {
    const d = effectiveDate(pin);

    if (byMonth) {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== lastGroup) {
        lastGroup = key;
        frag.appendChild(h('div', 'tl-group', `${d.getFullYear()}년 ${d.getMonth() + 1}월`));
      }
    } else if (byRegion) {
      const key = regionOf(pin);
      if (key !== lastGroup) {
        lastGroup = key;
        frag.appendChild(h('div', 'tl-group', `${key} · ${regionCount.get(key)}곳`));
      }
    }

    frag.appendChild(buildTimelineItem(pin, d));
  });

  el.timelineList.appendChild(frag);
}

function matchesTimelineQuery(pin) {
  if (!timelineQuery) return true;

  const tagLabels = pin.tags
    .map((id) => { const t = tagById(id); return t ? t.label : ''; })
    .join(' ');

  return `${pin.name} ${pin.memo} ${pin.address} ${tagLabels}`
    .toLowerCase()
    .includes(timelineQuery);
}

function timelineSorter() {
  switch (timelineSort) {
    case 'oldest':
      return (a, b) => effectiveDate(a) - effectiveDate(b);

    case 'name':
      return (a, b) => a.name.localeCompare(b.name, 'ko');

    case 'near':

      if (!timelineOrigin) return (a, b) => effectiveDate(b) - effectiveDate(a);
      return (a, b) => distanceOf(a) - distanceOf(b);

    case 'region':
      return (a, b) => {
        const ra = regionOf(a);
        const rb = regionOf(b);

        if (ra !== rb) {
          // 주소를 못 받은 핀은 항상 맨 뒤로 모은다.
          if (ra === REGION_UNKNOWN) return 1;
          if (rb === REGION_UNKNOWN) return -1;
          return ra.localeCompare(rb, 'ko');
        }

        return effectiveDate(b) - effectiveDate(a);
      };

    default:
      return (a, b) => effectiveDate(b) - effectiveDate(a);
  }
}

function distanceOf(pin) {
  if (!timelineOrigin) return Infinity;
  return distanceMeters(timelineOrigin.lat, timelineOrigin.lng, pin.lat, pin.lng);
}

const REGION_UNKNOWN = '지역 미확인';

// 카카오는 같은 시/도를 '서울' 로 줄여 주기도 하고 '서울특별시' 로 다 쓰기도 한다.
// 둘이 다른 그룹으로 갈리지 않도록 짧은 쪽으로 맞춘다.
const REGION_ALIAS = {
  '서울특별시': '서울',   '부산광역시': '부산',   '대구광역시': '대구',
  '인천광역시': '인천',   '광주광역시': '광주',   '대전광역시': '대전',
  '울산광역시': '울산',   '세종특별자치시': '세종',
  '경기도': '경기',
  '강원도': '강원',       '강원특별자치도': '강원',
  '충청북도': '충북',     '충청남도': '충남',
  '전라북도': '전북',     '전북특별자치도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',     '경상남도': '경남',
  '제주도': '제주',       '제주특별자치도': '제주'
};

// 주소의 첫 토큰이 시/도다. ('서울 성동구 연무장길 5' → '서울')
function regionOf(pin) {
  const first = String(pin.address || '').trim().split(/\s+/)[0];
  if (!first) return REGION_UNKNOWN;
  return REGION_ALIAS[first] || first;
}

function paintTimelineEmpty() {
  const hasAny = timelinePins.length > 0;
  const title = el.timelineEmpty.querySelector('[data-empty-title]');
  const desc = el.timelineEmpty.querySelector('[data-empty-desc]');

  if (hasAny) {
    title.textContent = '찾는 핀이 없어요';
    desc.textContent = timelineQuery ? '다른 말로 검색해 보세요' : '다른 조건으로 골라보세요';
  } else {
    title.textContent = '아직 기록이 없어요';
    desc.textContent = '지도에서 핀을 추가하면 여기에 쌓여요';
  }
}

function clearTimelineSearch() {
  timelineQuery = '';
  el.timelineSearch.value = '';
  el.timelineSearchClear.hidden = true;
  renderTimeline(timelinePins);
}

function buildTimelineItem(pin, date) {
  const isWish = pin.category === 'wish';

  const btn = h('button', 'tl-item');
  btn.type = 'button';

  const thumb = h('span', 'tl-item__thumb' + (isWish ? ' is-wish' : ''));
  if (pin.cover) {
    const img = document.createElement('img');
    img.src = pin.cover;
    img.alt = '';
    img.loading = 'lazy';
    thumb.appendChild(img);
  } else {
    const first = pin.tags.length ? tagById(pin.tags[0]) : null;
    thumb.appendChild(h('span', 'tl-item__glyph', first ? first.emoji : '📍'));
  }
  btn.appendChild(thumb);

  const body = h('span', 'tl-item__body');

  const top = h('span', 'tl-item__top');
  top.appendChild(h('span', 'badge ' + (isWish ? 'badge--wish' : 'badge--visited'),
    isWish ? '가볼 곳' : '가본 곳'));

  top.appendChild(h('span', 'tl-item__date', pin.visitedAt
    ? fmtShortDate(date)
    : `기록 ${fmtShortDate(date)} ${fmtTime(date)}`));

  if (timelineSort === 'near' && timelineOrigin) {
    top.appendChild(h('span', 'tl-item__dist', formatDistance(distanceOf(pin))));
  }

  body.appendChild(top);

  body.appendChild(h('span', 'tl-item__name', pin.name));

  if (pin.memo) body.appendChild(h('span', 'tl-item__memo', pin.memo));

  if (pin.tags.length) {
    const tagLine = h('span', 'tl-item__tags');
    pin.tags.forEach((id) => {
      const t = tagById(id);
      if (t) tagLine.appendChild(h('span', 'tl-tag', `${t.emoji} ${t.label}`));
    });
    body.appendChild(tagLine);
  }

  if (pin.createdBy || pin.photoCount || pin.commentCount) {
    const meta = h('span', 'tl-item__meta');

    if (pin.createdBy) {
      const who = h('span', 'tl-item__by');
      const dot = h('span', 'meta-dot');
      dot.style.background = userColor(pin.createdBy).dot;
      who.append(dot, document.createTextNode(displayName(pin.createdBy)));
      meta.appendChild(who);
    }

    if (pin.photoCount)   meta.appendChild(h('span', null, `사진 ${pin.photoCount}`));
    if (pin.commentCount) meta.appendChild(h('span', null, `댓글 ${pin.commentCount}`));
    body.appendChild(meta);
  }

  btn.appendChild(body);

  btn.addEventListener('click', () => {
    closeTimeline();
    cb.onTimelineSelect && cb.onTimelineSelect(pin.id);
  });

  return btn;
}

function effectiveDate(pin) {
  const d = parseDateValue(pin.visitedAt);
  return d || pin.createdAt || new Date();
}

export function todayValue() {
  const n = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

function parseDateValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function fmtFullDate(d) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
}

function fmtShortDate(d) {
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function fmtTime(d) {
  const p = (v) => String(v).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtStamp(d) {
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${fmtTime(d)}`;
}

function relTime(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';

  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);

  if (min < 1)  return '방금';
  if (min < 60) return `${min}분 전`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;

  const day = Math.floor(hour / 24);
  if (day === 1) return `어제 ${fmtTime(d)}`;
  if (day < 7)   return `${day}일 전`;

  return `${fmtShortDate(d)} ${fmtTime(d)}`;
}

export function openPicker() {
  el.picker.hidden = false;
  el.pickerAddress.textContent = '위치를 찾는 중…';
  hideHint();
}

export function closePicker() {
  el.picker.hidden = true;
}

export function isPickerOpen() { return !el.picker.hidden; }

export function setPickerAddress(text) {
  el.pickerAddress.textContent = text || '주소 정보 없음';
}

export function setLocating(on) {
  clearTimeout(locatingTimer);
  el.btnLocate.classList.toggle('is-busy', on);

  if (on) {
    locatingTimer = setTimeout(() => { el.locatingPill.hidden = false; }, 400);
  } else {
    el.locatingPill.hidden = true;
  }
}

export function setZoomState(state) {
  el.btnZoomIn.disabled  = !state.canZoomIn;
  el.btnZoomOut.disabled = !state.canZoomOut;
}

export function showHint(ms = 4200) {
  clearTimeout(hintTimer);
  el.hintPill.classList.add('is-on');
  hintTimer = setTimeout(() => el.hintPill.classList.remove('is-on'), ms);
}

export function hideHint() {
  clearTimeout(hintTimer);
  el.hintPill.classList.remove('is-on');
}

export function toast(message, ms = 2200, action = null) {
  clearTimeout(toastTimer);
  el.toastText.textContent = message;

  toastActionFn = action ? action.onClick : null;
  el.toastAction.hidden = !action;
  if (action) el.toastAction.textContent = action.label;

  el.toast.hidden = false;
  requestAnimationFrame(() => el.toast.classList.add('is-on'));

  toastTimer = setTimeout(hideToast, ms);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastActionFn = null;
  el.toast.classList.remove('is-on');
  setTimeout(() => { el.toast.hidden = true; }, 320);
}

export function confirmDialog({ title, desc, okText = '삭제', cancelText = '취소' }) {
  return new Promise((resolve) => {
    el.confirmTitle.textContent = title;
    el.confirmDesc.textContent = desc;
    el.confirmOk.textContent = okText;
    el.confirmCancel.textContent = cancelText;

    el.confirm.hidden = false;
    requestAnimationFrame(() => el.confirm.classList.add('is-on'));

    const ok = el.confirmOk.cloneNode(true);
    const cancel = el.confirmCancel.cloneNode(true);
    el.confirmOk.replaceWith(ok);
    el.confirmCancel.replaceWith(cancel);
    el.confirmOk = ok;
    el.confirmCancel = cancel;

    const close = (result) => {
      el.confirm.classList.remove('is-on');
      setTimeout(() => { el.confirm.hidden = true; }, 280);
      resolve(result);
    };

    ok.addEventListener('click', () => close(true));
    cancel.addEventListener('click', () => close(false));
  });
}
