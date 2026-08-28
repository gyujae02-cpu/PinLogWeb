export const MAX_TAGS = 3;

export const DEFAULT_TAG = 'etc';

export const TAGS = [
  { id: 'food',    label: '맛집',   emoji: '🍜' },
  { id: 'cafe',    label: '카페',   emoji: '☕' },
  { id: 'date',    label: '놀거리', emoji: '🎡' },
  { id: 'culture', label: '문화',   emoji: '🎬' },
  { id: 'nature',  label: '산책',   emoji: '🚶' },
  { id: 'shop',    label: '쇼핑',   emoji: '🛍️' },
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
