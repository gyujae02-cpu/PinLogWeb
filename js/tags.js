export const MAX_TAGS = 3;

export const DEFAULT_TAG = 'etc';

export const TAGS = [
  { id: 'food',    label: '맛집',   emoji: '🍜' },
  { id: 'cafe',    label: '카페',   emoji: '☕' },
  { id: 'date',    label: '놀거리', emoji: '🎡' },
  { id: 'culture', label: '문화',   emoji: '🎬' },
  { id: 'nature',  label: '산책',   emoji: '🚶' },
  { id: 'spot',    label: '명소',   emoji: '🗼' },
  { id: 'shop',    label: '쇼핑',   emoji: '🛍️' },
  { id: 'stay',    label: '숙소',   emoji: '🛏️' },
  { id: 'etc',     label: '기타',   emoji: '📌' }
];

const BY_ID = new Map(TAGS.map((t) => [t.id, t]));
const ORDER = TAGS.map((t) => t.id);

export function tagById(id) {
  return BY_ID.get(id) || null;
}

export function normalizeTags(list) {
  if (!Array.isArray(list)) return [];

  const out = [];
  for (const raw of list) {
    const id = String(raw);
    if (BY_ID.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_TAGS) break;
  }

  return out.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

export function tagsForSave(list) {
  const tags = normalizeTags(list);
  return tags.length ? tags : [DEFAULT_TAG];
}

// 장소의 '조건' — 태그(어떤 장소인가)와 달리 개수 제한이 없고, 필터는 AND 로 건다.
// id 를 바꾸면 firestore.rules 의 features 목록도 같이 바꿔야 한다.
export const FEATURES = [
  { id: 'pet',  label: '초롱 동반', emoji: '🐩' },   // 초롱이 — 갈색 푸들
  { id: 'late', label: '심야',     emoji: '🌙' }
];

const FEATURE_BY_ID = new Map(FEATURES.map((f) => [f.id, f]));
const FEATURE_ORDER = FEATURES.map((f) => f.id);

export function featureById(id) {
  return FEATURE_BY_ID.get(id) || null;
}

export function normalizeFeatures(list) {
  if (!Array.isArray(list)) return [];

  const out = [];
  for (const raw of list) {
    const id = String(raw);
    if (FEATURE_BY_ID.has(id) && !out.includes(id)) out.push(id);
  }

  return out.sort((a, b) => FEATURE_ORDER.indexOf(a) - FEATURE_ORDER.indexOf(b));
}
