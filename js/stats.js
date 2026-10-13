// 통계 팝업에 쓰는 숫자를 핀·코스 목록에서 계산한다.
// tags.js · users.js 만 가져오는 말단 모듈이라 어디서 import 해도 순환 참조가 없다.

import { TAGS } from './tags.js';
import { normalizeId } from './users.js';

// 만난 날을 1일로 센다.
export const MET_ON = new Date(2026, 7, 27);   // 월은 0부터 — 2026.08.27

const DAY = 86400000;

export const REGIONS_SHOWN = 5;
export const WISHES_SHOWN = 3;

// 기간이 이보다 짧으면 주 단위, 길면 월 단위로 묶는다.
const WEEKLY_UNDER_DAYS = 92;
const MONTHS_MAX = 12;

const PIN_MILESTONES = [5, 10, 20, 30, 50, 77, 100, 150, 200, 300, 500, 1000];
const DAY_MILESTONES = [100, 200, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000, 1095, 1461, 1826, 2000, 3000];

// 월요일부터 — 한국 달력과 같은 순서.
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

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

function midnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 시분초가 섞인 값을 그냥 나누면 오후에 하루 모자라게 나온다.
// 양쪽 다 로컬 자정으로 내려서 뺀다.
function daysBetween(a, b) {
  return Math.round((midnight(b) - midnight(a)) / DAY);
}

export function daysTogether(now = new Date()) {
  return daysBetween(MET_ON, now) + 1;
}

// 그 주의 월요일 자정.
function weekStart(d) {
  const day = midnight(d);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 만난 날(그보다 이른 방문이 있으면 그 날)부터 오늘까지를 주 또는 월로 나눈다.
// 짧은 기간을 월로 묶으면 막대가 한두 개뿐이라, 석 달이 안 되면 주로 쪼갠다.
function visitSeries(dated, now) {
  const earliest = dated.reduce((min, x) => (x.date < min ? x.date : min), MET_ON);
  const today = midnight(now);
  const weekly = daysBetween(earliest, today) < WEEKLY_UNDER_DAYS;

  const buckets = [];
  if (weekly) {
    for (let d = weekStart(earliest); d <= today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
      buckets.push({ key: d.toISOString(), start: d, count: 0 });
    }
    const index = new Map(buckets.map((b, i) => [b.start.getTime(), i]));
    dated.forEach(({ date }) => {
      const i = index.get(weekStart(date).getTime());
      if (i != null) buckets[i].count++;
    });
  } else {
    let d = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    // 1년이 넘으면 최근 12개월만 그린다.
    const floor = new Date(today.getFullYear(), today.getMonth() - (MONTHS_MAX - 1), 1);
    if (d < floor) d = floor;
    for (; d <= today; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      buckets.push({ key: monthKey(d), start: d, count: 0 });
    }
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    dated.forEach(({ date }) => {
      const i = index.get(monthKey(date));
      if (i != null) buckets[i].count++;
    });
  }

  // 가장 많이 다닌 칸. 같으면 최근 것.
  let best = null;
  buckets.forEach((b) => { if (b.count && (!best || b.count >= best.count)) best = b; });

  return { unit: weekly ? 'week' : 'month', buckets, best };
}

function weekdayStats(dated) {
  const counts = WEEKDAYS.map((label) => ({ label, count: 0 }));
  dated.forEach(({ date }) => { counts[(date.getDay() + 6) % 7].count++; });

  const max = Math.max(0, ...counts.map((c) => c.count));
  const top = max ? counts.filter((c) => c.count === max).map((c) => c.label) : [];
  const weekend = counts[5].count + counts[6].count;

  return {
    days: counts,
    top,
    weekendRate: dated.length ? Math.round((weekend / dated.length) * 100) : 0
  };
}

function milestones(visited, now) {
  const nextPins = PIN_MILESTONES.find((n) => n > visited) || null;
  const prevPins = [...PIN_MILESTONES].reverse().find((n) => n <= visited) || 0;

  const day = daysTogether(now);
  const isToday = DAY_MILESTONES.includes(day) ? day : null;
  const nextDay = DAY_MILESTONES.find((n) => n > day) || null;

  return {
    pins: nextPins && {
      target: nextPins,
      left: nextPins - visited,
      // 직전 목표부터 다음 목표까지 얼마나 왔는지.
      progress: Math.round(((visited - prevPins) / (nextPins - prevPins)) * 100)
    },
    day: {
      today: day,
      reachedToday: isToday,
      next: nextDay && {
        target: nextDay,
        left: nextDay - day,
        date: new Date(MET_ON.getFullYear(), MET_ON.getMonth(), MET_ON.getDate() + nextDay - 1)
      }
    }
  };
}

export function computeStats(pins, courses, now = new Date()) {
  const list = Array.isArray(pins) ? pins : [];
  const visitedPins = list.filter((p) => p.category === 'visited');
  const wishPins = list.filter((p) => p.category !== 'visited');

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

  // 다녀온 날이 적힌 가본 곳만 센다. 아직 오지 않은 날짜는 뺀다.
  const today = midnight(now);
  const dated = visitedPins
    .map((p) => ({ pin: p, date: parseDateValue(p.visitedAt) }))
    .filter((x) => x.date && x.date <= today);

  // 태그는 핀 하나에 최대 3개라 합이 핀 수보다 클 수 있다.
  const tagCounts = new Map();
  list.forEach((p) => p.tags.forEach((t) => {
    const c = tagCounts.get(t) || { visited: 0, wish: 0 };
    if (p.category === 'visited') c.visited++; else c.wish++;
    tagCounts.set(t, c);
  }));
  const tags = TAGS
    .map((t) => {
      const c = tagCounts.get(t.id) || { visited: 0, wish: 0 };
      return { ...t, visited: c.visited, wish: c.wish, count: c.visited + c.wish };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || b.visited - a.visited);

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

  const hasCreated = (p) => p.createdAt instanceof Date && !Number.isNaN(p.createdAt.getTime());

  const byCreated = list.filter(hasCreated).sort((a, b) => a.createdAt - b.createdAt);
  const firstPin = byCreated[0] ? { pin: byCreated[0], date: byCreated[0].createdAt } : null;

  const latest = dated.slice().sort((a, b) => b.date - a.date)[0] || null;
  const latestVisit = latest ? { pin: latest.pin, date: latest.date } : null;

  // 담아만 두고 가장 오래 못 간 가볼 곳.
  const oldWishes = wishPins
    .filter(hasCreated)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, WISHES_SHOWN)
    .map((p) => ({ pin: p, days: Math.max(0, daysBetween(p.createdAt, now)) }));

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
    milestones: milestones(visited, now),
    visits: visitSeries(dated, now),
    weekdays: weekdayStats(dated),
    tags,
    regions,
    oldWishes,
    wishTotal: wishPins.length,
    firstPin,
    latestVisit,
    users,
    courses: { total: courseList.length, done: coursesDone, planned: courseList.length - coursesDone }
  };
}
