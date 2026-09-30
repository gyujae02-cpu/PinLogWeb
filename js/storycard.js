// 인스타그램 스토리용 카드(1080×1920)를 캔버스에 그린다.
// photo.js 처럼 아무것도 import 하지 않는 말단 모듈이다.
// 로그인 화면의 다크 글래스와 같은 재료(흰 10% 유리 · 흰 22% 테두리 · 블루 틴트)를 쓴다.

export const STORY_W = 1080;
export const STORY_H = 1920;

const FONT = "'Sebang Gothic', system-ui, -apple-system, sans-serif";

// 스토리는 위(프로필) · 아래(답장 입력창)를 앱 UI 가 덮는다. 이 안쪽에만 중요한 걸 둔다.
const SAFE_TOP    = 250;
const SAFE_BOTTOM = STORY_H - 300;

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
const FAV_INK  = '#FFDCE6';
const HASH_INK = '#BFE2FF';

const PIN_PATH   = 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z';
const HEART_PATH = 'M12 20.6s-7.4-4.5-9.4-9.1C1 7.9 3.1 4.4 6.6 4.4c2.1 0 3.6 1.1 5.4 3 1.8-1.9 3.3-3 5.4-3 3.5 0 5.6 3.5 4 7.1-2 4.6-9.4 9.1-9.4 9.1z';

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
function blurredBackdrop(img) {
  const tiny = document.createElement('canvas');
  tiny.width = 27; tiny.height = 48;
  let step = document.createElement('canvas');
  step.width = 216; step.height = 384;

  const sctx = step.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  drawCover(sctx, img, 0, 0, step.width, step.height);

  const tctx = tiny.getContext('2d');
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(step, 0, 0, tiny.width, tiny.height);

  const mid = document.createElement('canvas');
  mid.width = 135; mid.height = 240;
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

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(blurredBackdrop(img), 0, 0, STORY_W, STORY_H);

  // 가독성 스크림 + 브랜드 블루 틴트 (로그인 화면과 같은 값)
  const scrim = ctx.createLinearGradient(0, 0, 0, STORY_H);
  scrim.addColorStop(0,    'rgba(6,20,34,.60)');
  scrim.addColorStop(0.28, 'rgba(6,20,34,.26)');
  scrim.addColorStop(0.58, 'rgba(6,20,34,.38)');
  scrim.addColorStop(1,    'rgba(6,20,34,.72)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  ctx.fillStyle = 'rgba(11,111,181,.20)';
  ctx.fillRect(0, 0, STORY_W, STORY_H);
}

// 색 테마 배경. 유리 뒤에 비칠 게 있어야 투명해 보여서
// 바탕색 위로 창문 빛처럼 사선 빛줄기를 깐다. 블러 대신 가로 그라데이션으로 가장자리를 푼다.
const BEAMS = [
  { x: 216, w: 324, a: 0.20 },
  { x: 648, w: 184, a: 0.15 },
  { x: 918, w: 130, a: 0.11 }
];

function paintLightBeams(ctx, colors) {
  if (colors.length === 1) {
    ctx.fillStyle = colors[0];
  } else {
    // 왼쪽 위에서 오른쪽 아래로 살짝 기울여 흐르게 한다.
    const g = ctx.createLinearGradient(0, 0, STORY_W * 0.45, STORY_H);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  const cy = STORY_H * 0.48;
  const len = STORY_H * 1.6;
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
  const shade = ctx.createLinearGradient(0, 0, 0, STORY_H);
  shade.addColorStop(0,    'rgba(0,0,0,.35)');
  shade.addColorStop(0.25, 'rgba(0,0,0,0)');
  shade.addColorStop(0.75, 'rgba(0,0,0,0)');
  shade.addColorStop(1,    'rgba(0,0,0,.40)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
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

// 카드 안 글자 영역을 미리 재서 높이를 알아낸다. 그리기는 draw 콜백이 한다.
function layoutText(ctx, card) {
  const blocks = [];

  if (card.favNote) {
    blocks.push({ h: 60, gap: 30, draw: (y) => {
      drawIcon(ctx, HEART_PATH, TEXT_X, y + 12, 36, FAV_INK);
      ctx.font = font(400, 33);
      ctx.fillStyle = FAV_INK;
      ctx.textBaseline = 'middle';
      ctx.fillText(ellipsize(ctx, card.favNote, TEXT_W - 46), TEXT_X + 46, y + 31);
      ctx.textBaseline = 'alphabetic';
    } });
  }

  ctx.font = font(400, 72);
  const nameLines = clampLines(ctx, card.name, TEXT_W, 2);
  const nameLH = 86;
  blocks.push({ h: nameLines.length * nameLH, gap: 18, draw: (y) => {
    ctx.font = font(400, 72);
    ctx.fillStyle = INK;
    nameLines.forEach((l, i) => ctx.fillText(l, TEXT_X - 2, y + 69 + i * nameLH));
  } });

  if (card.address) {
    blocks.push({ h: 48, gap: 38, draw: (y) => {
      drawIcon(ctx, PIN_PATH, TEXT_X - 4, y + 4, 38, INK_DIM);
      ctx.font = font(300, 39);
      ctx.fillStyle = INK_DIM;
      ctx.fillText(ellipsize(ctx, card.address, TEXT_W - 48), TEXT_X + 44, y + 38);
    } });
  }

  if (card.tags && card.tags.length) {
    const hashNext = card.hashtags && card.hashtags.length;   // 해시태그는 칩에 바짝 붙인다
    blocks.push({ h: 66, gap: hashNext ? 22 : 38, draw: (y) => {
      let x = TEXT_X;
      for (const t of card.tags) {
        ctx.font = font(400, 33);
        const w = ctx.measureText(t).width + 56;
        if (x + w > TEXT_X + TEXT_W) break;
        x += pill(ctx, x, y, t, {
          size: 33, padX: 28, h: 66,
          fill: 'rgba(255,255,255,.10)', stroke: null, color: INK
        }) + 14;
      }
    } });
  }

  // 인스타처럼 태그 칩 아래 한 줄 글자로 이어 쓴다. 넘치면 두 줄까지.
  if (card.hashtags && card.hashtags.length) {
    ctx.font = font(400, 36);
    const lines = clampLines(ctx, card.hashtags.join(' '), TEXT_W, 2);
    const lh = 54;
    blocks.push({ h: lines.length * lh, gap: 34, draw: (y) => {
      ctx.font = font(400, 36);
      ctx.fillStyle = HASH_INK;
      lines.forEach((l, i) => ctx.fillText(l, TEXT_X, y + 40 + i * lh));
    } });
  }

  if (card.memo) {
    ctx.font = font(300, 41);
    const lines = clampLines(ctx, `“${card.memo.trim()}”`, TEXT_W, 3);
    const lh = 62;
    blocks.push({ h: lines.length * lh, gap: 0, draw: (y) => {
      ctx.font = font(300, 41);
      ctx.fillStyle = INK_SOFT;
      lines.forEach((l, i) => ctx.fillText(l, TEXT_X, y + 45 + i * lh));
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
  ctx.rect(0, 0, STORY_W, STORY_H);
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
    const s = Math.min(h * 0.46, 240);
    drawIcon(ctx, PIN_PATH, x + (w - s) / 2, y + (h - s) / 2, s, 'rgba(255,255,255,.78)');
  }
  ctx.restore();

  roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.stroke();
}

// 메인 화면 왼쪽 위 'P(핀)nLog' 워드마크. 카드는 배경이 어두워서 알약 없이 전부 흰색으로 쓴다.
// 크기는 화면의 17px 글자를 BRAND_SCALE 배로 키운 값이다.
const BRAND_SCALE = 2.6;
const BRAND_INK   = INK;
const BRAND_STEM  = 'rgba(255,255,255,.72)';   // 로그인 화면 워드마크의 기둥과 같은 값

// index.html 의 .wordmark-pin (viewBox 0 0 10 20) 과 같은 모양. 아래 끝이 글자 기준선에 닿는다.
function drawWordmarkPin(ctx, x, baseline, em) {
  const w = em * 0.39;
  const h = em * 0.78;
  const s = w / 10;
  ctx.save();
  ctx.translate(x, baseline - h);
  ctx.scale(s, h / 20);
  roundRectPath(ctx, 3.7, 8, 2.6, 12, 1.3);
  ctx.fillStyle = BRAND_STEM;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(5, 5, 5, 0, Math.PI * 2);
  ctx.fillStyle = BRAND_INK;
  ctx.fill();
  ctx.restore();
  return w;
}

function paintBrand(ctx, x, cy) {
  const em = Math.round(17 * BRAND_SCALE);
  const gap = em * 0.04;

  ctx.save();
  ctx.font = font(400, em);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(-0.035 * em).toFixed(1)}px`;
  ctx.fillStyle = BRAND_INK;

  // 폰트 줄높이 1 기준으로 cy 에 가운데 맞춤
  const baseline = cy + em * 0.36;
  let tx = x;
  ctx.fillText('P', tx, baseline);
  tx += ctx.measureText('P').width + gap;
  tx += drawWordmarkPin(ctx, tx, baseline, em) + gap;
  ctx.fillText('nLog', tx, baseline);
  ctx.restore();
}

function paintHeader(ctx, dateText) {
  const cy = SAFE_TOP - 64;
  paintBrand(ctx, MARGIN, cy);

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
 * card: { name, address, dateText, favNote, tags: [label], hashtags: ['#…'], memo, photo: dataUrl | '',
 *         theme: 'photo' | 'charcoal' | 'blue' | 'rose' | 'dusk' }
 * address · memo 는 보여줄 때만 넘긴다(빈 값이면 줄 자체를 뺀다).
 */
export async function drawStoryCard(canvas, card) {
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext('2d');

  const sample = [card.name, card.address, card.memo, card.favNote, card.dateText,
    (card.tags || []).join(''), (card.hashtags || []).join(''), 'PinLog…“”#'].join('');
  const [img] = await Promise.all([loadImage(card.photo), ensureFonts(sample)]);

  ctx.clearRect(0, 0, STORY_W, STORY_H);
  paintBackground(ctx, img, card.theme || (img ? 'photo' : 'charcoal'));
  paintHeader(ctx, card.dateText);

  const { blocks, height: textH } = layoutText(ctx, card);

  // 사진 높이는 글자가 차지하고 남는 만큼 준다. 글이 길면 사진이 줄어든다.
  const avail = SAFE_BOTTOM - SAFE_TOP;
  const photoW = CARD_W - CARD_PAD * 2;
  const photoMax = img ? Math.round(photoW * (img.height > img.width ? 1.05 : 0.86)) : 420;
  const photoH = Math.max(img ? 460 : 320, Math.min(photoMax, avail - textH - CARD_PAD * 2 - 44));
  const cardH = CARD_PAD + photoH + 44 + textH + CARD_PAD + 20;

  const cardY = Math.round(SAFE_TOP + Math.max(0, (avail - cardH) / 2));

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
