export const USER_COLORS = {
  gyu: 'blue',
  hye: 'pink'
};

export const USER_NAMES = {
  gyu: '재규',
  hye: '다혜'
};

const PALETTE = [
  { key: 'blue',    dot: '#2563EB', soft: '#DBEAFE', text: '#1D4ED8' },
  { key: 'pink',    dot: '#EC4899', soft: '#FCE7F3', text: '#BE185D' },
  { key: 'amber',   dot: '#F59E0B', soft: '#FEF3C7', text: '#B45309' },
  { key: 'emerald', dot: '#10B981', soft: '#D1FAE5', text: '#047857' },
  { key: 'violet',  dot: '#8B5CF6', soft: '#EDE9FE', text: '#6D28D9' },
  { key: 'orange',  dot: '#F97316', soft: '#FFEDD5', text: '#C2410C' },
  { key: 'cyan',    dot: '#06B6D4', soft: '#CFFAFE', text: '#0E7490' },
  { key: 'indigo',  dot: '#6366F1', soft: '#E0E7FF', text: '#4338CA' }
];

const BY_KEY = new Map(PALETTE.map((c) => [c.key, c]));

const FALLBACK = { key: 'slate', dot: '#94A3B8', soft: '#F1F5F9', text: '#475569' };

export function normalizeId(id) {
  return String(id || '').split('@')[0].trim().toLowerCase();
}

export function displayName(id) {
  const key = normalizeId(id);
  return USER_NAMES[key] || key;
}

export function userColor(id) {
  const key = normalizeId(id);
  if (!key) return FALLBACK;

  const named = USER_COLORS[key];
  if (named && BY_KEY.has(named)) return BY_KEY.get(named);

  return PALETTE[hashCode(key) % PALETTE.length];
}

function hashCode(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function collectUsers(pins, myId) {
  const set = new Set();

  (pins || []).forEach((p) => {
    const key = normalizeId(p.createdBy);
    if (key) set.add(key);
  });

  const me = normalizeId(myId);
  if (me) set.add(me);

  return [...set].sort();
}
