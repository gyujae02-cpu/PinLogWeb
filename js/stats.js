// 통계 팝업에 쓰는 숫자를 핀·코스 목록에서 계산한다.
// tags.js · users.js 만 가져오는 말단 모듈이라 어디서 import 해도 순환 참조가 없다.

import { TAGS } from './tags.js';
import { normalizeId } from './users.js';

export const MONTHS_SHOWN = 12;
export const REGIONS_SHOWN = 5;

// 카카오는 같은 시/도를 '서울' 로 줄여 주기도 하고 '서울특별시' 로 다 쓰기도 한다.
// 둘이 다른 그룹으로 갈리지 않도록 짧은 쪽으로 맞춘다.
const PROVINCE_ALIAS = {
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
export function provinceOf(address) {
  const first = String(address || '').trim().split(/\s+/)[0];
  if (!first) return '';
  return PROVINCE_ALIAS[first] || first;
}

// 시/도 다음 토큰이 시·군·구면 붙인다. ('서울 마포구 …' → '서울 마포구')
// 세종처럼 바로 도로명이 오는 곳은 시/도만 쓴다.
function districtOf(address) {
  const tokens = String(address || '').trim().split(/\s+/);
  const province = provinceOf(address);
  if (!province) return '';

  const next = tokens[1] || '';
  return /[시군구]$/.test(next) ? `${province} ${next}` : province;
}

function parseDateValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function monthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function computeStats(pins, courses, now = new Date()) {
  const list = Array.isArray(pins) ? pins : [];
  const visitedPins = list.filter((p) => p.category === 'visited');

  const total   = list.length;
  const visited = visitedPins.length;

  const summary = {
    total,
    visited,
    wish: total - visited,
    rate: total ? Math.round((visited / total) * 100) : 0,
    photos:    list.reduce((n, p) => n + (p.photoCount || 0), 0),
    comments:  list.reduce((n, p) => n + (p.commentCount || 0), 0),
    favorites: list.filter((p) => p.favoritedBy.length > 0).length
  };

  // 다녀온 날이 적힌 가본 곳만 센다.
  const dated = visitedPins
    .map((p) => ({ pin: p, date: parseDateValue(p.visitedAt) }))
    .filter((x) => x.date);

  const byMonth = new Map();
  dated.forEach(({ date }) => {
    const key = monthKey(date.getFullYear(), date.getMonth());
    byMonth.set(key, (byMonth.get(key) || 0) + 1);
  });

  // 이번 달까지 거꾸로 12칸. 비어 있는 달도 0 으로 채운다.
  const months = [];
  for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d.getFullYear(), d.getMonth());
    months.push({
      key,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      count: byMonth.get(key) || 0
    });
  }

  // 가장 많이 다닌 달은 12칸 밖까지 통틀어 찾는다. 같으면 최근 달.
  let bestMonth = null;
  byMonth.forEach((count, key) => {
    if (!bestMonth || count > bestMonth.count || (count === bestMonth.count && key > bestMonth.key)) {
      bestMonth = { key, count };
    }
  });
  if (bestMonth) {
    const [y, m] = bestMonth.key.split('-').map(Number);
    bestMonth = { ...bestMonth, year: y, month: m };
  }

  // 태그는 핀 하나에 최대 3개라 합이 핀 수보다 클 수 있다.
  const tagCounts = new Map();
  list.forEach((p) => p.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
  const tags = TAGS
    .map((t) => ({ ...t, count: tagCounts.get(t.id) || 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  // 자주 간 지역은 가본 곳만.
  const regionCounts = new Map();
  visitedPins.forEach((p) => {
    const name = districtOf(p.address);
    if (name) regionCounts.set(name, (regionCounts.get(name) || 0) + 1);
  });
  const regions = [...regionCounts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
    .slice(0, REGIONS_SHOWN);

  const byCreated = list
    .filter((p) => p.createdAt instanceof Date && !Number.isNaN(p.createdAt.getTime()))
    .sort((a, b) => a.createdAt - b.createdAt);
  const firstPin = byCreated[0] ? { pin: byCreated[0], date: byCreated[0].createdAt } : null;

  const latest = dated.slice().sort((a, b) => b.date - a.date)[0] || null;
  const latestVisit = latest ? { pin: latest.pin, date: latest.date } : null;

  const userCounts = new Map();
  list.forEach((p) => {
    const id = normalizeId(p.createdBy);
    if (id) userCounts.set(id, (userCounts.get(id) || 0) + 1);
  });
  const users = [...userCounts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  const courseList = Array.isArray(courses) ? courses : [];
  const coursesDone = courseList.filter((c) => c.status === 'done').length;

  return {
    summary,
    months,
    bestMonth,
    tags,
    regions,
    firstPin,
    latestVisit,
    users,
    courses: { total: courseList.length, done: coursesDone, planned: courseList.length - coursesDone }
  };
}
