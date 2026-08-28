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
  writeBatch
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

  return {
    app: 'PinLog',
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: me(),
    includesPhotos: withPhotos,
    pinCount: pins.length,
    pins
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
