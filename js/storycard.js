// 인스타그램용 카드를 캔버스에 그린다. 스토리(9:16) · 피드(4:5 · 1:1) 세 가지 비율.
// photo.js 처럼 아무것도 import 하지 않는 말단 모듈이다.
// 로그인 화면의 다크 글래스와 같은 재료(흰 10% 유리 · 흰 22% 테두리 · 블루 틴트)를 쓴다.
// 너비는 모두 1080 이고 높이만 다르다. 그리는 함수들은 높이를 ctx.canvas.height 에서 읽는다.

const STORY_W = 1080;

const FONT = "'Sebang Gothic', system-ui, -apple-system, sans-serif";

// top 은 카드를 놓을 세로 범위의 위(헤더 로고 아래 설명 줄이 있으면 TAGLINE_ROOM 만큼 더 내린다),
// headerY 는 PinLog · 날짜 줄의 가운데, footerY 는 맨 아래 저작권 줄의 기준선. 카드는 그 위까지만 쓴다.
// 스토리는 위(프로필) · 아래(답장 입력창)를 앱 UI 가 덮어서 넉넉히 비운다. 피드는 가리는 게 없다.
// 피드는 세로가 좁아 글이 많으면 LAYOUT_STEPS 순서로 줄 수를 줄여 넣는다.
export const CARD_FORMATS = {
  story:  { h: 1920, headerY: 186, top: 250, footerY: 1600, photoMin: 460, emptyPhoto: 460, emptyMin: 320 },
  feed45: { h: 1350, headerY: 96,  top: 168, footerY: 1306, photoMin: 300, emptyPhoto: 410, emptyMin: 240 },
  square: { h: 1080, headerY: 88,  top: 146, footerY: 1040, photoMin: 200, emptyPhoto: 320, emptyMin: 200 }
};

// 서비스 설명은 로고 바로 아래에 붙는다(사진이 있으면 왼쪽 위 로고, 없으면 사진 자리 큰 로고).
const TAGLINE      = '너와 나의 모든 장소';
const TAGLINE_INK  = 'rgba(255,255,255,.60)';
const TAGLINE_ROOM = 40;    // 왼쪽 위 로고 아래 설명 줄 때문에 카드를 내리는 만큼
const COPYRIGHT    = '© 2026 JAEGYU LEE';
const FOOTER_ROOM  = 70;    // 저작권 기준선에서 카드 아래 끝까지 (한 줄 높이 + 카드와의 간격)

// 이름 · 주소 · 태그 · 해시태그 · 메모는 길면 모두 두 줄까지 넘긴다(태그는 칩 두 줄).
// 카드에 다 안 들어가면 먼저 글자를 조금씩 줄이고(TEXT_SCALES),
// 가장 작게 해도 넘칠 때만 LINE_CUTS 순서로 한 줄로 줄인다.
const FULL_LINES  = { name: 2, addr: 2, tags: 2, hash: 2, memo: 2 };
const TEXT_SCALES = [1, 0.94, 0.88, 0.82, 0.76];
const LINE_CUTS = [
  { name: 2, addr: 2, tags: 2, hash: 2, memo: 1 },
  { name: 2, addr: 2, tags: 2, hash: 1, memo: 1 },
  { name: 2, addr: 2, tags: 1, hash: 1, memo: 1 },
  { name: 1, addr: 2, tags: 1, hash: 1, memo: 1 },
  { name: 1, addr: 1, tags: 1, hash: 1, memo: 1 }
];

const MARGIN = 72;
const CARD_X = MARGIN;
const CARD_W = STORY_W - MARGIN * 2;
const CARD_PAD = 36;
const CARD_R = 88;
const TEXT_X = CARD_X + CARD_PAD + 20;
const TEXT_W = CARD_W - (CARD_PAD + 20) * 2;

const INK      = '#FFFFFF';
const INK_DIM  = 'rgba(255,255,255,.62)';
const INK_SOFT = 'rgba(255,255,255,.80)';
const HASH_INK = '#BFE2FF';

const PIN_PATH   = 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z';

const imageCache = new Map();

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);

  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

