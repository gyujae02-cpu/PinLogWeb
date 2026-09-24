import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
  writeBatch,
  where,
  arrayUnion,
  arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { normalizeTags, tagsForSave } from './tags.js';

export const firebaseConfig = {
  apiKey: "AIzaSyA4fwdqoxsOY7o8oV-H7TPxpBv-pe44wHo",
  authDomain: "pinlog-788a0.firebaseapp.com",
  projectId: "pinlog-788a0",
  storageBucket: "pinlog-788a0.firebasestorage.app",
  messagingSenderId: "16189977276",
  appId: "1:16189977276:web:44672f0af3ddb30e7d16b9"
};

export const isConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const PINS = collection(db, 'pins');
const COURSES = collection(db, 'courses');

export const ID_DOMAIN = 'pinlog.app';

export function idToEmail(id) {
  const raw = String(id || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.includes('@') ? raw : `${raw}@${ID_DOMAIN}`;
}

export function emailToId(email) {
  const raw = String(email || '');
  return raw.endsWith(`@${ID_DOMAIN}`) ? raw.slice(0, -(ID_DOMAIN.length + 1)) : raw;
}

export function isValidId(id) {
  const raw = String(id || '').trim();
  if (raw.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  return /^[A-Za-z0-9._-]{2,30}$/.test(raw);
}

setPersistence(auth, browserLocalPersistence).catch(() => {  });

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function login(id, password) {
  const cred = await signInWithEmailAndPassword(auth, idToEmail(id), password);
  return cred.user;
}

export function currentUserId() {
  const u = auth.currentUser;
  return u ? emailToId(u.email) : '';
}

export function logout() {
  return signOut(auth);
}

export function currentUser() {
  return auth.currentUser;
}

export function authErrorMessage(err) {
  const code = (err && err.code) || '';
  switch (code) {
    case 'auth/invalid-email':          return '아이디 형식이 올바르지 않아요. (영문·숫자)';
    case 'auth/missing-password':       return '비밀번호를 입력해주세요.';
    case 'auth/user-disabled':          return '사용이 중지된 계정이에요.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':     return '아이디 또는 비밀번호가 맞지 않아요.';
    case 'auth/too-many-requests':      return '시도가 너무 많아요. 잠시 후 다시 시도해주세요.';
    case 'auth/network-request-failed': return '네트워크 연결을 확인해주세요.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Firebase 설정이 아직 비어 있어요. js/firebase.js 를 확인해주세요.';
    case 'auth/unauthorized-domain':
      return '승인된 도메인이 아니에요. Firebase 콘솔에서 도메인을 추가해주세요.';
    default:                            return '로그인에 실패했어요. 다시 시도해주세요.';
  }
}

function toDate(v) {
  return v && typeof v.toDate === 'function' ? v.toDate() : null;
}

function me() {
  const u = auth.currentUser;
  return u ? emailToId(u.email) : '';
}

function normalizeDate(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

export function subscribePins(onData, onError) {
  const q = query(PINS, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id,
          name: v.name || '이름 없는 장소',
          memo: v.memo || '',
          category: v.category === 'wish' ? 'wish' : 'visited',
          tags: normalizeTags(v.tags),
          visitedAt: normalizeDate(v.visitedAt),
          address: v.address || '',
          lat: Number(v.lat),
          lng: Number(v.lng),
          cover: typeof v.cover === 'string' ? v.cover : '',
          photoCount: Number(v.photoCount) > 0 ? Number(v.photoCount) : 0,
          commentCount: Number(v.commentCount) > 0 ? Number(v.commentCount) : 0,
          createdAt: toDate(v.createdAt),
          updatedAt: toDate(v.updatedAt),
          createdBy: v.createdBy || ''
        };

      }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

      onData(list);
    },
    (err) => {
      console.error('[PinLog] pins 구독 실패:', err);
      if (onError) onError(err);
    }
  );
}