// 폰트가 늦게 오면 기본 서체로 찍힌다. 실제로 쓸 글자를 넘겨 해당 서브셋까지 받아둔다.
async function ensureFonts(sample) {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([300, 400].map((w) => document.fonts.load(`${w} 40px ${FONT}`, sample)));
  } catch { /* 폰트가 없어도 기본 서체로 그린다 */ }
}

function font(weight, size) {
  return `${weight} ${size}px ${FONT}`;
}

// keep 이면 지금 경로에 이어 붙인다(바깥 사각형과 합쳐 evenodd 로 구멍을 낼 때).
function roundRectPath(ctx, x, y, w, h, r, keep = false) {
  const rr = Math.min(r, w / 2, h / 2);
  if (!keep) ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 이미지를 (x, y, w, h) 칸에 꽉 채우고 넘치는 부분은 가운데 기준으로 잘라낸다.
function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

// ctx.filter 는 구형 iOS Safari 에 없다. 아주 작게 줄였다가 단계적으로 키우면
// 어느 브라우저에서나 같은 블러가 나온다.
function blurredBackdrop(img, H) {
  const k = H / STORY_W;   // 캔버스 비율대로 줄여야 늘어나 보이지 않는다
  const tiny = document.createElement('canvas');
  tiny.width = 27; tiny.height = Math.round(27 * k);
  const step = document.createElement('canvas');
  step.width = 216; step.height = Math.round(216 * k);

  const sctx = step.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  drawCover(sctx, img, 0, 0, step.width, step.height);

  const tctx = tiny.getContext('2d');
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(step, 0, 0, tiny.width, tiny.height);

  const mid = document.createElement('canvas');
  mid.width = 135; mid.height = Math.round(135 * k);
  const mctx = mid.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(tiny, 0, 0, mid.width, mid.height);

  return mid;
}

// 배경 테마. 'photo' 는 사진을 흐리게 깔고, 나머지는 색 위에 빛줄기를 얹는다.
// 글자 · 유리 카드가 흰색 기준이라 모두 어두운 톤으로만 둔다.
const THEME_COLORS = {
  charcoal: ['#0F1114'],
  blue:     ['#04192C', '#0A3F6B', '#0B5E9C'],
  rose:     ['#240914', '#5A1631', '#8A2A4E'],
  dusk:     ['#1B1238', '#5A1E5C', '#A8492F']
};

function paintBackground(ctx, img, theme) {
  if (theme !== 'photo' || !img) {
    paintLightBeams(ctx, THEME_COLORS[theme] || THEME_COLORS.charcoal);
    return;   // 스크림 · 틴트는 사진용이다
  }

  const H = ctx.canvas.height;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(blurredBackdrop(img, H), 0, 0, STORY_W, H);

  // 가독성 스크림 + 브랜드 블루 틴트 (로그인 화면과 같은 값)
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0,    'rgba(6,20,34,.60)');
  scrim.addColorStop(0.28, 'rgba(6,20,34,.26)');
  scrim.addColorStop(0.58, 'rgba(6,20,34,.38)');
  scrim.addColorStop(1,    'rgba(6,20,34,.72)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, STORY_W, H);

  ctx.fillStyle = 'rgba(11,111,181,.20)';
  ctx.fillRect(0, 0, STORY_W, H);
}

// 색 테마 배경. 유리 뒤에 비칠 게 있어야 투명해 보여서
// 바탕색 위로 창문 빛처럼 사선 빛줄기를 깐다. 블러 대신 가로 그라데이션으로 가장자리를 푼다.
const BEAMS = [
  { x: 216, w: 324, a: 0.20 },
  { x: 648, w: 184, a: 0.15 },
  { x: 918, w: 130, a: 0.11 }
];

function paintLightBeams(ctx, colors) {
  const H = ctx.canvas.height;
  if (colors.length === 1) {
    ctx.fillStyle = colors[0];
  } else {
    // 왼쪽 위에서 오른쪽 아래로 살짝 기울여 흐르게 한다.
    const g = ctx.createLinearGradient(0, 0, STORY_W * 0.45, H);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, STORY_W, H);

  const cy = H * 0.48;
  const len = Math.max(H, STORY_W) * 1.6;
  for (const b of BEAMS) {
    ctx.save();
    ctx.translate(b.x + b.w / 2, cy);
    ctx.rotate((28 * Math.PI) / 180);

    const g = ctx.createLinearGradient(-b.w, 0, b.w, 0);
    g.addColorStop(0,    'rgba(255,255,255,0)');
    g.addColorStop(0.5,  `rgba(255,255,255,${b.a})`);
    g.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-b.w, -len / 2, b.w * 2, len);
    ctx.restore();
  }

  // 위아래를 살짝 눌러 헤더 · 문구가 빛에 묻히지 않게 한다.
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0,    'rgba(0,0,0,.35)');
  shade.addColorStop(0.25, 'rgba(0,0,0,0)');
  shade.addColorStop(0.75, 'rgba(0,0,0,0)');
  shade.addColorStop(1,    'rgba(0,0,0,.40)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, STORY_W, H);
}