export function addPin(data) {
  return addDoc(PINS, {
    name: data.name,
    memo: data.memo || '',
    category: data.category,
    tags: tagsForSave(data.tags),
    visitedAt: normalizeDate(data.visitedAt),
    lat: data.lat,
    lng: data.lng,
    address: data.address || '',
    cover: '',
    photoCount: 0,
    commentCount: 0,
    createdBy: me(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export function updatePin(id, data) {
  return updateDoc(doc(db, 'pins', id), {
    name: data.name,
    memo: data.memo || '',
    category: data.category,
    tags: tagsForSave(data.tags),
    visitedAt: normalizeDate(data.visitedAt),
    updatedAt: serverTimestamp()
  });
}

export function setPinVisit(id, category, visitedAt) {
  return updateDoc(doc(db, 'pins', id), {
    category: category === 'wish' ? 'wish' : 'visited',
    visitedAt: normalizeDate(visitedAt),
    updatedAt: serverTimestamp()
  });
}

export async function deletePin(id) {
  const pinRef = doc(db, 'pins', id);

  // 이 핀을 담은 코스에서 먼저 뺀다. 화면이 들고 있는 코스 목록이 아니라
  // 서버에 직접 물어보므로, 상대가 방금 담은 코스까지 빠짐없이 걸린다.
  await removePinFromCourses(id);

  await purgeSubcollection(pinRef, 'photos');
  await purgeSubcollection(pinRef, 'comments');
  await deleteDoc(pinRef);
}

async function purgeSubcollection(parentRef, name) {
  const snap = await getDocs(collection(parentRef, name));
  if (snap.empty) return;

  let batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    if (++n === 450) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) await batch.commit();
}

export function subscribePhotos(pinId, onData, onError) {
  const q = query(collection(db, 'pins', pinId, 'photos'), orderBy('order', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id,
          dataUrl: v.data || '',
          w: Number(v.w) || 0,
          h: Number(v.h) || 0,
          by: v.by || ''
        };
      }).filter((p) => p.dataUrl));
    },
    (err) => {
      console.error('[PinLog] photos 구독 실패:', err);
      if (onError) onError(err);
    }
  );
}

export async function savePhotos(pinId, staged, originalIds = [], cover = '') {
  const photosRef = collection(db, 'pins', pinId, 'photos');
  const keep = new Set(staged.filter((p) => p.id).map((p) => p.id));

  const removed = originalIds.filter((id) => !keep.has(id));
  for (const id of removed) {
    await deleteDoc(doc(photosRef, id));
  }

  const by = me();
  const base = Date.now();
  for (let i = 0; i < staged.length; i++) {
    const p = staged[i];
    if (p.id) continue;
    await addDoc(photosRef, {
      data: p.dataUrl,
      w: p.w,
      h: p.h,
      by,
      order: base + i,
      createdAt: serverTimestamp()
    });
  }

  await updateDoc(doc(db, 'pins', pinId), {
    cover: staged.length ? cover : '',
    photoCount: staged.length
  });
}

export const MAX_COMMENT = 200;

export function subscribeComments(pinId, onData, onError) {
  const q = query(collection(db, 'pins', pinId, 'comments'), orderBy('order', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id,
          text: v.text || '',
          by: v.by || '',
          createdAt: toDate(v.createdAt) || new Date(Number(v.order) || Date.now())
        };
      }).filter((c) => c.text));
    },
    (err) => {
      console.error('[PinLog] comments 구독 실패:', err);
      if (onError) onError(err);
    }
  );
}

export async function addComment(pinId, text) {
  const body = String(text || '').trim().slice(0, MAX_COMMENT);
  if (!body) return;

  await addDoc(collection(db, 'pins', pinId, 'comments'), {
    text: body,
    by: me(),
    order: Date.now(),
    createdAt: serverTimestamp()
  });

  updateDoc(doc(db, 'pins', pinId), { commentCount: increment(1) }).catch(() => {});
}