function drawIcon(ctx, pathStr, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(pathStr), 'evenodd');
  ctx.restore();
}

// 한글은 글자 단위로 끊어도 되지만, 공백이 있으면 공백에서 끊는 쪽이 읽기 좋다.
function wrapLines(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split(/\n/)) {
    let line = '';
    for (const ch of para) {
      const next = line + ch;
      if (ctx.measureText(next).width <= maxW || !line) { line = next; continue; }

      const sp = line.lastIndexOf(' ');
      if (ch !== ' ' && sp > line.length * 0.5) {
        lines.push(line.slice(0, sp));
        line = line.slice(sp + 1) + ch;
      } else {
        lines.push(line.trimEnd());
        line = ch === ' ' ? '' : ch;
      }
    }
    lines.push(line.trimEnd());
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

function clampLines(ctx, text, maxW, maxLines) {
  const lines = wrapLines(ctx, text, maxW);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  out[maxLines - 1] = ellipsize(ctx, out[maxLines - 1] + '…', maxW);
  return out;
}

function pill(ctx, x, y, text, { size, padX, h, fill, stroke, color }) {
  ctx.font = font(400, size);
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

// 태그 칩을 너비에 맞춰 줄마다 나눈다. maxRows 를 넘는 칩은 뺀다(칩은 중간에 자를 수 없다).
function tagRows(ctx, tags, size, padX, gap, maxRows) {
  ctx.font = font(400, size);
  const rows = [[]];
  let x = 0;
  for (const t of tags) {
    const w = Math.ceil(ctx.measureText(t).width) + padX * 2;
    if (x > 0 && x + w > TEXT_W) {
      if (rows.length >= maxRows) break;
      rows.push([]);
      x = 0;
    }
    if (w > TEXT_W) continue;   // 한 칩이 한 줄보다 길면 넣지 않는다
    rows[rows.length - 1].push(t);
    x += w + gap;
  }
  return rows.filter((r) => r.length);
}

// 카드 안 글자 영역을 미리 재서 높이를 알아낸다. 그리기는 draw 콜백이 한다.
// max 는 항목별 최대 줄 수, k 는 글자 · 줄 간격 배율(1 이 기본 크기).
function layoutText(ctx, card, max, k = 1) {
  const s = (v) => Math.round(v * k);
  const blocks = [];

  const nameSize = s(72), nameLH = s(86);
  ctx.font = font(400, nameSize);
  const nameLines = clampLines(ctx, card.name, TEXT_W, max.name);
  blocks.push({ h: nameLines.length * nameLH, gap: s(18), draw: (y) => {
    ctx.font = font(400, nameSize);
    ctx.fillStyle = INK;
    nameLines.forEach((l, i) => ctx.fillText(l, TEXT_X - 2, y + s(69) + i * nameLH));
  } });

  // 둘째 줄도 핀 아이콘 오른쪽에 맞춰 들여 쓴다.
  if (card.address) {
    const size = s(39), lh = s(52), icon = s(38), indent = s(44);
    ctx.font = font(300, size);
    const lines = clampLines(ctx, card.address, TEXT_W - indent - 4, max.addr);
    blocks.push({ h: s(48) + (lines.length - 1) * lh, gap: s(38), draw: (y) => {
      drawIcon(ctx, PIN_PATH, TEXT_X - 4, y + s(4), icon, INK_DIM);
      ctx.font = font(300, size);
      ctx.fillStyle = INK_DIM;
      lines.forEach((l, i) => ctx.fillText(l, TEXT_X + indent, y + s(38) + i * lh));
    } });
  }

  if (card.tags && card.tags.length) {
    const size = s(33), padX = s(28), ph = s(66), gapX = s(14), gapY = s(12);
    const rows = tagRows(ctx, card.tags, size, padX, gapX, max.tags);
    if (rows.length) {
      const hashNext = card.hashtags && card.hashtags.length;   // 해시태그는 칩에 바짝 붙인다
      blocks.push({ h: rows.length * ph + (rows.length - 1) * gapY, gap: s(hashNext ? 22 : 38), draw: (y) => {
        rows.forEach((row, r) => {
          let x = TEXT_X;
          for (const t of row) {
            x += pill(ctx, x, y + r * (ph + gapY), t, {
              size, padX, h: ph,
              fill: 'rgba(255,255,255,.10)', stroke: null, color: INK
            }) + gapX;
          }
        });
      } });
    }
  }

  // 인스타처럼 태그 칩 아래 글자로 이어 쓴다.
  if (card.hashtags && card.hashtags.length) {
    const size = s(36), lh = s(54);
    ctx.font = font(400, size);
    const lines = clampLines(ctx, card.hashtags.join(' '), TEXT_W, max.hash);
    blocks.push({ h: lines.length * lh, gap: s(34), draw: (y) => {
      ctx.font = font(400, size);
      ctx.fillStyle = HASH_INK;
      lines.forEach((l, i) => ctx.fillText(l, TEXT_X, y + s(40) + i * lh));
    } });
  }

  if (card.memo) {
    const size = s(41), lh = s(62);
    ctx.font = font(300, size);
    const lines = clampLines(ctx, `“${card.memo.trim()}”`, TEXT_W, max.memo);
    blocks.push({ h: lines.length * lh, gap: 0, draw: (y) => {
      ctx.font = font(300, size);
      ctx.fillStyle = INK_SOFT;
      lines.forEach((l, i) => ctx.fillText(l, TEXT_X, y + s(45) + i * lh));
    } });
  }

  blocks[blocks.length - 1].gap = 0;
  const height = blocks.reduce((s, b) => s + b.h + b.gap, 0);
  return { blocks, height };
}

function paintGlass(ctx, y, h) {
  // 그림자는 카드 바깥에만 떨어뜨린다. 반투명 유리에 그대로 주면 안쪽이 탁해진다.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, STORY_W, ctx.canvas.height);
  roundRectPath(ctx, CARD_X, y, CARD_W, h, CARD_R, true);
  ctx.clip('evenodd');
  ctx.shadowColor = 'rgba(3,14,26,.50)';
  ctx.shadowBlur = 140;
  ctx.shadowOffsetY = 60;
  roundRectPath(ctx, CARD_X, y, CARD_W, h, CARD_R);
  ctx.fillStyle = '#061E33';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, CARD_X, y, CARD_W, h, CARD_R);
  ctx.clip();

  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.fillRect(CARD_X, y, CARD_W, h);

  // 로그인 카드의 sheen — 대각선으로 한 번 스치는 빛
  const sheen = ctx.createLinearGradient(CARD_X, y, CARD_X + CARD_W, y + h * 0.6);
  sheen.addColorStop(0.30, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.46, 'rgba(255,255,255,.07)');
  sheen.addColorStop(0.62, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(CARD_X, y, CARD_W, h);

  ctx.fillStyle = 'rgba(255,255,255,.26)';
  ctx.fillRect(CARD_X, y, CARD_W, 3);
  ctx.restore();

  roundRectPath(ctx, CARD_X + 1, y + 1, CARD_W - 2, h - 2, CARD_R - 1);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.stroke();
}

function paintPhoto(ctx, img, x, y, w, h) {
  const r = CARD_R - CARD_PAD;
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  if (img) {
    ctx.imageSmoothingQuality = 'high';
    drawCover(ctx, img, x, y, w, h);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(x, y, w, h);
    // 사진이 없으면 로그인 화면 로고 색의 'P(핀)nLog' 워드마크와 설명 한 줄을 묶어 가운데에 둔다.
    const em = Math.round(Math.min(h * 0.3, w * 0.16));
    const tagSize = Math.max(24, Math.round(em * 0.3));
    const gap = Math.round(em * 0.28);
    const top = y + (h - (em + gap + tagSize)) / 2;   // 로고 + 간격 + 설명 묶음의 위 끝
    paintBrand(ctx, x + (w - brandWidth(ctx, em)) / 2, top + em / 2, em, BRAND_ACCENT);

    ctx.font = font(300, tagSize);
    ctx.fillStyle = TAGLINE_INK;
    ctx.textAlign = 'center';
    ctx.fillText(TAGLINE, x + w / 2, top + em + gap + tagSize * 0.86);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.stroke();
}

// 메인 화면 왼쪽 위 'P(핀)nLog' 워드마크. 크기는 화면의 17px 글자를 BRAND_SCALE 배로 키운 값이다.
// 헤더는 전부 흰색(BRAND_WHITE), 사진 없는 자리는 로그인 화면 로고 색(BRAND_ACCENT)을 쓴다.
// 메인 로고의 진한 파랑(--brand-600)은 어두운 카드에 묻혀서, 어두운 배경용인 로그인 화면 값을 따른다.
const BRAND_SCALE = 2.6;
const BRAND_WHITE  = { ink: INK, pin: INK, log: INK, stem: 'rgba(255,255,255,.72)', shine: null };
const BRAND_ACCENT = { ink: INK, pin: '#B8DEFF', log: '#B8DEFF', stem: 'rgba(255,255,255,.72)', shine: 'rgba(255,255,255,.3)' };   // --brand-200

// index.html 의 .wordmark-pin (viewBox 0 0 10 20) 과 같은 모양. 아래 끝이 글자 기준선에 닿는다.
function drawWordmarkPin(ctx, x, baseline, em, c) {
  const w = em * 0.39;
  const h = em * 0.78;
  const s = w / 10;
  ctx.save();
  ctx.translate(x, baseline - h);
  ctx.scale(s, h / 20);
  roundRectPath(ctx, 3.7, 8, 2.6, 12, 1.3);
  ctx.fillStyle = c.stem;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(5, 5, 5, 0, Math.PI * 2);
  ctx.fillStyle = c.pin;
  ctx.fill();
  if (c.shine) {
    ctx.beginPath();
    ctx.arc(3.3, 3.3, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = c.shine;
    ctx.fill();
  }
  ctx.restore();
  return w;
}

function setBrandFont(ctx, em) {
  ctx.font = font(400, em);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(-0.035 * em).toFixed(1)}px`;
}

// 워드마크를 em 크기로 그렸을 때의 너비. 가운데 맞춤에 쓴다.
function brandWidth(ctx, em) {
  ctx.save();
  setBrandFont(ctx, em);
  const w = ctx.measureText('P').width + em * (0.04 * 2 + 0.39) + ctx.measureText('nLog').width;
  ctx.restore();
  return w;
}

function paintBrand(ctx, x, cy, em = Math.round(17 * BRAND_SCALE), c = BRAND_WHITE) {
  const gap = em * 0.04;

  ctx.save();
  setBrandFont(ctx, em);
  ctx.fillStyle = c.ink;

  // 폰트 줄높이 1 기준으로 cy 에 가운데 맞춤
  const baseline = cy + em * 0.36;
  let tx = x;
  ctx.fillText('P', tx, baseline);
  tx += ctx.measureText('P').width + gap;
  tx += drawWordmarkPin(ctx, tx, baseline, em, c) + gap;
  ctx.fillStyle = c.ink;
  ctx.fillText('n', tx, baseline);
  tx += ctx.measureText('n').width;
  ctx.fillStyle = c.log;
  ctx.fillText('Log', tx, baseline);
  ctx.restore();
}

// 맨 아래 가운데 저작권 한 줄. 서명처럼 작고 흐리게.
function paintFooter(ctx, baseline) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = font(400, 24);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.fillText(COPYRIGHT, STORY_W / 2, baseline);
  ctx.restore();
}

// 사진이 없으면 사진 자리에 큰 로고(+설명)가 들어가므로 왼쪽 위 로고 · 설명은 뺀다. 날짜는 그대로 둔다.
function paintHeader(ctx, cy, dateText, withBrand) {
  if (withBrand) {
    paintBrand(ctx, MARGIN, cy);
    ctx.font = font(300, 26);
    ctx.fillStyle = TAGLINE_INK;
    ctx.fillText(TAGLINE, MARGIN, cy + 62);
  }

  if (dateText) {
    ctx.font = font(400, 38);
    ctx.fillStyle = INK_DIM;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(dateText, STORY_W - MARGIN, cy + 2);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }
}

/**
 * card: { name, address, dateText, tags: [label], hashtags: ['#…'], memo, photo: dataUrl | '',
 *         theme: 'photo' | 'charcoal' | 'blue' | 'rose' | 'dusk',
 *         format: 'story' | 'feed45' | 'square' }
 * address · memo 는 보여줄 때만 넘긴다(빈 값이면 줄 자체를 뺀다).
 */
export async function drawStoryCard(canvas, card) {
  const F = CARD_FORMATS[card.format] || CARD_FORMATS.story;
  canvas.width = STORY_W;
  canvas.height = F.h;
  const ctx = canvas.getContext('2d');

  const sample = [card.name, card.address, card.memo, card.dateText,
    (card.tags || []).join(''), (card.hashtags || []).join(''), TAGLINE, COPYRIGHT, 'PinLog…“”#'].join('');
  const [img] = await Promise.all([loadImage(card.photo), ensureFonts(sample)]);

  ctx.clearRect(0, 0, STORY_W, F.h);
  paintBackground(ctx, img, card.theme || (img ? 'photo' : 'charcoal'));
  paintHeader(ctx, F.headerY, card.dateText, !!img);
  paintFooter(ctx, F.footerY);

  // 사진 높이는 글자가 차지하고 남는 만큼 준다. 글이 길면 사진이 먼저 줄고,
  // 사진이 최소 높이에 닿아도 넘치면 글자를 조금씩 줄이고, 그래도 넘치면 LINE_CUTS 로 줄 수를 줄인다.
  const top = F.top + (img ? TAGLINE_ROOM : 0);
  const avail = F.footerY - FOOTER_ROOM - top;
  const chrome = CARD_PAD * 2 + 44 + 20;   // 카드 위아래 여백 + 사진과 글 사이
  const photoW = CARD_W - CARD_PAD * 2;
  const photoMin = img ? F.photoMin : F.emptyMin;

  const fits = (l) => avail - chrome - l.height >= photoMin;
  let layout = null;
  for (const k of TEXT_SCALES) {
    const l = layoutText(ctx, card, FULL_LINES, k);
    if (fits(l)) { layout = l; break; }
  }
  if (!layout) {
    const k = TEXT_SCALES[TEXT_SCALES.length - 1];
    for (const step of LINE_CUTS) {
      layout = layoutText(ctx, card, step, k);
      if (fits(layout)) break;
    }
  }
  const { blocks, height: textH } = layout;

  const photoMax = img ? Math.round(photoW * (img.height > img.width ? 1.05 : 0.86)) : F.emptyPhoto;
  const photoH = Math.max(photoMin, Math.min(photoMax, avail - textH - chrome + 20));
  const cardH = chrome + photoH + textH;

  const cardY = Math.round(top + Math.max(0, (avail - cardH) / 2));

  paintGlass(ctx, cardY, cardH);
  paintPhoto(ctx, img, CARD_X + CARD_PAD, cardY + CARD_PAD, photoW, photoH);

  let y = cardY + CARD_PAD + photoH + 44;
  for (const b of blocks) {
    b.draw(y);
    y += b.h + b.gap;
  }
}

export function storyCardBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}