// 댓글 모아보기 — 댓글이 달린 핀만 골라 한꺼번에 읽어온다.
//
// collectionGroup 으로 한 방에 긁는 방법도 있지만, 그러려면 Firestore 콘솔에서
// 색인을 따로 만들고 보안 규칙도 /{path=**}/comments 로 열어줘야 한다.
// 핀이 수백 개씩 되는 앱이 아니라, 필요한 핀만 병렬로 읽는 쪽이 단순하다.
export async function fetchAllComments(pins) {
  const targets = (pins || []).filter((p) => p && p.id && p.commentCount > 0);
  if (!targets.length) return [];

  const chunks = await Promise.all(targets.map(async (pin) => {
    try {
      const snap = await getDocs(
        query(collection(db, 'pins', pin.id, 'comments'), orderBy('order', 'asc'))
      );

      return snap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id,
          pinId: pin.id,
          text: v.text || '',
          by: v.by || '',
          createdAt: toDate(v.createdAt) || new Date(Number(v.order) || Date.now())
        };
      }).filter((c) => c.text);
    } catch (err) {
      // 핀 하나를 못 읽었다고 전체가 빈손이 되면 안 된다.
      console.error('[PinLog] 댓글 읽기 실패:', pin.id, err);
      return [];
    }
  }));

  return chunks.flat().sort((a, b) => b.createdAt - a.createdAt);
}

export async function exportEverything(onProgress, options = {}) {
  const withPhotos = options.photos !== false;

  const pinsSnap = await getDocs(query(PINS, orderBy('createdAt', 'asc')));
  const total = pinsSnap.docs.length;
  let done = 0;

  const pins = [];
  for (const d of pinsSnap.docs) {
    const v = d.data();

    const [photos, comments] = await Promise.all([
      withPhotos ? getDocs(query(collection(d.ref, 'photos'), orderBy('order', 'asc'))) : null,
      getDocs(query(collection(d.ref, 'comments'), orderBy('order', 'asc')))
    ]);

    pins.push({
      id: d.id,
      name: v.name || '',
      memo: v.memo || '',
      category: v.category || 'visited',
      tags: normalizeTags(v.tags),
      visitedAt: normalizeDate(v.visitedAt),
      lat: Number(v.lat),
      lng: Number(v.lng),
      address: v.address || '',
      createdBy: v.createdBy || '',
      createdAt: toIso(v.createdAt),
      updatedAt: toIso(v.updatedAt),
      comments: comments.docs.map((c) => {
        const cv = c.data();
        return { text: cv.text || '', by: cv.by || '', createdAt: toIso(cv.createdAt) };
      }),
      photos: photos
        ? photos.docs.map((p) => {
            const pv = p.data();
            return { data: pv.data || '', w: Number(pv.w) || 0, h: Number(pv.h) || 0, by: pv.by || '' };
          })
        : undefined,
      photoCount: Number(v.photoCount) || 0
    });

    done++;
    if (onProgress) onProgress(done, total);
  }

  const coursesSnap = await getDocs(query(COURSES, orderBy('createdAt', 'asc')));
  const courses = coursesSnap.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      name: v.name || '',
      date: normalizeDate(v.date),
      status: v.status === 'done' ? 'done' : 'planned',
      stops: normalizeStops(v.stops),
      createdBy: v.createdBy || '',
      createdAt: toIso(v.createdAt),
      updatedAt: toIso(v.updatedAt)
    };
  });

  return {
    app: 'PinLog',
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: me(),
    includesPhotos: withPhotos,
    pinCount: pins.length,
    pins,
    courses
  };
}

function toIso(v) {
  const d = toDate(v);
  return d ? d.toISOString() : null;
}

export async function deleteComment(pinId, commentId) {
  await deleteDoc(doc(db, 'pins', pinId, 'comments', commentId));
  updateDoc(doc(db, 'pins', pinId), { commentCount: increment(-1) }).catch(() => {});
}

/* ── 데이트 코스 ───────────────────────────────────────────── */

// 코스 하나에 담을 수 있는 장소 수. firestore.rules 의 값과 같아야 한다.
export const MAX_STOPS = 10;
export const MAX_STOP_MEMO = 60;

function normalizeTime(v) {
  const s = String(v || '').trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
}

// 저장할 때와 읽을 때 같은 모양으로 맞춘다.
// 같은 핀이 두 번 들어가면 지도 번호가 겹치므로 뒤의 것은 버린다.
function normalizeStops(list) {
  if (!Array.isArray(list)) return [];

  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const pinId = raw && typeof raw.pinId === 'string' ? raw.pinId : '';
    if (!pinId || seen.has(pinId)) continue;
    seen.add(pinId);
    out.push({
      pinId,
      time: normalizeTime(raw.time),
      memo: String(raw.memo || '').trim().slice(0, MAX_STOP_MEMO)
    });
    if (out.length >= MAX_STOPS) break;
  }
  return out;
}

export function subscribeCourses(onData, onError) {
  const q = query(COURSES, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id,
          name: v.name || '이름 없는 코스',
          date: normalizeDate(v.date),
          status: v.status === 'done' ? 'done' : 'planned',
          stops: normalizeStops(v.stops),
          createdBy: v.createdBy || '',
          createdAt: toDate(v.createdAt),
          updatedAt: toDate(v.updatedAt)
        };
      }));
    },
    (err) => {
      console.error('[PinLog] courses 구독 실패:', err);
      if (onError) onError(err);
    }
  );
}

// pinIds 는 stops 에서 핀 id 만 뽑은 보조 필드다.
// 핀을 지울 때 array-contains 로 그 핀이 든 코스를 찾는 데 쓴다.
function courseBody(data) {
  const stops = normalizeStops(data.stops);
  return {
    name: String(data.name || '').trim().slice(0, 40),
    date: normalizeDate(data.date),
    stops,
    pinIds: stops.map((s) => s.pinId)
  };
}

export function addCourse(data) {
  return addDoc(COURSES, {
    ...courseBody(data),
    status: 'planned',
    createdBy: me(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export function updateCourse(id, data) {
  return updateDoc(doc(db, 'courses', id), {
    ...courseBody(data),
    updatedAt: serverTimestamp()
  });
}

// 상세 시트의 '코스에 담기' — 목록 전체를 덮어쓰지 않고 끝에 하나만 붙인다.
// 그래야 상대가 같은 코스를 동시에 고쳐도 서로의 변경을 지우지 않는다.
// (10곳 제한은 규칙이 막고, 앱은 누르기 전에 한 번 더 확인한다)
export function appendCourseStop(id, pinId) {
  return updateDoc(doc(db, 'courses', id), {
    stops: arrayUnion({ pinId, time: '', memo: '' }),
    pinIds: arrayUnion(pinId),
    updatedAt: serverTimestamp()
  });
}

export function deleteCourse(id) {
  return deleteDoc(doc(db, 'courses', id));
}

// 코스 상태와 그 안의 핀들을 한 번에 바꾼다.
// pinChanges: [{ id, category, visitedAt }] — 다녀왔어요 / 되돌리기 양쪽에서 쓴다.
// date 를 넘기면 코스 날짜도 함께 고친다. (날짜 없이 다녀온 코스에 오늘을 채울 때)
// 하나의 batch 라 코스만 바뀌고 핀은 그대로인 어중간한 상태가 생기지 않는다.
export async function setCourseStatus(id, status, pinChanges = [], date) {
  const batch = writeBatch(db);

  const patch = {
    status: status === 'done' ? 'done' : 'planned',
    updatedAt: serverTimestamp()
  };
  if (typeof date === 'string') patch.date = normalizeDate(date);
  batch.update(doc(db, 'courses', id), patch);

  pinChanges.forEach((p) => {
    batch.update(doc(db, 'pins', p.id), {
      category: p.category === 'wish' ? 'wish' : 'visited',
      visitedAt: normalizeDate(p.visitedAt),
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
}

async function removePinFromCourses(pinId) {
  const snap = await getDocs(query(COURSES, where('pinIds', 'array-contains', pinId)));
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    const stops = normalizeStops(d.data().stops).filter((s) => s.pinId !== pinId);
    batch.update(d.ref, {
      stops,
      pinIds: arrayRemove(pinId),
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
}
